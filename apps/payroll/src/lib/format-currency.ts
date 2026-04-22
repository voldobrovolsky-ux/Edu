/** Consistent ₽ formatting across payroll UI. */
export function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}
