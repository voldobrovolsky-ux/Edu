import type { PrimaryRole, SecondaryRole } from "./roles";

export type OfficeSection =
  | "main"
  | "analytics"
  | "document_archive"
  | "journal"
  | "timetable"
  | "methospace"
  | "chats"
  | "diary"
  | "users_admin"
  | "parent_finance"
  | "student_finance"
  | "payroll";

export type ProfileFieldLocks = {
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
  primaryRoleSections?: Partial<Record<PrimaryRole, OfficeSection[]>>;
  profileFieldLocks?: ProfileFieldLocks;
};

