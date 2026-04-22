import type { PrimaryRole } from "../types/roles.js";
import type { StoredUser } from "../types/user.js";

type Viewer = Pick<StoredUser, "username" | "primaryRole">;

/** Системный администратор: полный технический доступ. Роль `sysadmin` или учётная запись bootstrap `admin`. */
export function isSysAdminUser(viewer: Viewer | null | undefined): boolean {
  if (!viewer) return false;
  if (viewer.primaryRole === "sysadmin") return true;
  if (viewer.username.trim().toLowerCase() === "admin") return true;
  return false;
}

/** Завуч — основная роль учебного администратора (без «корневых» технических прав). */
export function isHeadTeacherRole(role: PrimaryRole): boolean {
  return role === "head_teacher";
}

/** Директор или завуч — учебно-административное управление персоналом и процессом. */
export function isSchoolPedagogicalAdmin(viewer: Viewer | null | undefined): boolean {
  if (!viewer) return false;
  return viewer.primaryRole === "director" || viewer.primaryRole === "head_teacher";
}

/** Раздел «Управление пользователями» и связанные API: директор, завуч, системный админ. */
export function canAccessSchoolUserManagement(viewer: Viewer | null | undefined): boolean {
  return isSchoolPedagogicalAdmin(viewer) || isSysAdminUser(viewer);
}

/** Очистка БД и прочие критичные технические операции — только системный администратор. */
export function canClearEntireDatabase(viewer: Viewer | null | undefined): boolean {
  return isSysAdminUser(viewer);
}
