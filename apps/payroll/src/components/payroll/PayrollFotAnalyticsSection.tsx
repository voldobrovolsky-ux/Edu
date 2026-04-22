import { sumLineTypeBreakdown, type RunFotAnalytics } from "@/lib/payroll/fot-analytics";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

type Props = {
  periodLabel: string;
  analytics: RunFotAnalytics;
};

/**
 * Secondary reconciliation: quiet tables, one surface, no duplicate KPI tiles.
 */
export function PayrollFotAnalyticsSection({ periodLabel, analytics }: Props) {
  const { fotTotal, fixTotal, hourlyTotal, flexTotal } = analytics;
  const sumBlocks = fixTotal + hourlyTotal + flexTotal;

  return (
    <section className="rounded-2xl bg-elevated/40 px-4 py-5 ring-1 ring-border/40 sm:px-5">
      <header className="mb-4 border-b border-border/40 pb-3">
        <h2 className="text-sm font-semibold text-foreground">Сверка и аналитика</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Период {periodLabel}. Разрезы по видам строк и источникам.
        </p>
      </header>

      {Math.abs(sumBlocks - fotTotal) > 0.02 && (
        <p className="mb-4 rounded-lg border border-warning/25 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
          Fix + Почас + Flex = {formatRub(sumBlocks)} ₽ при ФОТ {formatRub(fotTotal)} ₽ — проверьте строки прогона.
        </p>
      )}

      <div className="space-y-6">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Виды начислений (без TOTAL)</h3>
          <p className="mt-1 text-xs text-muted-foreground">Сверка суммы по видам с итогом ФОТ.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="payroll-table-quiet min-w-[28rem] text-sm">
              <thead>
                <tr>
                  <th className="pl-2">Вид</th>
                  <th className="pr-2 text-right tabular-nums">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Фикс по ТД / гарантия", analytics.fixBaseTotal],
                  ["Региональная субсидия", analytics.regionalSubsidyLineTotal],
                  ["Доплата до МРОТ", analytics.mrotTopUpTotal],
                  ["Расчёт МРОТ", analytics.mrotEvaluationTotal],
                  ["Базовая ставка", analytics.baseHourlyTotal],
                  ["Надбавка РК", analytics.pkTotal],
                  ["Надбавка PR", analytics.prTotal],
                  ["Надбавка OP", analytics.opTotal],
                  ["Замены", analytics.substitutionTotal],
                  ["Премии", analytics.bonusTotal],
                  ["Штрафы", analytics.penaltyTotal],
                  ["Ручные корректировки", analytics.manualAdjustmentTotal],
                ].map(([label, val]) => (
                  <tr key={String(label)}>
                    <td className="pl-2 text-muted-foreground">{label}</td>
                    <td className="pr-2 text-right tabular-nums text-foreground">{formatRub(val as number)} ₽</td>
                  </tr>
                ))}
                <tr className="font-medium text-foreground">
                  <td className="pl-2 pt-2">Итого по видам строк</td>
                  <td className="pr-2 pt-2 text-right tabular-nums">{formatRub(sumLineTypeBreakdown(analytics))} ₽</td>
                </tr>
              </tbody>
            </table>
          </div>
          {Math.abs(sumLineTypeBreakdown(analytics) - fotTotal) > 0.02 && (
            <p className="mt-2 text-xs text-warning">
              Сумма по видам ({formatRub(sumLineTypeBreakdown(analytics))} ₽) ≠ ФОТ ({formatRub(fotTotal)} ₽).
            </p>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Источники выплат</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="payroll-table-quiet min-w-[20rem] text-sm">
              <tbody>
                {[
                  ["Бюджет школы", analytics.schoolBudgetTotal],
                  ["Региональные субсидии", analytics.regionalSubsidyBySourceTotal],
                  ["Гранты", analytics.grantTotal],
                  ["Прочее", analytics.otherSourceTotal],
                ].map(([label, val]) => (
                  <tr key={String(label)}>
                    <td className="pl-2 text-muted-foreground">{label}</td>
                    <td className="pr-2 text-right tabular-nums">{formatRub(val as number)} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
