import { prisma } from "@/lib/db";

/** Сообщение для UI при блокировке периода финализированным прогоном ЗП. */
export const PERIOD_LOCKED_MESSAGE = "Период финализирован. Редактирование заблокировано.";

/** Блокирует изменения учёта часов, замен и корректировок по месяцу, если прогон ЗП по этому периоду финализирован. */
export async function assertPeriodNotFinalizedForPayroll(year: number, month: number): Promise<void> {
  const run = await prisma.payrollRun.findFirst({
    where: {
      period: { year, month },
      OR: [{ status: "finalized" }, { finalizedAt: { not: null } }],
    },
    include: { period: true },
  });
  if (run) {
    throw new Error(PERIOD_LOCKED_MESSAGE);
  }
}
