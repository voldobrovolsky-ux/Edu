import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  /** id for anchor links / accessibility */
  id?: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "quiet";
};

export function SectionCard({ title, description, id, children, className = "", variant = "default" }: Props) {
  const shell = variant === "quiet" ? "edu-card-quiet" : "edu-card";
  return (
    <section id={id} className={`${shell} p-5 lg:p-6 ${className}`}>
      <div className="mb-4 space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {children}
    </section>
  );
}
