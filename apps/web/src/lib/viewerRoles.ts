import type { PrimaryRole } from "../types/roles";
import type { User } from "../types/user";

/** Системный администратор (технические настройки: маршруты выгрузки и т.п.). */
export function isSysAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.primaryRole === "sysadmin") return true;
  if (user.username.trim().toLowerCase() === "admin") return true;
  return false;
}

export function isHeadTeacherRole(role: PrimaryRole): boolean {
  return role === "head_teacher";
}

export function isSchoolPedagogicalAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.primaryRole === "director" || user.primaryRole === "head_teacher";
}

export function canAccessSchoolUserManagement(user: User | null | undefined): boolean {
  return isSchoolPedagogicalAdmin(user) || isSysAdminUser(user);
}

export function canClearEntireDatabase(user: User | null | undefined): boolean {
  return isSysAdminUser(user);
}
