"use server";

import { prisma } from "@/lib/db";
import { executePayrollRun } from "@/lib/payroll-run-service";
import { writeAuditTx } from "@/modules/audit-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function runPayrollCalculation(runId: string) {
  const res = await executePayrollRun(runId);
  revalidatePath("/run");
  revalidatePath("/audit");
  return res;
}

export async function runPayrollCalculationForm(formData: FormData) {
  const runId = (formData.get("runId") as string)?.trim();
  if (!runId) {
    redirect(
      `/run?err=${encodeURIComponent("Не выбран расчёт — укажите период в списке слева или месяц в календаре справа.")}`,
    );
  }

  const runMeta = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { period: true },
  });
  if (!runMeta) {
    redirect(`/run?err=${encodeURIComponent("Расчёт (прогон) не найден — создайте новый для периода.")}`);
  }

  const runUrl = () =>
    `/run?run=${encodeURIComponent(runId)}&year=${runMeta.period.year}&month=${runMeta.period.month}`;

  try {
    await runPayrollCalculation(runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка расчёта";
    await prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({
        where: { id: runId },
        data: { calcError: message },
      });
      await writeAuditTx(tx, {
        entityType: "PayrollRun",
        entityId: runId,
        action: "RECALCULATE_PAYROLL_RUN",
        before: null,
        after: { outcome: "failure", message },
        actorRole: "system_admin",
        reason: null,
        outcome: "failure",
      });
    });
    revalidatePath("/run");
    revalidatePath("/audit");
    redirect(`${runUrl()}&err=${encodeURIComponent(message)}`);
  }
  redirect(`${runUrl()}&ok=recalc`);
}

export async function createPayrollRun(periodId: string) {
  const run = await prisma.payrollRun.create({
    data: { periodId, status: "draft" },
  });
  revalidatePath("/run");
  return run.id;
}

export async function createPayrollRunForm(formData: FormData) {
  const periodId = (formData.get("periodId") as string)?.trim();
  if (!periodId) {
    redirect(`/run?err=${encodeURIComponent("Выберите период (месяц) в списке «Новый расчёт».")}`);
  }
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) {
    redirect(`/run?err=${encodeURIComponent("Период не найден.")}`);
  }
  const newRunId = await createPayrollRun(periodId);
  redirect(`/run?run=${encodeURIComponent(newRunId)}&year=${period.year}&month=${period.month}`);
}

export async function finalizePayrollRun(runId: string, reason: string) {
  const trimmed = reason?.trim();
  if (!trimmed) throw new Error("Причина обязательна");
  await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: runId },
      include: { period: true },
    });
    if (!run) throw new Error("Прогон не найден");
    const finalizedBefore = run.finalizedAt;
    if (run.status === "finalized" || finalizedBefore) {
      throw new Error("Прогон уже финализирован");
    }
    const lineCount = await tx.payrollLine.count({ where: { payrollRunId: runId } });
    if (lineCount === 0) throw new Error("Нет строк расчёта — сначала пересчитайте прогон");
    const finalizedAt = new Date();
    const before = {
      status: run.status,
      finalizedAt: null,
    };
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: "finalized", finalizedAt },
    });
    await writeAuditTx(tx, {
      entityType: "PayrollRun",
      entityId: runId,
      action: "FINALIZE_PAYROLL_RUN",
      before,
      after: {
        status: "finalized",
        finalizedAt: finalizedAt.toISOString(),
        period: { year: run.period.year, month: run.period.month, label: run.period.label },
      },
      actorRole: "system_admin",
      reason: trimmed,
      outcome: "success",
    });
  });
  revalidatePath("/run");
  revalidatePath("/audit");
}

export async function reopenPayrollRun(runId: string, reason: string) {
  const trimmed = reason?.trim();
  if (!trimmed) throw new Error("Причина обязательна");
  await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: runId },
      include: { period: true },
    });
    if (!run) throw new Error("Прогон не найден");
    const finalizedBefore = run.finalizedAt;
    if (run.status !== "finalized" && !finalizedBefore) {
      throw new Error("Прогон не финализирован — открытие недоступно");
    }
    const before = {
      status: run.status,
      finalizedAt: finalizedBefore ? finalizedBefore.toISOString() : null,
    };
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: "calculated", finalizedAt: null },
    });
    await writeAuditTx(tx, {
      entityType: "PayrollRun",
      entityId: runId,
      action: "REOPEN_PAYROLL_RUN",
      before,
      after: {
        status: "calculated",
        finalizedAt: null,
        period: { year: run.period.year, month: run.period.month, label: run.period.label },
      },
      actorRole: "system_admin",
      reason: trimmed,
      outcome: "success",
    });
  });
  revalidatePath("/run");
  revalidatePath("/audit");
}

export async function finalizePayrollRunForm(formData: FormData) {
  const runId = (formData.get("runId") as string)?.trim();
  const reason = (formData.get("reason") as string) ?? "";
  if (!runId) redirect("/run?err=" + encodeURIComponent("Не указан прогон"));
  try {
    await finalizePayrollRun(runId, reason);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка финализации";
    redirect(`/run?run=${encodeURIComponent(runId)}&err=${encodeURIComponent(msg)}`);
  }
  redirect(`/run?run=${encodeURIComponent(runId)}&ok=finalize`);
}

export async function reopenPayrollRunForm(formData: FormData) {
  const runId = (formData.get("runId") as string)?.trim();
  const reason = (formData.get("reason") as string) ?? "";
  if (!runId) redirect("/run?err=" + encodeURIComponent("Не указан прогон"));
  try {
    await reopenPayrollRun(runId, reason);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка открытия прогона";
    redirect(`/run?run=${encodeURIComponent(runId)}&err=${encodeURIComponent(msg)}`);
  }
  redirect(`/run?run=${encodeURIComponent(runId)}&ok=reopen`);
}
