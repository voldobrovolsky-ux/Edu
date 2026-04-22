import type { PrismaClient } from "@/generated/prisma";
import { formatPeriodYmRu } from "@/lib/display-labels";

/**
 * Создаёт недостающие строки PayrollPeriod для каждого месяца в диапазоне лет
 * (чтобы дропдаун «Новый расчёт» не был пустым при пустой БД).
 */
export async function ensurePayrollPeriodsForYearRange(
  prisma: PrismaClient,
  fromYear: number,
  toYear: number,
): Promise<void> {
  for (let y = fromYear; y <= toYear; y++) {
    for (let month = 1; month <= 12; month++) {
      const existing = await prisma.payrollPeriod.findFirst({ where: { year: y, month } });
      if (existing) continue;
      const label = formatPeriodYmRu(y, month);
      const startDate = new Date(y, month - 1, 1);
      const endDate = new Date(y, month, 0);
      await prisma.payrollPeriod.create({
        data: {
          year: y,
          month,
          label,
          startDate,
          endDate,
        },
      });
    }
  }
}
