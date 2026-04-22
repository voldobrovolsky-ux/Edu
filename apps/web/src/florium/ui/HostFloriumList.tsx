import type { ReactNode } from "react";

export function HostFloriumList({ children }: { children: ReactNode }) {
  return (
    <ul className="min-h-0 flex-1 space-y-0 divide-y divide-slate-200 overflow-y-auto rounded-[var(--ed-radius-lg)] border border-slate-200 bg-[var(--ed-surface)]">
      {children}
    </ul>
  );
}
