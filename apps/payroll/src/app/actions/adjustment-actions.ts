"use server";

import { prisma } from "@/lib/db";
import { assertPeriodNotFinalizedForPayroll } from "@/lib/payroll/period-finalization";
import { writeAuditTx } from "@/modules/audit-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

function redirectPayrollSettingsWithError(err: unknown): never {
  const msg = err instanceof Error ? err.message : "Ошибка";
  redirect(`/settings/payroll?err=${encodeURIComponent(msg)}`);
}

export async function createAdjustment(formData: FormData) {
  try {
    const personId = formData.get("personId") as string;
    const subsidyTypeId = (formData.get("subsidyTypeId") as string) || null;
    const year = parseInt(formData.get("year") as string, 10);
    const month = parseInt(formData.get("month") as string, 10);
    const title = formData.get("title") as string;
    const amount = parseFloat((formData.get("amount") as string).replace(",", "."));
    const direction = (formData.get("direction") as string) === "minus" ? "minus" : "plus";
    const notes = (formData.get("notes") as string) || null;

    const person = await prisma.person.findUnique({
      where: { id: personId },
    });
    if (!person || person.status !== "active" || !person.isVisibleInAccounting) {
      throw new Error("Корректировка только для активных сотрудников, видимых в учёте");
    }

    await assertPeriodNotFinalizedForPayroll(year, month);

    const subsidy = subsidyTypeId
      ? await prisma.subsidy.findUnique({ where: { id: subsidyTypeId } })
      : null;

    await prisma.$transaction(async (tx) => {
      const a = await tx.adjustment.create({
        data: {
          personId,
          subsidyTypeId,
          year,
          month,
          title,
          amount,
          direction,
          notes,
        },
      });
      await writeAuditTx(tx, {
        entityType: "ManualAdjustment",
        entityId: a.id,
        action: "ADD_MANUAL_ADJUSTMENT",
        before: null,
        after: {
          personId,
          subsidyCode: subsidy?.code ?? null,
          title,
          amount,
          direction,
          year,
          month,
          countsTowardMrot: subsidy?.countsTowardMrot ?? null,
          notes,
        },
        actorRole: "system_admin",
        reason: notes,
      });
    });

    revalidatePath("/settings/payroll");
    revalidatePath("/run");
    revalidatePath("/audit");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirectPayrollSettingsWithError(e);
  }
}

export async function deleteAdjustment(formData: FormData) {
  try {
    const id = formData.get("id") as string;
    const adj = await prisma.adjustment.findUnique({ where: { id } });
    if (!adj) throw new Error("Корректировка не найдена");
    await assertPeriodNotFinalizedForPayroll(adj.year, adj.month);
    await prisma.$transaction(async (tx) => {
      const before = await tx.adjustment.findUnique({
        where: { id },
        include: { subsidyType: true },
      });
      await tx.adjustment.delete({ where: { id } });
      await writeAuditTx(tx, {
        entityType: "ManualAdjustment",
        entityId: id,
        action: "REMOVE_MANUAL_ADJUSTMENT",
        before: before
          ? {
              personId: before.personId,
              subsidyCode: before.subsidyType?.code ?? null,
              title: before.title,
              amount: before.amount.toString(),
              direction: before.direction,
              year: before.year,
              month: before.month,
              countsTowardMrot: before.subsidyType?.countsTowardMrot ?? null,
            }
          : null,
        after: null,
        actorRole: "system_admin",
        reason: null,
      });
    });
    revalidatePath("/settings/payroll");
    revalidatePath("/audit");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirectPayrollSettingsWithError(e);
  }
}

export async function createSubsidyType(formData: FormData) {
  await prisma.$transaction(async (tx) => {
    const paymentSource = (formData.get("paymentSource") as string)?.trim() || "school_budget";
    const row = await tx.subsidy.create({
      data: {
        code: formData.get("code") as string,
        name: formData.get("name") as string,
        isFixComponent: formData.get("isFixComponent") === "on",
        countsTowardMrot: formData.get("countsTowardMrot") === "on",
        isHourly: formData.get("isHourly") === "on",
        isManual: formData.get("isManual") === "on",
        paymentSource,
      },
    });
    await writeAuditTx(tx, {
      entityType: "SubsidyType",
      entityId: row.id,
      action: "CREATE_SUBSIDY_TYPE",
      before: null,
      after: { code: row.code, name: row.name, paymentSource: row.paymentSource },
      actorRole: "system_admin",
      reason: null,
    });
  });
  revalidatePath("/settings/payroll");
  revalidatePath("/audit");
}
