"use server";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { buildOrderDraftForRateChange, buildRateImpactPreview } from "@/lib/rate-change-preview";
import { getBaseHourRate, getSchoolName, isOpHourlyPayEnabled, isPrHourlyPayEnabled } from "@/lib/settings-helpers";
import { buildPkImpactPreview } from "@/lib/payroll/impact-preview";
import { toTitleCaseRu } from "@/lib/format-name";
import { personFormSchema } from "@/lib/validation/schemas";
import { writeAudit, writeAuditTx } from "@/modules/audit-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

/** JSON для полей OrderDraft: без сбоев stringify на Decimal и пр. */
function jsonForOrderDraftDb(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v != null && typeof v === "object" && "toFixed" in v && typeof (v as { toFixed: (n: number) => string }).toFixed === "function") {
      return String(v);
    }
    return v as unknown;
  });
}

function toDec(s: string | undefined, fallback = "0"): Prisma.Decimal {
  const n = parseFloat((s ?? "").replace(",", "."));
  if (Number.isNaN(n)) return new Prisma.Decimal(fallback);
  return new Prisma.Decimal(String(n));
}

const EDUMED_LINKED_DELETE_MSG =
  "Нельзя удалить карточку, привязанную к учётной записи EDUMED. Используйте статус «В архиве» или снимите привязку в данных.";

export async function deletePerson(personId: string) {
  const p = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, systemUserId: true },
  });
  if (!p) {
    throw new Error("Запись не найдена");
  }
  if (p.systemUserId?.trim()) {
    throw new Error(EDUMED_LINKED_DELETE_MSG);
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDraft.deleteMany({
      where: {
        OR: [{ personId }, { recommendation: { personId } }],
      },
    });
    await tx.rateChangeApproval.updateMany({
      where: { approverPersonId: personId },
      data: { approverPersonId: null },
    });
    await tx.auditLog.updateMany({
      where: { actorPersonId: personId },
      data: { actorPersonId: null },
    });
    await tx.substitutionEntry.updateMany({
      where: { replacedPersonId: personId },
      data: { replacedPersonId: null },
    });
    await tx.person.delete({ where: { id: personId } });
  });

  revalidatePath("/people");
  revalidatePath("/candidates");
  revalidatePath("/");
}

export async function deletePersonFromForm(formData: FormData) {
  const personId = String(formData.get("id") ?? "").trim();
  if (!personId) {
    redirect("/people?err=" + encodeURIComponent("Не указана запись для удаления"));
  }
  try {
    await deletePerson(personId);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Не удалось удалить";
    redirect("/people?err=" + encodeURIComponent(msg));
  }
  redirect("/people");
}

