import { personStatusLabelRu } from "@/lib/display-labels";

/** Compact status for tables and lists — one product language. */
export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "edu-pill-neutral";
  if (s === "active") cls = "edu-pill-success";
  else if (s === "candidate" || s === "trainee") cls = "edu-pill-accent";
  else if (s === "archived") cls = "edu-pill-neutral opacity-80";

  return <span className={cls}>{personStatusLabelRu[status] ?? status}</span>;
}
