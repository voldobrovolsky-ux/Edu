import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
};

export function EmptyState({ title, description }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-elevated/50 px-6 py-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
