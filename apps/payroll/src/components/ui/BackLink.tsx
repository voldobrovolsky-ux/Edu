import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
};

/** Consistent back / secondary navigation — not a raw blue underline. */
export function BackLink({ href, children }: Props) {
  return (
    <Link href={href} className="edu-link inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <span aria-hidden className="text-subtle-foreground">
        ←
      </span>
      {children}
    </Link>
  );
}
