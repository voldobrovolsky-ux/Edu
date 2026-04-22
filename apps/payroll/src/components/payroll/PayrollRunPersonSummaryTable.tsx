import Link from "next/link";
import type { PersonFotRow } from "@/lib/payroll/fot-analytics";
import { employmentTypeLabelRu, workFormatLabelRu } from "@/lib/display-labels";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

type Props = {
  periodLabel: string;
  rows: PersonFotRow[];
};

/**
 * Quiet dense SaaS table: hairline rows, soft hover, no spreadsheet grid.
 */
export function PayrollRunPersonSummaryTable({ periodLabel, rows }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl bg-card/95 ring-1 ring-border/50">
      <div className="border-b border-border/50 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-foreground">Сводка по педагогам</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Период {periodLabel} · итоги по сохранённым строкам прогона
        </p>
      </div>
      <div className="overflow-x-auto px-2 pb-2 sm:px-3">
        <table className="payroll-table-quiet min-w-[720px]">
          <thead>
            <tr>
              <th className="min-w-[10rem] pl-3">Педагог</th>
              <th>Договор</th>
              <th>Формат</th>
              <th className="text-right tabular-nums">Fix</th>
              <th className="text-right tabular-nums">Почас.</th>
              <th className="text-right tabular-nums">Flex</th>
              <th className="pr-3 text-right tabular-nums">Итого</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const quiet = Math.abs(r.total) < 0.005;
              return (
                <tr key={r.personId} className={quiet ? "text-muted-foreground" : ""}>
                  <td className="pl-3">
                    <Link href={`/people/${r.personId}`} className="font-medium text-foreground hover:text-accent hover:underline">
                      {r.fullName}
                    </Link>
                  </td>
                  <td className="text-muted-foreground">{employmentTypeLabelRu[r.employmentType] ?? r.employmentType}</td>
                  <td className="text-muted-foreground">{workFormatLabelRu[r.workFormat] ?? r.workFormat}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{formatRub(r.fix)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{formatRub(r.hourly)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{formatRub(r.flex)}</td>
                  <td className="pr-3 text-right text-[15px] font-semibold tabular-nums text-foreground">{formatRub(r.total)} ₽</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="border-t border-border/40 px-4 py-5 text-center text-xs text-muted-foreground sm:px-5">Нет строк по людям.</p>
      )}
    </section>
  );
}
