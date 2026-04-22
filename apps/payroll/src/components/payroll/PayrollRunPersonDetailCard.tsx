import Link from "next/link";
import { PayrollPersonLadder } from "@/components/PayrollPersonLadder";
import { payrollLineTypeLabelRu } from "@/lib/display-labels";
import type { PersonFotRow } from "@/lib/payroll/fot-analytics";
import type { PayrollLine, Person } from "@/generated/prisma";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

type LineWithPerson = PayrollLine & { person: Pick<Person, "fullName" | "employmentType" | "workFormat"> };

type Props = {
  personId: string;
  lines: LineWithPerson[];
  fotRow: PersonFotRow | undefined;
};

/**
 * Human-readable payout summary first; ladder, line grid, and JSON behind one disclosure.
 */
export function PayrollRunPersonDetailCard({ personId, lines, fotRow }: Props) {
  const person = lines[0]?.person;
  if (!person) return null;

  return (
    <article className="overflow-hidden rounded-2xl bg-card/95 ring-1 ring-border/50">
      <div className="border-b border-border/50 px-4 py-4 sm:px-5">
        <h3 className="text-base font-semibold text-foreground">
          <Link href={`/people/${personId}`} className="hover:text-accent hover:underline">
            {person.fullName}
          </Link>
        </h3>

        {fotRow ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fix</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{formatRub(fotRow.fix)} ₽</div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Почасовка</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{formatRub(fotRow.hourly)} ₽</div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Flex</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{formatRub(fotRow.flex)} ₽</div>
              </div>
              <div className="col-span-3 rounded-xl bg-elevated/90 px-3 py-2.5 sm:col-span-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">К выплате</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">{formatRub(fotRow.total)} ₽</div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Нет агрегата по строкам TOTAL для отображения.</p>
        )}
      </div>

      <div className="px-4 py-3 sm:px-5">
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="mr-1 inline-block text-xs transition group-open:rotate-90">▸</span>
            Показать расчётные детали
            <span className="mt-0.5 block text-xs font-normal text-subtle-foreground">
              Лестница по видам, строки прогона, формулы и JSON пояснений
            </span>
          </summary>

          <div className="mt-4 space-y-5 border-t border-border/60 pt-4">
            <PayrollPersonLadder person={person} lines={lines} />

            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Строки прогона</div>
              <div className="overflow-x-auto rounded-xl bg-elevated/40 px-1 -mx-1">
                <table className="payroll-table-quiet min-w-[56rem] text-xs sm:text-sm">
                  <thead>
                    <tr>
                      <th className="pl-2 whitespace-nowrap">Тип</th>
                      <th>Название</th>
                      <th className="text-right tabular-nums">Кол-во</th>
                      <th className="text-right tabular-nums">Ставка</th>
                      <th className="text-right tabular-nums">Сумма</th>
                      <th>±</th>
                      <th>fix/flex</th>
                      <th>МРОТ</th>
                      <th className="min-w-[12rem] pr-2">Формула</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((ln) => (
                      <tr
                        key={ln.id}
                        className={
                          ln.lineType === "TOTAL"
                            ? "bg-accent-soft/40 font-semibold text-foreground"
                            : ""
                        }
                      >
                        <td className="pl-2 whitespace-nowrap text-[11px] text-muted-foreground">{payrollLineTypeLabelRu(ln.lineType)}</td>
                        <td className="max-w-[14rem]">{ln.title}</td>
                        <td className="text-right tabular-nums">{ln.quantity.toString()}</td>
                        <td className="text-right tabular-nums">{ln.rate.toString()}</td>
                        <td className="text-right tabular-nums">{ln.amount.toString()}</td>
                        <td>{ln.direction}</td>
                        <td>{ln.flexOrFix}</td>
                        <td>{ln.countsTowardMrot ? "да" : "нет"}</td>
                        <td className="max-w-[min(24rem,50vw)] pr-2 text-xs text-muted-foreground">{ln.formulaText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <details className="rounded-xl bg-elevated/50 ring-1 ring-border/40">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                Пояснения и JSON (аудит)
              </summary>
              <ul className="space-y-3 border-t border-border/40 px-3 py-3 text-xs">
                {lines.map((ln) => (
                  <li key={`${ln.id}-ex`}>
                    <span className="font-medium text-foreground">{ln.title}</span>
                    {ln.explanationJson && (
                      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-card/80 p-2 font-mono text-[11px] text-muted-foreground ring-1 ring-border/60">
                        {ln.explanationJson}
                      </pre>
                    )}
                    <div className="mt-1 text-subtle-foreground">Источник: {ln.sourceReference}</div>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </details>
      </div>
    </article>
  );
}
