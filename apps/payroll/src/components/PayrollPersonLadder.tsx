import type { ReactNode } from "react";
import type { PayrollLineRow } from "@/lib/payroll/payroll-ladder";
import { groupLinesByLadder, signedAmount, sumSigned } from "@/lib/payroll/payroll-ladder";
import type { Person } from "@/generated/prisma";
import { employmentTypeLabelRu, payrollLineTypeLabelRu, workFormatLabelRu } from "@/lib/display-labels";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function contractLabel(employmentType: string): string {
  return employmentTypeLabelRu[employmentType] ?? employmentType;
}

function workFormatLabel(workFormat: string): string {
  return workFormatLabelRu[workFormat] ?? workFormat;
}

function MrotAccountingCell({ ln }: { ln: PayrollLineRow }) {
  if (ln.lineType === "MROT_EVALUATION") {
    return <span className="text-[10px] text-muted-foreground">оценка</span>;
  }
  return ln.countsTowardMrot ? (
    <span className="text-[10px] font-medium text-warning">да</span>
  ) : (
    <span className="text-[10px] text-muted-foreground">нет</span>
  );
}

function LadderBlockSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-elevated/50 p-4 ring-1 ring-border/40">
      <h4 className="border-b border-border/50 pb-2 text-sm font-semibold text-foreground">{title}</h4>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

type Props = {
  person: Pick<Person, "fullName" | "employmentType" | "workFormat">;
  lines: PayrollLineRow[];
};

