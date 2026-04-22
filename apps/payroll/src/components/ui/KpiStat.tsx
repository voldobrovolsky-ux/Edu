import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasize?: boolean;
  className?: string;
};

/** Slim KPI tile — number-first, accounting scan. */
export function KpiStat({ label, value, hint, emphasize, className = "" }: Props) {
  return (
    <div
      className={`rounded-xl border border-border bg-card px-4 py-3 shadow-card ${
        emphasize ? "ring-1 ring-accent/15" : ""
      } ${className}`}
    >
      <div className="edu-kpi-label">{label}</div>
      <div className={`edu-kpi-value mt-1 ${emphasize ? "text-accent" : ""}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
