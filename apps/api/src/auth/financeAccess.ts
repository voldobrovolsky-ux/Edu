import type { StoredUser } from "../types/user.js";

/**
 * Finance configuration (тарифы, ветки, engine presets, формулы).
 * Техстандарт §7.3: sysadmin не меняет финансовые правила без отдельного права;
 * чтение для диагностики допустимо.
 */
export function canReadFinanceConfiguration(user: StoredUser | null | undefined): boolean {
  if (!user) return false;
  const r = user.primaryRole;
  return r === "director" || r === "head_teacher" || r === "sysadmin";
}

/** Редактирование справочников компенсаций и пресетов — только директор и завуч. */
export function canWriteFinanceConfiguration(user: StoredUser | null | undefined): boolean {
  if (!user) return false;
  const r = user.primaryRole;
  return r === "director" || r === "head_teacher";
}

/** Управление расчётными периодами, снапшотами, корректировками, согласованием — директор и завуч. */
export function canManagePayrollPeriods(user: StoredUser | null | undefined): boolean {
  if (!user) return false;
  const r = user.primaryRole;
  return r === "director" || r === "head_teacher";
}
