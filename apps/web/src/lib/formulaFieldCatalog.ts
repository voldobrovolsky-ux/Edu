/** Каталог показателей для конструктора (путь API → подпись в UI). */
export type FieldCatalogEntry = {
  path: string;
  label: string;
  category: "Показатели" | "Коэффициенты" | "Премии и выплаты" | "Прочее";
};

export const FORMULA_FIELD_CATALOG: FieldCatalogEntry[] = [
  { path: "ctx.configuredPc", label: "Показатель ПК сотрудника", category: "Показатели" },
  { path: "ctx.hoursAudited", label: "Аудиторные часы", category: "Показатели" },
  { path: "ctx.pcMethod", label: "Показатель ПК (методработа)", category: "Показатели" },
  { path: "ctx.hoursMethod", label: "Часы методработы", category: "Показатели" },
  { path: "ctx.baseSalary", label: "Оклад", category: "Показатели" },
  { path: "ctx.methodProductRate", label: "Ставка за методический продукт", category: "Показатели" },
  { path: "ctx.methodProductsCount", label: "Количество методпродуктов", category: "Показатели" },
  { path: "coef.k_fill.value", label: "Коэффициент наполняемости", category: "Коэффициенты" },
  { path: "coef.k_role.value", label: "Коэффициент роли", category: "Коэффициенты" },
  { path: "coef.k_worked.value", label: "Доля отработки нормы", category: "Коэффициенты" },
  { path: "coef.k_quality.value", label: "Коэффициент качества методпродукта", category: "Коэффициенты" },
  { path: "ctx.premResults", label: "Премии по результатам", category: "Премии и выплаты" },
  { path: "ctx.premProjects", label: "Премии по проектам", category: "Премии и выплаты" },
  { path: "ctx.premiumsSum", label: "Премии (сводно)", category: "Премии и выплаты" },
  { path: "ctx.dopClass", label: "Доплаты (в т.ч. классное)", category: "Премии и выплаты" },
  { path: "ctx.deductions", label: "Удержания", category: "Премии и выплаты" },
];

export function catalogByCategory(): Record<string, FieldCatalogEntry[]> {
  const m: Record<string, FieldCatalogEntry[]> = {};
  for (const e of FORMULA_FIELD_CATALOG) {
    if (!m[e.category]) m[e.category] = [];
    m[e.category].push(e);
  }
  return m;
}
