import type { ReactNode } from "react";

type Variant = "success" | "danger" | "warning" | "info";

const styles: Record<Variant, string> = {
  success: "border-success/25 bg-success-soft text-success",
  danger: "border-danger/25 bg-danger-soft text-danger",
  warning: "border-warning/25 bg-warning-soft text-warning",
  info: "border-border bg-info-soft text-info",
};

type Props = {
  variant: Variant;
  children: ReactNode;
  title?: string;
  role?: "alert" | "status";
};

/** Restrained operational feedback — not neon, not playful. */
export function AlertBanner({ variant, children, title, role = "status" }: Props) {
  return (
    <div
      role={variant === "danger" ? "alert" : role}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-card ${styles[variant]}`}
    >
      {title && <p className="font-medium">{title}</p>}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}
