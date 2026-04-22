import type { OfficeConfig, OfficeSection } from "../types/office.js";
import { CLIENT_PRIMARY_ROLES, STAFF_PRIMARY_ROLES } from "../types/roles.js";

// Источник правды: docs/EDUMED-GENERAL-DESCRIPTION-v0.1.md §2.2 (кабинеты)
export const officeConfig: OfficeConfig = {
  staffPrimaryRoles: STAFF_PRIMARY_ROLES,
  clientPrimaryRoles: CLIENT_PRIMARY_ROLES,
  staffSections: [
    "main",
    "analytics",
    "document_archive",
    "journal",
    "timetable",
    "methospace",
    "payroll",
    "chats",
  ] satisfies OfficeSection[],
  clientSections: ["main", "diary", "chats"] satisfies OfficeSection[],
  secondaryRoleSections: {
    parent: ["diary"],
    teacher: ["journal", "methospace", "analytics"],
  },
  primaryRoleSections: {
    head_teacher: ["users_admin"],
    director: ["users_admin"],
    sysadmin: ["users_admin"],
  },
  profileFieldLocks: {
    lastName: false,
    firstName: false,
    patronymic: false,
  },
};
