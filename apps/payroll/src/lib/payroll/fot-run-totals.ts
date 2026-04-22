import { prisma } from "@/lib/db";
import { computeRunFotAnalytics, type FotLineInput } from "@/lib/payroll/fot-analytics";
import { linesLinkedToEdumedAccounts } from "@/lib/payroll/payroll-line-filters";
import type { MonthRunInfo } from "@/lib/payroll/payroll-period-calendar";

/** Fact ФОТ for each run id from persisted TOTAL lines (same rules as run analytics). Null if no lines. */
export async function getFotTotalsByRunIds(runIds: string[]): Promise<Map<string, number | null>> {
  const unique = [...new Set(runIds)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const linesRaw = await prisma.payrollLine.findMany({
    where: { payrollRunId: { in: unique } },
    select: {
      payrollRunId: true,
      personId: true,
      lineType: true,
      amount: true,
      direction: true,
      explanationJson: true,
      person: { select: { systemUserId: true } },
    },
  });
  const lines = linesLinkedToEdumedAccounts(linesRaw);

  const byRun = new Map<string, FotLineInput[]>();
  for (const ln of lines) {
    const list = byRun.get(ln.payrollRunId) ?? [];
    list.push({
      personId: ln.personId,
      lineType: ln.lineType,
      amount: ln.amount,
      direction: ln.direction,
      explanationJson: ln.explanationJson,
    });
    byRun.set(ln.payrollRunId, list);
  }

  const out = new Map<string, number | null>();
  for (const id of unique) {
    const ls = byRun.get(id) ?? [];
    if (ls.length === 0) {
      out.set(id, null);
      continue;
    }
    out.set(id, computeRunFotAnalytics(ls).fotTotal);
  }
  return out;
}

/** Добавляет planRub/factRub к плиткам календаря за год. */
export async function enrichMonthTilesWithPlanFact(months: MonthRunInfo[], year: number): Promise<MonthRunInfo[]> {
  const runIds = months.map((m) => m.run?.id).filter(Boolean) as string[];
  const factMap = await getFotTotalsByRunIds(runIds);
  const plans = await prisma.fotPeriodPlan.findMany({
    where: { period: { year } },
    include: { period: true },
  });
  const planByMonth = new Map<number, number>();
  for (const p of plans) {
    planByMonth.set(p.period.month, Number(p.plannedFotTotal));
  }
  return months.map((m) => ({
    ...m,
    planRub: planByMonth.get(m.month) ?? null,
    factRub: m.run ? factMap.get(m.run.id) ?? null : null,
  }));
}