export function PayrollPersonLadder({ person, lines }: Props) {
  const grouped = groupLinesByLadder(lines);
  const totalLine = grouped.total.find((l) => l.lineType === "TOTAL");
  const nonTotal = lines.filter((l) => l.lineType !== "TOTAL");

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Учётная модель:</span> {contractLabel(person.employmentType)} · занятость:{" "}
        {workFormatLabel(person.workFormat)} · данные из сохранённого прогона (без пересчёта на экране).
      </div>

      <LadderBlockSection title="Фикс">
        {grouped.fix.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет строк в блоке Fix.</p>
        ) : (
          <ul className="space-y-0">
            <li className="grid grid-cols-[1fr_3.5rem_auto] gap-x-3 border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[1fr_4rem_auto]">
              <span>Строка</span>
              <span className="text-center">МРОТ</span>
              <span className="text-right">Сумма</span>
            </li>
            {grouped.fix.map((ln) => (
              <li key={ln.id} className="grid grid-cols-[1fr_3.5rem_auto] gap-x-3 border-b border-border/70 py-2 text-xs sm:grid-cols-[1fr_4rem_auto] sm:text-sm">
                <span>
                  <span className="text-[11px] text-muted-foreground">{payrollLineTypeLabelRu(ln.lineType)}</span>
                  {ln.title ? <span className="text-muted-foreground"> · {ln.title}</span> : null}
                </span>
                <span className="flex items-start justify-center">
                  <MrotAccountingCell ln={ln} />
                </span>
                <span className={`text-right tabular-nums ${signedAmount(ln) < 0 ? "text-danger" : "text-foreground"}`}>
                  {formatRub(signedAmount(ln))} ₽
                </span>
              </li>
            ))}
            <li className="grid grid-cols-[1fr_3.5rem_auto] gap-x-3 pt-3 text-sm font-semibold text-foreground sm:grid-cols-[1fr_4rem_auto]">
              <span>Подытог Fix</span>
              <span />
              <span className="text-right tabular-nums">{formatRub(sumSigned(grouped.fix))} ₽</span>
            </li>
          </ul>
        )}
      </LadderBlockSection>

      <LadderBlockSection title="Почасовка" hint="База + PK + PR + OP по учебным часам.">
        {grouped.hourly.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет учебных часов или разложения по ставке.</p>
        ) : (
          <ul className="space-y-0">
            {grouped.hourly.map((ln) => (
              <li key={ln.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 py-2 text-xs sm:text-sm">
                <span>
                  <span className="text-[11px] text-muted-foreground">{payrollLineTypeLabelRu(ln.lineType)}</span>
                  {ln.title ? <span className="text-muted-foreground"> · {ln.title}</span> : null}
                  <span className="ml-1 text-muted-foreground">
                    ({ln.quantity.toString()} × {ln.rate.toString()} ₽/ч)
                  </span>
                </span>
                <span className="tabular-nums text-foreground">{formatRub(signedAmount(ln))} ₽</span>
              </li>
            ))}
            <li className="flex justify-between pt-3 text-sm font-semibold text-foreground">
              <span>Подытог почасовки</span>
              <span className="tabular-nums">{formatRub(sumSigned(grouped.hourly))} ₽</span>
            </li>
          </ul>
        )}
      </LadderBlockSection>

      <LadderBlockSection
        title="Flex"
        hint="Замены, премии, штрафы, разовые корректировки. Часть строк может входить в базу для МРОТ."
      >
        {grouped.flex.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет гибких начислений.</p>
        ) : (
          <ul className="space-y-0">
            <li className="grid grid-cols-[1fr_3.5rem_auto] gap-x-3 border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[1fr_4rem_auto]">
              <span>Строка</span>
              <span className="text-center">МРОТ</span>
              <span className="text-right">Сумма</span>
            </li>
            {grouped.flex.map((ln) => (
              <li key={ln.id} className="grid grid-cols-[1fr_3.5rem_auto] gap-x-3 border-b border-border/70 py-2 text-xs sm:grid-cols-[1fr_4rem_auto] sm:text-sm">
                <span>
                  <span className="text-[11px] text-muted-foreground">{payrollLineTypeLabelRu(ln.lineType)}</span>
                  {ln.title ? <span className="text-muted-foreground"> · {ln.title}</span> : null}
                </span>
                <span className="flex items-start justify-center">
                  <MrotAccountingCell ln={ln} />
                </span>
                <span className={`text-right tabular-nums ${signedAmount(ln) < 0 ? "text-danger" : "text-foreground"}`}>
                  {formatRub(signedAmount(ln))} ₽
                </span>
              </li>
            ))}
            <li className="grid grid-cols-[1fr_3.5rem_auto] gap-x-3 pt-3 text-sm font-semibold text-foreground sm:grid-cols-[1fr_4rem_auto]">
              <span>Подытог Flex</span>
              <span />
              <span className="text-right tabular-nums">{formatRub(sumSigned(grouped.flex))} ₽</span>
            </li>
          </ul>
        )}
      </LadderBlockSection>

      {totalLine && (
        <div className="rounded-xl border border-border/50 bg-accent-soft/20 px-4 py-3 ring-1 ring-accent/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">Итого к выплате (строка TOTAL)</span>
            <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">{formatRub(signedAmount(totalLine))} ₽</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Совпадает с блоком «К выплате» в сводке, если данные согласованы.</p>
        </div>
      )}

      <details className="rounded-xl bg-elevated/60 text-xs text-muted-foreground ring-1 ring-border/40">
        <summary className="cursor-pointer px-3 py-2.5 font-medium text-foreground hover:bg-elevated">Все строки таблицей (как в БД)</summary>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="payroll-table-quiet min-w-[28rem] text-xs">
            <thead>
              <tr>
                <th className="pl-2">Тип</th>
                <th>fix/flex</th>
                <th>МРОТ</th>
                <th className="pr-2 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {nonTotal.map((ln) => (
                <tr key={ln.id}>
                  <td className="pl-2">{payrollLineTypeLabelRu(ln.lineType)}</td>
                  <td>{ln.flexOrFix}</td>
                  <td>{ln.countsTowardMrot ? "да" : "нет"}</td>
                  <td className="pr-2 text-right tabular-nums">{formatRub(signedAmount(ln))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