export async function createPerson(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = personFormSchema.safeParse({
    ...raw,
    isVisibleInAccounting: formData.get("isVisibleInAccounting") === "on",
  });
  if (!parsed.success) {
    throw new Error(JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  const d = parsed.data;
  const fullName = toTitleCaseRu(d.fullName.trim());
  const person = await prisma.person.create({
    data: {
      fullName,
      email: d.email || null,
      phone: d.phone || null,
      status: d.status,
      employmentType: d.employmentType,
      workFormat: d.workFormat,
      officialCategoryId: d.officialCategoryId || null,
      internalCategoryId: d.internalCategoryId || null,
      currentPKLevelId: d.currentPKLevelId?.trim() || null,
      fixedPKLevelId: d.fixedPKLevelId?.trim() || null,
      recommendedPKLevelId: d.recommendedPKLevelId?.trim() || null,
      prLevelId: d.prLevelId?.trim() || null,
      opLevelId: d.opLevelId?.trim() || null,
      branchRuleId: d.branchRuleId?.trim() || null,
      baseHourRateOverride: d.baseHourRateOverride ? toDec(d.baseHourRateOverride) : null,
      isVisibleInAccounting: d.isVisibleInAccounting ?? true,
      notes: d.notes || null,
      canReceiveHourEntries: d.status === "active",
    },
  });
  if (d.employmentType === "labor_contract" && d.guaranteedMonthlyFixRub) {
    await prisma.employeeProfile.create({
      data: {
        personId: person.id,
        guaranteedMonthlyFixRub: toDec(d.guaranteedMonthlyFixRub),
      },
    });
  }
  await writeAudit({
    entityType: "Person",
    entityId: person.id,
    action: "create",
    before: null,
    after: { fullName: person.fullName },
    actorRole: "system_admin",
    reason: null,
  });
  revalidatePath("/people");
  revalidatePath("/");
  redirect(`/people/${person.id}`);
}

export async function updatePerson(personId: string, formData: FormData) {
  const before = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      currentPK: { include: { addon: true } },
      prLevel: { include: { addon: true } },
      opLevel: { include: { addon: true } },
      employeeProfile: true,
    },
  });
  if (!before) return { ok: false as const, error: "Не найден" };

  const raw = Object.fromEntries(formData.entries());
  const parsed = personFormSchema.safeParse({
    ...raw,
    isVisibleInAccounting: formData.get("isVisibleInAccounting") === "on",
  });
  if (!parsed.success) {
    return { ok: false as const, error: String(parsed.error.message) };
  }
  const d = parsed.data;
  const fullName = toTitleCaseRu(d.fullName.trim());

  await prisma.person.update({
    where: { id: personId },
    data: {
      fullName,
      email: d.email || null,
      phone: d.phone || null,
      status: d.status,
      employmentType: d.employmentType,
      workFormat: d.workFormat,
      officialCategoryId: d.officialCategoryId || null,
      internalCategoryId: d.internalCategoryId || null,
      currentPKLevelId: before.currentPKLevelId,
      fixedPKLevelId: d.fixedPKLevelId?.trim() || null,
      recommendedPKLevelId: d.recommendedPKLevelId?.trim() || null,
      prLevelId: d.prLevelId?.trim() || null,
      opLevelId: d.opLevelId?.trim() || null,
      branchRuleId: d.branchRuleId?.trim() || null,
      baseHourRateOverride: d.baseHourRateOverride ? toDec(d.baseHourRateOverride) : null,
      isVisibleInAccounting: d.isVisibleInAccounting ?? true,
      notes: d.notes || null,
      canReceiveHourEntries: d.status === "active",
    },
  });

  if (d.employmentType === "labor_contract") {
    const fixVal = d.guaranteedMonthlyFixRub ? toDec(d.guaranteedMonthlyFixRub) : new Prisma.Decimal(0);
    await prisma.employeeProfile.upsert({
      where: { personId },
      create: { personId, guaranteedMonthlyFixRub: fixVal },
      update: { guaranteedMonthlyFixRub: fixVal },
    });
  } else {
    await prisma.employeeProfile.deleteMany({ where: { personId } });
  }

  await writeAudit({
    entityType: "Person",
    entityId: personId,
    action: "update",
    before: {
      prLevelId: before.prLevelId,
      opLevelId: before.opLevelId,
      baseHourRateOverride: before.baseHourRateOverride?.toString(),
    },
    after: {
      prLevelId: d.prLevelId,
      opLevelId: d.opLevelId,
      baseHourRateOverride: d.baseHourRateOverride,
    },
    actorRole: "system_admin",
    reason: (formData.get("changeReason") as string) || null,
  });

  revalidatePath("/people");
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
  return { ok: true as const, orderDraft: undefined };
}

export async function applyFixedPkFromForm(formData: FormData) {
  const personId = (formData.get("personId") as string)?.trim();
  if (!personId) {
    redirect("/people?err=" + encodeURIComponent("Не указан сотрудник"));
  }
  const reason = (formData.get("pkApplyReason") as string)?.trim();
  if (!reason) {
    redirect(`/people/${personId}?err=${encodeURIComponent("Причина обязательна для изменения PK")}`);
  }
  try {
    await applyRecommendedPkInternal(personId, reason);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Не удалось применить PK";
    redirect(`/people/${personId}?err=${encodeURIComponent(msg)}`);
  }
  redirect(`/people/${personId}?ok=pk`);
}

