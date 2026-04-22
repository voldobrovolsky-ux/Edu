"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Рабочее место" },
  { href: "/people", label: "Люди" },
  { href: "/candidates", label: "Кандидаты" },
  { href: "/settings/payroll", label: "Настройки" },
  { href: "/run", label: "Расчёт выплат" },
  { href: "/calendar", label: "Календарь" },
  { href: "/orders", label: "Приказы" },
  { href: "/audit", label: "Аудит" },
];

function navActive(pathname: string, href: string): boolean {
  /** `usePathname()` includes `basePath` (/payroll/...) */
  const rel = pathname.replace(/^\/payroll(\/|$)/, "/") || "/";
  if (href === "/") return rel === "/";
  if (href === "/people") return rel === "/people" || rel.startsWith("/people/");
  if (href === "/candidates") return rel === "/candidates" || rel.startsWith("/candidates/");
  return rel === href || rel.startsWith(href + "/");
}

/**
 * Internal module navigation (not a second global app shell).
 * Renders inside the payroll iframe under the EDUMED host layout.
 */
export function PayrollModuleNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mb-6 flex flex-wrap gap-1 border-b border-border/60 pb-3"
      aria-label="Разделы модуля бухгалтерии"
    >
      {links.map((l) => {
        const active = navActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "rounded-lg bg-accent-soft px-2.5 py-1.5 text-[13px] font-medium text-accent-foreground ring-1 ring-accent/25"
                : "rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
