export interface HostFloriumListItemProps {
  title: string;
  description?: string;
  badge?: string;
  tone?: "default" | "info" | "success" | "warning";
}

const toneBadgeClass: Record<NonNullable<HostFloriumListItemProps["tone"]>, string> = {
  default: "bg-slate-100 text-slate-700",
  info: "bg-sky-50 text-sky-700 border border-sky-100",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  warning: "bg-amber-50 text-amber-800 border border-amber-100",
};

export function HostFloriumListItem({
  title,
  description,
  badge,
  tone = "default",
}: HostFloriumListItemProps) {
  const badgeTone = toneBadgeClass[tone];

  return (
    <li className="px-4 py-3 text-sm flex items-start justify-between gap-3 hover:bg-[var(--ed-surface-muted)] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-800">{title}</div>
        {description !== undefined ? (
          <p className="mt-0.5 text-slate-600 text-sm leading-snug">{description}</p>
        ) : null}
      </div>
      {badge !== undefined ? (
        <span
          className={[
            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            badgeTone,
          ].join(" ")}
        >
          {badge}
        </span>
      ) : null}
    </li>
  );
}
