import { prisma } from "@/lib/db";

/** Последний действующий МРОТ на первое число месяца периода (регион приоритетнее федерального). */
export async function getEffectiveMrotForPeriod(year: number, month: number) {
  const periodFirst = new Date(year, month - 1, 1);

  const record = await prisma.mrotSetting.findFirst({
    where: {
      effectiveDate: { lte: periodFirst },
    },
    orderBy: { effectiveDate: "desc" },
  });

  if (!record) {
    return {
      id: null as string | null,
      federalMrotMonthly: 0,
      regionalOverrideMonthly: null as number | null,
      effectiveMrotMonthly: 0,
      effectiveDate: null as string | null,
      warning: "Нет записи МРОТ с effectiveDate ≤ начала периода — проверьте справочник МРОТ",
    };
  }

  const federal = Number(record.federalMrotMonthly);
  const regional = record.regionalOverrideMonthly != null ? Number(record.regionalOverrideMonthly) : null;
  const effective = regional ?? federal;

  return {
    id: record.id,
    federalMrotMonthly: federal,
    regionalOverrideMonthly: regional,
    effectiveMrotMonthly: effective,
    effectiveDate: record.effectiveDate.toISOString(),
  };
}
