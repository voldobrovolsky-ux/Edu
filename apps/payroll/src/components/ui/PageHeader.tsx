import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  /** Secondary line: period, run id, breadcrumbs context */
  meta?: ReactNode;
  actions?: ReactNode;
};

/**
 * Payroll product shell: strong title, quiet meta, primary actions on the right.
 * Design: premium accounting — whitespace, no marketing fluff.
 */
export function PageHeader({ title, description, meta, actions }: Props) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-6 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="min-w-0 space-y-1">
        <h1 className="edu-page-title">{title}</h1>
        {description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
