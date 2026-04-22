import type { PrimaryRole, SecondaryRole } from "./roles.js";

export const OFFICE_SECTIONS = [
  "main",
  "analytics",
  "document_archive",
  "journal",
  "timetable",
  "methospace",
  "chats",
  "diary",
  "users_admin",
  /** Родительский финансовый кабинет */
  "parent_finance",
  /** Ученический школьный счёт */
  "student_finance",
  /** Модуль зарплаты (бухгалтерия) */
  "payroll",
] as const;

export type OfficeSection = (typeof OFFICE_SECTIONS)[number];

export type ProfileFieldLocks = {
  /** Если true — пользователь не может менять фамилию в профиле (только админ). */
  lastName?: boolean;
  firstName?: boolean;
  patronymic?: boolean;
};

export type OfficeConfig = {
  staffPrimaryRoles: PrimaryRole[];
  clientPrimaryRoles: PrimaryRole[];
  staffSections: OfficeSection[];
  clientSections: OfficeSection[];
  secondaryRoleSections: Record<SecondaryRole, OfficeSection[]>;
  /**
   * Дополнительные секции, выдаваемые по primaryRole.
   * Используется только для технических кабинетов (например, админка пользователей).
   */
  primaryRoleSections?: Partial<Record<PrimaryRole, OfficeSection[]>>;
  /**
   * Блокировка редактирования ФИО в профиле (настройка школы).
   */
  profileFieldLocks?: ProfileFieldLocks;
};

