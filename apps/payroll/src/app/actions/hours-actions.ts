"use server";

import { prisma } from "@/lib/db";
import { assertPeriodNotFinalizedForPayroll } from "@/lib/payroll/period-finalization";
import { hourEntrySchema, substitutionSchema } from "@/lib/validation/schemas";
import { writeAuditTx } from "@/modules/audit-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

function redirectHoursWithError(err: unknown): never {
  const msg = err instanceof Error ? err.message : "Ошибка";
  redirect(`/?err=${encodeURIComponent(msg)}`);
}

async function assertPersonCanLogHours(personId: string) {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  if (person.status === "archived") {
    throw new Error("Архивные лица не участвуют в учёте часов");
  }
  if (!person.canReceiveHourEntries) {
    throw new Error("Для этого человека не разрешён ввод учебных часов (canReceiveHourEntries=false)");
  }
  return person;
}

export async function upsertHourEntry(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = hourEntrySchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.message);
  const d = parsed.data;
  await assertPersonCanLogHours(d.personId);
  await assertPeriodNotFinalizedForPayroll(d.year, d.month);

  const id = formData.get("id") as string | null;
  const auditReason = d.notes?.trim() || null;

  if (id) {
    await prisma.$transaction(async (tx) => {
      const before = await tx.hourEntry.findUnique({ where: { id } });
      await tx.hourEntry.update({
        where: { id },
        data: {
          lessonHours: d.lessonHours,
          hourEventTypeId: d.hourEventTypeId,
          notes: d.notes || null,
        },
      });
      const after = await tx.hourEntry.findUnique({ where: { id } });
      await writeAuditTx(tx, {
        entityType: "TeachingHour",
        entityId: id,
        action: "UPDATE_HOURS",
        before,
        after,
        actorRole: "system_admin",
        reason: auditReason,
      });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const h = await tx.hourEntry.create({
        data: {
          personId: d.personId,
          year: d.year,
          month: d.month,
          lessonHours: d.lessonHours,
          hourEventTypeId: d.hourEventTypeId,
          notes: d.notes || null,
        },
      });
      await writeAuditTx(tx, {
        entityType: "TeachingHour",
        entityId: h.id,
        action: "ADD_HOURS",
        before: null,
        after: h,
        actorRole: "system_admin",
        reason: auditReason,
      });
    });
  }
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function deleteHourEntry(id: string) {
  const existing = await prisma.hourEntry.findUnique({ where: { id } });
  if (!existing) throw new Error("Запись не найдена");
  await assertPeriodNotFinalizedForPayroll(existing.year, existing.month);
  await prisma.$transaction(async (tx) => {
    const before = await tx.hourEntry.findUnique({ where: { id } });
    await tx.hourEntry.delete({ where: { id } });
    await writeAuditTx(tx, {
      entityType: "TeachingHour",
      entityId: id,
      action: "REMOVE_HOURS",
      before,
      after: null,
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function deleteHourEntryForm(formData: FormData) {
  try {
    await deleteHourEntry(formData.get("id") as string);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirectHoursWithError(e);
  }
}

/** Обёртка для форм: доменные ошибки → redirect на /?err= вместо падения Server Action. */
export async function upsertHourEntryForm(formData: FormData) {
  try {
    await upsertHourEntry(formData);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirectHoursWithError(e);
  }
}

export async function upsertSubstitution(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = substitutionSchema.safeParse({
    ...raw,
    replacedPersonId: raw.replacedPersonId === "" ? null : raw.replacedPersonId,
  });
  if (!parsed.success) throw new Error(parsed.error.message);
  const d = parsed.data;
  const subType =
    d.hourEventTypeId?.trim() ||
    (await prisma.hourEventType.findUnique({ where: { code: "substitution" } }))?.id;
  if (!subType) throw new Error("Не найден тип события «substitution»");
  await assertPersonCanLogHours(d.substitutingPersonId);
  if (d.replacedPersonId) {
    await assertPersonCanLogHours(d.replacedPersonId);
  }
  await assertPeriodNotFinalizedForPayroll(d.year, d.month);

  const id = formData.get("id") as string | null;
  const auditReason = d.notes?.trim() || null;

  await prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.substitutionEntry.findUnique({ where: { id } });
      await tx.substitutionEntry.update({
        where: { id },
        data: {
          substitutingPersonId: d.substitutingPersonId,
          replacedPersonId: d.replacedPersonId,
          year: d.year,
          month: d.month,
          hours: d.hours,
          hourEventTypeId: subType,
          notes: d.notes || null,
        },
      });
      const after = await tx.substitutionEntry.findUnique({ where: { id } });
      await writeAuditTx(tx, {
        entityType: "SubstitutionEntry",
        entityId: id,
        action: "UPDATE_SUBSTITUTION",
        before,
        after,
        actorRole: "system_admin",
        reason: auditReason,
      });
    } else {
      const created = await tx.substitutionEntry.create({
        data: {
          substitutingPersonId: d.substitutingPersonId,
          replacedPersonId: d.replacedPersonId,
          year: d.year,
          month: d.month,
          hours: d.hours,
          hourEventTypeId: subType,
          notes: d.notes || null,
        },
      });
      await writeAuditTx(tx, {
        entityType: "SubstitutionEntry",
        entityId: created.id,
        action: "ADD_SUBSTITUTION",
        before: null,
        after: created,
        actorRole: "system_admin",
        reason: auditReason,
      });
    }
  });
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function deleteSubstitution(id: string) {
  const existing = await prisma.substitutionEntry.findUnique({ where: { id } });
  if (!existing) throw new Error("Запись не найдена");
  await assertPeriodNotFinalizedForPayroll(existing.year, existing.month);
  await prisma.$transaction(async (tx) => {
    const before = await tx.substitutionEntry.findUnique({ where: { id } });
    await tx.substitutionEntry.delete({ where: { id } });
    await writeAuditTx(tx, {
      entityType: "SubstitutionEntry",
      entityId: id,
      action: "REMOVE_SUBSTITUTION",
      before,
      after: null,
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/");
  revalidatePath("/audit");
}

export async function deleteSubstitutionForm(formData: FormData) {
  try {
    await deleteSubstitution(formData.get("id") as string);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirectHoursWithError(e);
  }
}

export async function upsertSubstitutionForm(formData: FormData) {
  try {
    await upsertSubstitution(formData);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirectHoursWithError(e);
  }
}
