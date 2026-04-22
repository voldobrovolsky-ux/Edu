import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
};

/** Аббревиатура с расшифровкой по hover (нативный title + курсор help). */
export function Abbr({ title, children, className = "" }: Props) {
  return (
    <abbr title={title} className={`cursor-help underline decoration-dotted decoration-muted-foreground underline-offset-2 ${className}`}>
      {children}
    </abbr>
  );
}
