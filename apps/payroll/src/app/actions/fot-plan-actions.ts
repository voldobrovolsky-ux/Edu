"use server";

import { prisma } from "@/lib/db";
import { writeAudit } from "@/modules/audit-service";
import { Prisma } from "@/generated/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function parseRub(raw: string): number | null {
  const t = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function saveFotPlanForm(formData: FormData): Promise<void> {
  const periodId = (formData.get("periodId") as string)?.trim();
  const amountRaw = (formData.get("plannedFotTotal") as string) ?? "";
  const note = ((formData.get("note") as string) ?? "").trim() || null;
  const returnTo = ((formData.get("returnTo") as string) ?? "/run").trim() || "/run";
  const q = (suffix: string) => {
    const sep = returnTo.includes("?") ? "&" : "?";
    return `${returnTo}${sep}${suffix}`;
  };

  if (!periodId) {
    redirect(q(`err=${encodeURIComponent("Не указан период")}`));
  }

  const plannedFotTotal = parseRub(amountRaw);
  if (plannedFotTotal === null) {
    redirect(q(`err=${encodeURIComponent("Введите неотрицательную сумму плана (₽)")}`));
  }

  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    redirect(q(`err=${encodeURIComponent("Период не найден")}`));
  }

  const existing = await prisma.fotPeriodPlan.findUnique({ where: { periodId } });

  if (existing) {
    const before = {
      plannedFotTotal: Number(existing.plannedFotTotal),
      note: existing.note,
    };
    await prisma.fotPeriodPlan.update({
      where: { id: existing.id },
      data: {
        plannedFotTotal: new Prisma.Decimal(plannedFotTotal),
        note,
      },
    });
    await writeAudit({
      entityType: "FotPeriodPlan",
      entityId: existing.id,
      action: "UPDATE_FOT_PLAN",
      before,
      after: {
        plannedFotTotal,
        note,
        periodId,
        year: period.year,
        month: period.month,
      },
      actorRole: "system_admin",
      outcome: "success",
    });
  } else {
    const created = await prisma.fotPeriodPlan.create({
      data: {
        periodId,
        plannedFotTotal: new Prisma.Decimal(plannedFotTotal),
        note,
      },
    });
    await writeAudit({
      entityType: "FotPeriodPlan",
      entityId: created.id,
      action: "CREATE_FOT_PLAN",
      before: null,
      after: { plannedFotTotal, note, periodId, year: period.year, month: period.month },
      actorRole: "system_admin",
      outcome: "success",
    });
  }

  revalidatePath("/run");
  revalidatePath("/calendar");
  revalidatePath("/audit");

  redirect(q("ok=fotplan"));
}
