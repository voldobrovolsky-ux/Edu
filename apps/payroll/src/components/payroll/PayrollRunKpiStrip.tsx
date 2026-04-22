import type { ReactNode } from "react";
import { formatRub } from "@/lib/format-currency";
import type { RunFotAnalytics } from "@/lib/payroll/fot-analytics";
import type { PlanVsFactView } from "@/lib/payroll/fot-plan-vs-fact";

type Props = {
  analytics: RunFotAnalytics;
  planVsFact: PlanVsFactView | null;
};

/** Financial snapshot: one hero (FOT), secondary mix, plan vs fact as one relationship block. */
export function PayrollRunKpiStrip({ analytics, planVsFact }: Props) {
  const { fotTotal, fixTotal, hourlyTotal, flexTotal } = analytics;

  let planRef: ReactNode = "—";
  let factPrimary: ReactNode = "—";
  let deltaChip: ReactNode = null;
  let abovePlan = false;

  if (planVsFact) {
    if (planVsFact.kind === "full") {
      planRef = `${formatRub(planVsFact.plan)} ₽`;
      factPrimary = `${formatRub(planVsFact.fact)} ₽`;
      const sign = planVsFact.delta >= 0 ? "+" : "";
      abovePlan = planVsFact.status === "above";
      deltaChip = (
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${
            abovePlan
              ? "border-warning/40 bg-warning-soft/70 text-warning"
              : "border-border bg-elevated text-muted-foreground"
          }`}
        >
          Δ {sign}
          {formatRub(planVsFact.delta)} ₽
          {planVsFact.deltaPercent != null ? ` · ${sign}${planVsFact.deltaPercent}%` : ""}
        </span>
      );
    } else if (planVsFact.kind === "plan_no_fact") {
      planRef = `${formatRub(planVsFact.plan)} ₽`;
      factPrimary = "—";
      deltaChip = <span className="text-xs text-muted-foreground">факт недоступен</span>;
    } else {
      planRef = "не задан";
      factPrimary = planVsFact.fact != null ? `${formatRub(planVsFact.fact)} ₽` : "—";
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-stretch">
        <div className="flex flex-col justify-center rounded-2xl border border-border/70 bg-card px-6 py-7 shadow-card">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ФОТ (итого)</div>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-foreground sm:text-[2.35rem]">
            {formatRub(fotTotal)} <span className="text-2xl font-medium text-muted-foreground">₽</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Сумма по строкам TOTAL прогона</p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Fix", value: fixTotal },
            { label: "Почас.", value: hourlyTotal },
            { label: "Flex", value: flexTotal },
          ].map((c) => (
            <div
              key={c.label}
              className="flex flex-col justify-center rounded-xl border border-transparent bg-elevated/90 px-2.5 py-3 sm:px-3"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-base font-semibold tabular-nums text-foreground sm:text-lg">{formatRub(c.value)}</div>
              <div className="mt-0.5 text-[10px] text-subtle-foreground">₽</div>
            </div>
          ))}
        </div>
      </div>

      {planVsFact && (
        <div
          className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${
            planVsFact.kind === "full" && planVsFact.status === "above"
              ? "border-warning/30 bg-warning-soft/25"
              : "border-border/60 bg-elevated/50"
          }`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">План и факт</div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums text-foreground">{factPrimary}</span>
              <span className="text-sm text-muted-foreground">
                факт <span className="sr-only">прогона</span>
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              План: <span className="tabular-nums text-foreground/90">{planRef}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">{deltaChip}</div>
        </div>
      )}
    </div>
  );
}
