/**
 * URL модуля Next (basePath `/payroll`) с учётом Vite `base` / React Router `basename`.
 * Без этого при деплое в `/EDUMED/` iframe запрашивал `/payroll` с корня сайта, а не `/EDUMED/payroll`.
 */
export function payrollIframeSrc(): string {
  const base = import.meta.env.BASE_URL;
  if (base === "/" || base === "") {
    return "/payroll";
  }
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/payroll`;
}
