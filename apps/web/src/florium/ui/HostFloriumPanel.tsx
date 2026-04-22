import type { HTMLAttributes, ReactNode } from "react";

/** Host copy of Flörium panel styling — keeps @edumed/florium free of EDUMED API imports. */
export interface HostFloriumPanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

const baseClass =
  "ed-panel flex min-h-0 min-w-0 max-w-3xl flex-1 flex-col space-y-5 overflow-hidden bg-[var(--ed-surface)] p-6 border border-slate-200";

export function HostFloriumPanel({
  title,
  subtitle,
  className,
  children,
  ...rest
}: HostFloriumPanelProps) {
  return (
    <section
      className={[baseClass, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {title || subtitle ? (
        <div>
          {title ? <h2 className="ed-h2 mb-2">{title}</h2> : null}
          {subtitle ? (
            <p className="ed-caption text-slate-600">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
