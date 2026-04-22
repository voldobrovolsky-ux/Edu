"use server";

import { prisma } from "@/lib/db";
import { writeAudit, writeAuditTx } from "@/modules/audit-service";
import { revalidatePath } from "next/cache";

export async function upsertSetting(key: string, value: string, actorRole = "system_admin") {
  const before = await prisma.systemSetting.findUnique({ where: { key } });
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  await writeAudit({
    entityType: "SystemSetting",
    entityId: key,
    action: "upsert",
    before: before ? { value: before.value } : null,
    after: { value },
    actorRole,
    reason: null,
  });
  revalidatePath("/settings/payroll");
}

export async function saveGlobalSettings(formData: FormData) {
  const next = {
    baseHourRateRub: formData.get("baseHourRateRub") as string,
    lessonDurationMinutes: formData.get("lessonDurationMinutes") as string,
    schoolName: formData.get("schoolName") as string,
    prHourlyPayEnabled: formData.get("prHourlyPayEnabled") === "on" ? "true" : "false",
    opHourlyPayEnabled: formData.get("opHourlyPayEnabled") === "on" ? "true" : "false",
  };

  await prisma.$transaction(async (tx) => {
    const keys = ["baseHourRateRub", "lessonDurationMinutes", "schoolName", "prHourlyPayEnabled", "opHourlyPayEnabled"] as const;
    const before: Record<string, string | null> = {};
    for (const key of keys) {
      const row = await tx.systemSetting.findUnique({ where: { key } });
      before[key] = row?.value ?? null;
    }
    for (const key of keys) {
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: next[key] },
        update: { value: next[key] },
      });
    }

    const baseChanged =
      before.baseHourRateRub !== next.baseHourRateRub ||
      before.lessonDurationMinutes !== next.lessonDurationMinutes ||
      before.schoolName !== next.schoolName;
    if (baseChanged) {
      await writeAuditTx(tx, {
        entityType: "SystemSetting",
        entityId: "global",
        action: "UPDATE_SETTINGS_BASE",
        before: {
          baseHourRateRub: before.baseHourRateRub,
          lessonDurationMinutes: before.lessonDurationMinutes,
          schoolName: before.schoolName,
        },
        after: {
          baseHourRateRub: next.baseHourRateRub,
          lessonDurationMinutes: next.lessonDurationMinutes,
          schoolName: next.schoolName,
        },
        actorRole: "system_admin",
        reason: null,
      });
    }

    const flagsChanged =
      before.prHourlyPayEnabled !== next.prHourlyPayEnabled || before.opHourlyPayEnabled !== next.opHourlyPayEnabled;
    if (flagsChanged) {
      await writeAuditTx(tx, {
        entityType: "SystemSetting",
        entityId: "global",
        action: "UPDATE_SETTINGS_PR_OP_FLAGS",
        before: {
          prHourlyPayEnabled: before.prHourlyPayEnabled,
          opHourlyPayEnabled: before.opHourlyPayEnabled,
        },
        after: {
          prHourlyPayEnabled: next.prHourlyPayEnabled,
          opHourlyPayEnabled: next.opHourlyPayEnabled,
        },
        actorRole: "system_admin",
        reason: null,
      });
    }
  });

  revalidatePath("/settings/payroll");
  revalidatePath("/audit");
}

function validateMrotInput(federal: number, regional: number | null, effectiveDate: Date | null) {
  if (!federal || federal <= 0) {
    throw new Error("Федеральный МРОТ должен быть больше 0");
  }
  if (regional != null && regional < federal) {
    throw new Error("Региональный МРОТ не может быть ниже федерального");
  }
  if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
    throw new Error("Дата вступления МРОТ обязательна");
  }
}

