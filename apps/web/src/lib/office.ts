import type { OfficeConfig, OfficeSection } from "../types/office";
import type { PrimaryRole, SecondaryRole } from "../types/roles";

export function computeOfficeSections(args: {
  office: OfficeConfig;
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];
}): OfficeSection[] {
  const { office, primaryRole, secondaryRoles } = args;
  const base =
    office.staffPrimaryRoles.includes(primaryRole) ? office.staffSections : office.clientSections;

  const extra = secondaryRoles.flatMap((r) => office.secondaryRoleSections[r] ?? []);
  const primaryExtra = office.primaryRoleSections?.[primaryRole] ?? [];
  let merged = [...base, ...extra, ...primaryExtra];

  if (primaryRole === "parent") {
    merged.push("parent_finance");
  }
  if (primaryRole === "student") {
    merged.push("student_finance");
  }

  // Сохраняем порядок: сначала базовые, затем добавочные; убираем дубли.
  const seen = new Set<OfficeSection>();
  const out: OfficeSection[] = [];
  for (const s of merged) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export const SECTION_LABELS: Record<OfficeSection, string> = {
  main: "Главная",
  analytics: "Аналитика",
  document_archive: "Документы",
  journal: "Журнал",
  timetable: "Расписание",
  methospace: "Метод. пространство",
  chats: "Чаты",
  diary: "Дневник",
  users_admin: "Управление пользователями",
  parent_finance: "Мои финансы",
  student_finance: "Мои финансы",
  payroll: "Бухгалтерия",
};

