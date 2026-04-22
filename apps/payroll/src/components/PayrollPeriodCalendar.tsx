import Link from "next/link";
import type { MonthRunInfo } from "@/lib/payroll/payroll-period-calendar";

const MONTHS_SHORT_RU = ["янв.", "фев.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сен.", "окт.", "ноя.", "дек."] as const;

export type { MonthRunInfo };

function statusLabel(status: string | undefined, finalizedAt: Date | null | undefined): string {
  if (finalizedAt || status === "finalized") return "финализирован";
  if (status === "calculated") return "рассчитан";
  if (status === "draft") return "черновик";
  return "Расчёт не создан";
}

function statusTone(
  status: string | undefined,
  finalizedAt: Date | null | undefined,
): { border: string; bg: string; text: string } {
  if (finalizedAt || status === "finalized") {
    return { border: "border-warning/40", bg: "bg-warning-soft", text: "text-warning" };
  }
  if (status === "calculated") {
    return { border: "border-accent/35", bg: "bg-accent-soft", text: "text-accent-foreground" };
  }
  if (status === "draft") {
    return { border: "border-border-strong", bg: "bg-elevated", text: "text-foreground" };
  }
  return { border: "border-dashed border-border", bg: "bg-card", text: "text-muted-foreground" };
}

type Props = {
  year: number;
  months: MonthRunInfo[];
  /** Highlight tile (e.g. current run period). */
  selectedYear?: number;
  selectedMonth?: number;
  /** Вложенный блок: без второго H2 — заголовок задаёт родитель. */
  embedded?: boolean;
};

export function PayrollPeriodCalendar({ year, months, selectedYear, selectedMonth, embedded }: Props) {
  const prevYear = year - 1;
  const nextYear = year + 1;

  const yearNav = embedded ? (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-sm">
      <Link className="edu-btn-muted py-1.5 text-xs" href={`/calendar?year=${prevYear}`}>
        ← {prevYear}
      </Link>
      <Link className="edu-btn-muted py-1.5 text-xs" href={`/calendar?year=${nextYear}`}>
        {nextYear} →
      </Link>
    </div>
  ) : (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-foreground">Периоды расчёта · {year}</h2>
      <div className="flex items-center gap-2 text-sm">
        <Link className="edu-btn-muted" href={`/calendar?year=${prevYear}`}>
          ← {prevYear}
        </Link>
        <Link className="edu-btn-muted" href={`/calendar?year=${nextYear}`}>
          {nextYear} →
        </Link>
      </div>
    </div>
  );

  return (
    <div>
      {yearNav}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {months.map((m) => {
          const hasRun = Boolean(m.run);
          const st = statusLabel(m.run?.status, m.run?.finalizedAt ?? null);
          const tone = statusTone(m.run?.status, m.run?.finalizedAt ?? null);
          const isSelected =
            selectedYear != null &&
            selectedMonth != null &&
            selectedYear === m.year &&
            selectedMonth === m.month;
          const href = `/run?year=${m.year}&month=${m.month}${m.run ? `&run=${m.run.id}` : ""}`;

          return (
            <Link
              key={`${m.year}-${m.month}`}
              href={href}
              className={`block rounded-xl border px-3 py-2.5 text-sm shadow-sm transition hover:shadow-card ${
                tone.border
              } ${tone.bg} ${
                isSelected
                  ? "border-2 border-accent bg-accent/10 font-semibold ring-2 ring-accent/40 ring-offset-2 ring-offset-card"
                  : ""
              }`}
            >
              <div className={`font-medium capitalize ${isSelected ? "text-accent-foreground" : tone.text}`}>
                {MONTHS_SHORT_RU[m.month - 1]} {m.year}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{st}</div>
              {hasRun && m.run?.calculatedAt && (
                <div className="mt-1 text-[10px] leading-tight text-subtle-foreground">
                  расчёт: {m.run.calculatedAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </div>
              )}
              {hasRun && m.run?.finalizedAt && (
                <div className="text-[10px] leading-tight text-subtle-foreground">
                  финал.: {m.run.finalizedAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </div>
              )}
              {(m.planRub != null || m.factRub != null) && (
                <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                  {m.planRub != null && <span>план {Math.round(m.planRub).toLocaleString("ru-RU")}</span>}
                  {m.planRub != null && m.factRub != null && <span> · </span>}
                  {m.factRub != null && <span>факт {Math.round(m.factRub).toLocaleString("ru-RU")}</span>}
                </div>
              )}
              {m.planRub != null && m.factRub != null && m.factRub > m.planRub && (
                <div className="mt-1 inline-block rounded-md bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  выше плана
                </div>
              )}
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Клик по месяцу открывает расчёт ЗП с выбранным периодом. Подсветка — текущий выбор в отчёте.
      </p>
    </div>
  );
}
