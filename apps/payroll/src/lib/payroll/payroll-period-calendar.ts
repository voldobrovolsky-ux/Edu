export type MonthRunInfo = {
  month: number;
  year: number;
  run: {
    id: string;
    status: string;
    calculatedAt: Date | null;
    finalizedAt: Date | null;
  } | null;
  /** План ФОТ за месяц (₽), если задан в FotPeriodPlan */
  planRub?: number | null;
  /** Факт ФОТ по последнему прогону месяца (строки TOTAL), если есть строки */
  factRub?: number | null;
};

type RunRow = {
  id: string;
  status: string;
  calculatedAt: Date | null;
  finalizedAt: Date | null;
  period: { month: number; year: number };
};

/** One tile per month; if several runs exist for a period, the latest by `runs` order wins — pass runs ordered by createdAt desc. */
export function buildMonthRunInfosForYear(year: number, runs: RunRow[]): MonthRunInfo[] {
  const latestByMonth = new Map<number, RunRow>();
  for (const r of runs) {
    if (r.period.year !== year) continue;
    const m = r.period.month;
    if (m < 1 || m > 12) continue;
    if (!latestByMonth.has(m)) {
      latestByMonth.set(m, r);
    }
  }

  const months: MonthRunInfo[] = [];
  for (let month = 1; month <= 12; month++) {
    const r = latestByMonth.get(month);
    months.push({
      month,
      year,
      run: r
        ? {
            id: r.id,
            status: r.status,
            calculatedAt: r.calculatedAt,
            finalizedAt: r.finalizedAt,
          }
        : null,
    });
  }
  return months;
}
