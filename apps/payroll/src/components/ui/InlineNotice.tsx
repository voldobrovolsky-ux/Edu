import type { ReactNode } from "react";

type Variant = "success" | "warning" | "danger" | "info";

const styles: Record<Variant, string> = {
  success: "border-success/30 bg-success-soft/90 text-success",
  warning: "border-warning/30 bg-warning-soft/90 text-warning",
  danger: "border-danger/30 bg-danger-soft/90 text-danger",
  info: "border-border bg-info-soft/80 text-info",
};

type Props = {
  variant: Variant;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
};

/** Compact contextual notice — less dominant than full AlertBanner. */
export function InlineNotice({ variant, title, children, className = "", role }: Props) {
  return (
    <div
      role={role ?? (variant === "danger" ? "alert" : "status")}
      className={`rounded-xl border px-3 py-2 text-sm leading-snug ${styles[variant]} ${className}`}
    >
      {title && <span className="font-medium">{title}: </span>}
      {children}
    </div>
  );
}