export async function createMrotSetting(formData: FormData) {
  const federal = parseFloat((formData.get("federalMrotMonthly") as string).replace(",", ".")) || 0;
  const regionalRaw = (formData.get("regionalOverrideMonthly") as string) || "";
  const regional = regionalRaw ? parseFloat(regionalRaw.replace(",", ".")) : null;
  const eff = formData.get("effectiveDate") as string;
  const notes = (formData.get("notes") as string) || "";
  const effectiveDate = new Date(eff);
  validateMrotInput(federal, regional, effectiveDate);
  await prisma.$transaction(async (tx) => {
    const row = await tx.mrotSetting.create({
      data: {
        federalMrotMonthly: federal,
        regionalOverrideMonthly: regional,
        effectiveDate,
        notes: notes || null,
      },
    });
    await writeAuditTx(tx, {
      entityType: "MrotSetting",
      entityId: row.id,
      action: "UPDATE_MROT_RECORD",
      before: null,
      after: { federalMrotMonthly: federal, regionalOverrideMonthly: regional, effectiveDate: eff, notes: notes || null },
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/settings/payroll");
  revalidatePath("/audit");
}

export async function updatePkAddon(pkLevelId: string, hourlyAddonRub: number) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.pKAddonRule.findUnique({ where: { pkLevelId } });
    await tx.pKAddonRule.upsert({
      where: { pkLevelId },
      create: { pkLevelId, hourlyAddonRub },
      update: { hourlyAddonRub },
    });
    await writeAuditTx(tx, {
      entityType: "PKAddonRule",
      entityId: pkLevelId,
      action: "UPDATE_PK_ADDON_TABLE",
      before: before ? { hourlyAddonRub: before.hourlyAddonRub } : null,
      after: { hourlyAddonRub },
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/settings/payroll");
  revalidatePath("/audit");
}

export async function updatePrAddon(prLevelId: string, hourlyAddonRub: number) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.pRAddonRule.findUnique({ where: { prLevelId } });
    await tx.pRAddonRule.upsert({
      where: { prLevelId },
      create: { prLevelId, hourlyAddonRub },
      update: { hourlyAddonRub },
    });
    await writeAuditTx(tx, {
      entityType: "PRAddonRule",
      entityId: prLevelId,
      action: "UPDATE_PR_ADDON_TABLE",
      before: before ? { hourlyAddonRub: before.hourlyAddonRub } : null,
      after: { hourlyAddonRub },
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/settings/payroll");
  revalidatePath("/audit");
}

export async function updateOpAddon(opLevelId: string, hourlyAddonRub: number) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.oPAddonRule.findUnique({ where: { opLevelId } });
    await tx.oPAddonRule.upsert({
      where: { opLevelId },
      create: { opLevelId, hourlyAddonRub },
      update: { hourlyAddonRub },
    });
    await writeAuditTx(tx, {
      entityType: "OPAddonRule",
      entityId: opLevelId,
      action: "UPDATE_OP_ADDON_TABLE",
      before: before ? { hourlyAddonRub: before.hourlyAddonRub } : null,
      after: { hourlyAddonRub },
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/settings/payroll");
  revalidatePath("/audit");
}

export async function updatePkAddonForm(formData: FormData) {
  const pkLevelId = formData.get("pkLevelId") as string;
  const hourlyAddonRub = parseFloat((formData.get("hourlyAddonRub") as string).replace(",", ".")) || 0;
  await updatePkAddon(pkLevelId, hourlyAddonRub);
}

export async function updatePrAddonForm(formData: FormData) {
  const prLevelId = formData.get("prLevelId") as string;
  const hourlyAddonRub = parseFloat((formData.get("hourlyAddonRub") as string).replace(",", ".")) || 0;
  await updatePrAddon(prLevelId, hourlyAddonRub);
}

export async function updateOpAddonForm(formData: FormData) {
  const opLevelId = formData.get("opLevelId") as string;
  const hourlyAddonRub = parseFloat((formData.get("hourlyAddonRub") as string).replace(",", ".")) || 0;
  await updateOpAddon(opLevelId, hourlyAddonRub);
}