/** Опции: `recommendationId` — применить именно эту запись (кнопка AI «Утвердить и применить»). */
export type ApplyRecommendedPkOptions = {
  recommendationId?: string;
};

/**
 * Применить рекомендованный PK к текущему и фиксированному (с приказом и аудитом).
 * Источник целевого PK: явная рекомендация → ожидающая AI-рекомендация → поле «PK рекомендованный» на карточке.
 */
export async function applyRecommendedPkInternal(
  personId: string,
  reason: string,
  opts?: ApplyRecommendedPkOptions,
) {
  const p = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      currentPK: { include: { addon: true } },
      recommendedPK: { include: { addon: true } },
      fixedPK: true,
      prLevel: { include: { addon: true } },
      opLevel: { include: { addon: true } },
    },
  });
  if (!p?.currentPK) throw new Error("Нет текущего PK");

  const pending = await prisma.rateChangeRecommendation.findFirst({
    where: { personId, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { proposedPK: { include: { addon: true } } },
  });

  let targetLevelId: string | null = null;
  let targetPk: NonNullable<typeof p.recommendedPK> | null = null;
  let linkedRecommendationId: string | null = null;

  if (opts?.recommendationId) {
    const rec = await prisma.rateChangeRecommendation.findUnique({
      where: { id: opts.recommendationId },
      include: { proposedPK: { include: { addon: true } } },
    });
    if (!rec || rec.personId !== personId) {
      throw new Error("Рекомендация не найдена");
    }
    if (rec.status !== "pending") {
      throw new Error("Рекомендация уже обработана");
    }
    if (!rec.proposedPKLevelId || !rec.proposedPK) {
      throw new Error("В рекомендации не задан целевой PK");
    }
    targetLevelId = rec.proposedPKLevelId;
    targetPk = rec.proposedPK;
    linkedRecommendationId = rec.id;
  } else {
    targetLevelId = pending?.proposedPKLevelId ?? p.recommendedPKLevelId ?? null;
    targetPk = pending?.proposedPK ?? p.recommendedPK ?? null;
    linkedRecommendationId = pending?.id ?? null;
  }

  if (!targetLevelId || !targetPk) {
    throw new Error("Нет рекомендаций");
  }

  if (targetLevelId === p.currentPKLevelId) {
    throw new Error("Рекомендованный PK совпадает с текущим — нет изменений для применения");
  }

  const base = await getBaseHourRate();
  const prOn = await isPrHourlyPayEnabled();
  const opOn = await isOpHourlyPayEnabled();

  const openRun = await prisma.payrollRun.findFirst({
    where: { status: "draft" },
    orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
    include: { period: true },
  });
  const hourRows = openRun
    ? await prisma.hourEntry.findMany({
        where: { personId, year: openRun.period.year, month: openRun.period.month },
        include: { hourEventType: true },
      })
    : [];
  const hrs = hourRows.reduce((s, e) => s + (e.hourEventType.countsTowardLoad ? Number(e.lessonHours) : 0), 0);

  const preview = buildPkImpactPreview({
    currentPkAddon: Number(p.currentPK.addon?.hourlyAddonRub ?? 0),
    newPkAddon: Number(targetPk.addon?.hourlyAddonRub ?? 0),
    currentPeriodHours: hrs,
    baseHourRate: Number(p.baseHourRateOverride ?? base),
    prAddon: Number(p.prLevel?.addon?.hourlyAddonRub ?? 0),
    opAddon: Number(p.opLevel?.addon?.hourlyAddonRub ?? 0),
    prEnabled: prOn,
    opEnabled: opOn,
  });
  const school = await getSchoolName();
  const ratePrev = buildRateImpactPreview(
    p.fullName,
    {
      effectiveBaseHourRate: Number(p.baseHourRateOverride ?? base),
      pkHourlyAddon: Number(p.currentPK?.addon?.hourlyAddonRub ?? 0),
      prHourlyAddon: prOn ? Number(p.prLevel?.addon?.hourlyAddonRub ?? 0) : 0,
      opHourlyAddon: opOn ? Number(p.opLevel?.addon?.hourlyAddonRub ?? 0) : 0,
      otherHourlyAddons: 0,
    },
    {
      effectiveBaseHourRate: Number(p.baseHourRateOverride ?? base),
      pkHourlyAddon: Number(targetPk.addon?.hourlyAddonRub ?? 0),
      prHourlyAddon: prOn ? Number(p.prLevel?.addon?.hourlyAddonRub ?? 0) : 0,
      opHourlyAddon: opOn ? Number(p.opLevel?.addon?.hourlyAddonRub ?? 0) : 0,
      otherHourlyAddons: 0,
    },
    hrs,
  );
  const orderText = buildOrderDraftForRateChange(ratePrev, school);

  const basis: "pending_recommendation" | "card_recommended_pk" | "explicit_recommendation" = opts?.recommendationId
    ? "explicit_recommendation"
    : pending?.proposedPKLevelId === targetLevelId
      ? "pending_recommendation"
      : "card_recommended_pk";

  const estimatedMonthlyDelta = ratePrev.newMonthlyEstimate - ratePrev.oldMonthlyEstimate;

  const payloadObj = {
    personId,
    fullName: p.fullName,
    oldPkCode: p.currentPK.code,
    newPkCode: targetPk.code,
    oldPkAddonHourly: Number(p.currentPK.addon?.hourlyAddonRub ?? 0),
    newPkAddonHourly: Number(targetPk.addon?.hourlyAddonRub ?? 0),
    oldHourlyRate: ratePrev.oldHourRate,
    newHourlyRate: ratePrev.newHourRate,
    oldMonthlyEstimate: ratePrev.oldMonthlyEstimate,
    newMonthlyEstimate: ratePrev.newMonthlyEstimate,
    estimatedMonthlyDelta,
    reason,
    basis,
    pendingRecommendationId: linkedRecommendationId,
    effectivePeriod: openRun
      ? {
          year: openRun.period.year,
          month: openRun.period.month,
          label: openRun.period.label,
        }
      : null,
    preview,
  };

  const beforeAudit = {
    pkCurrent: p.currentPK.code,
    pkFixed: p.fixedPK?.code ?? null,
    pkRecommended: p.recommendedPK?.code ?? pending?.proposedPK?.code ?? null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: personId },
      data: {
        fixedPKLevelId: targetLevelId,
        currentPKLevelId: targetLevelId,
        recommendedPKLevelId: targetLevelId,
      },
    });
    const draft = await tx.orderDraft.create({
      data: {
        personId,
        recommendationId: linkedRecommendationId ?? undefined,
        type: "PK_CHANGE",
        title: "Проект приказа: применение рекомендованного PK",
        bodyText: orderText,
        payload: jsonForOrderDraftDb(payloadObj),
        impactPreviewJson: jsonForOrderDraftDb({ ...preview, ratePreview: ratePrev }),
      },
    });
    await writeAuditTx(tx, {
      entityType: "OrderDraft",
      entityId: draft.id,
      action: "CREATE_ORDER_DRAFT",
      before: null,
      after: {
        type: "PK_CHANGE",
        personId,
        title: draft.title,
        status: draft.status,
      },
      actorRole: "system_admin",
      reason,
      outcome: "success",
    });
    await writeAuditTx(tx, {
      entityType: "Person",
      entityId: personId,
      action: "APPLY_PK_CHANGE",
      before: beforeAudit,
      after: {
        pkCurrent: targetPk.code,
        pkFixed: targetPk.code,
        pkRecommended: targetPk.code,
        orderDraftId: draft.id,
      },
      actorRole: "system_admin",
      reason,
      outcome: "success",
    });
    if (linkedRecommendationId) {
      await tx.rateChangeRecommendation.update({
        where: { id: linkedRecommendationId },
        data: { status: "approved" },
      });
    }
  });
  revalidatePath(`/people/${personId}`);
  revalidatePath("/audit");
  revalidatePath("/people");
  revalidatePath("/orders");
}
