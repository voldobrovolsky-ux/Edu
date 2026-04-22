/** Основные роли (GENERAL DESCRIPTION §2.2) */
export const PRIMARY_ROLES = [
  "director",
  "head_teacher",
  "teacher",
  "parent",
  "student",
  /** Системный администратор: маршруты документов, интеграции, технические настройки. */
  "sysadmin",
  /** Системный пользователь-бот (не входит в интерфейс, только сообщения от имени ассистента). */
  "bot",
] as const;

export type PrimaryRole = (typeof PRIMARY_ROLES)[number];

/** Добавочные роли — только teacher | parent */
export const SECONDARY_ROLES = ["teacher", "parent"] as const;
export type SecondaryRole = (typeof SECONDARY_ROLES)[number];

export const STAFF_PRIMARY_ROLES: PrimaryRole[] = [
  "director",
  "head_teacher",
  "teacher",
  "sysadmin",
];

export const CLIENT_PRIMARY_ROLES: PrimaryRole[] = ["parent", "student"];

export function isPrimaryRole(s: string): s is PrimaryRole {
  return (PRIMARY_ROLES as readonly string[]).includes(s);
}

export function isSecondaryRole(s: string): s is SecondaryRole {
  return (SECONDARY_ROLES as readonly string[]).includes(s);
}
