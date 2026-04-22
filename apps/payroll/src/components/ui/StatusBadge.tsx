type RunStatus = "draft" | "calculated" | "finalized" | string;

const runStyles: Record<string, string> = {
  draft: "bg-elevated text-muted-foreground ring-1 ring-border",
  calculated: "bg-accent-soft text-accent-foreground ring-1 ring-accent/20",
  finalized: "bg-warning-soft text-warning ring-1 ring-warning/25",
};

export function RunStatusBadge({ status, finalized }: { status: RunStatus; finalized?: boolean }) {
  const key = finalized || status === "finalized" ? "finalized" : status;
  const cls = runStyles[key] ?? runStyles.draft;
  const label =
    finalized || status === "finalized"
      ? "Финализирован"
      : status === "draft"
        ? "Черновик"
        : status === "calculated"
          ? "рассчитан"
          : status;

  return <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const ok = outcome === "success";
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 font-mono text-[11px] font-medium ${
        ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      {outcome}
    </span>
  );
}
