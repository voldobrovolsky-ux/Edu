import { PrismaClient } from '@prisma/client';

/**
 * Канонический каталог прав (§5.1) — Раздел→Экран→Действие + пакеты ролей.
 * Это ОПРЕДЕЛЕНИЕ (версионируется в коде); рантайм-источник истины — БД, куда оно
 * идемпотентно засевается `syncAuthzCatalog`. Резолв доступа (AuthzService) читает из БД.
 * Расширение прав = строка здесь, не правка кода резолва.
 */
export interface PermissionDef {
  code: string;
  section: string;
  screen: string;
  action: string;
  label: string;
}
export interface RolePackageDef {
  key: string; // = роль/суб-роль EduStore (owner|admin|teacher|parent|student|zavuch|methodist|psychologist)
  cabinet: string; // CabinetKey фронта
  label: string;
  permissions: string[]; // коды Permission
}

export const PERMISSIONS: PermissionDef[] = [
  // учредитель
  { code: 'owner.metrics.view', section: 'owner', screen: 'metrics', action: 'view', label: 'Бизнес-метрики' },
  { code: 'owner.schools.view', section: 'owner', screen: 'schools', action: 'view', label: 'Школы' },
  { code: 'owner.license.view', section: 'owner', screen: 'license', action: 'view', label: 'Лицензия' },
  // структура школы (admin/завуч)
  { code: 'structure.disciplines.manage', section: 'structure', screen: 'disciplines', action: 'manage', label: 'Дисциплины' },
  { code: 'structure.distribution.manage', section: 'structure', screen: 'distribution', action: 'manage', label: 'Распределение учителей' },
  { code: 'structure.devices.manage', section: 'structure', screen: 'devices', action: 'manage', label: 'Устройства-киоски' },
  // кабинет учителя
  { code: 'journal.grades.view', section: 'journal', screen: 'grades', action: 'view', label: 'Журнал — просмотр' },
  { code: 'journal.grades.edit', section: 'journal', screen: 'grades', action: 'edit', label: 'Журнал — оценки' },
  { code: 'planning.ktp.view', section: 'planning', screen: 'ktp', action: 'view', label: 'КТП — просмотр' },
  { code: 'planning.ktp.edit', section: 'planning', screen: 'ktp', action: 'edit', label: 'КТП — правка' },
  { code: 'planning.ktp.approve', section: 'planning', screen: 'ktp', action: 'approve', label: 'Утверждение КТП (завуч)' },
  { code: 'planning.kpp.approve', section: 'planning', screen: 'kpp', action: 'approve', label: 'Утверждение/генерация КПП (завуч)' },
  { code: 'lesson.conduct', section: 'lesson', screen: 'lesson', action: 'conduct', label: 'Проведение урока (учитель)' },
  // контракты завуча/методиста (Phase 1)
  { code: 'standards.assessment.manage', section: 'standards', screen: 'assessment', action: 'manage', label: 'Политика оценивания (завуч)' },
  { code: 'standards.org.manage', section: 'standards', screen: 'org', action: 'manage', label: 'Оргстандарты (завуч)' },
  { code: 'standards.fgos.approve', section: 'standards', screen: 'fgos', action: 'approve', label: 'Утверждение ФГОС-часов (завуч)' },
  { code: 'standards.timing.manage', section: 'standards', screen: 'timing', action: 'manage', label: 'Тайминг-профили (методист)' },
  // кабинеты (Phase 1)
  { code: 'methodics.manage', section: 'methodics', screen: 'library', action: 'manage', label: 'Методкопилка (методист)' },
  { code: 'courses.manage', section: 'courses', screen: 'studio', action: 'manage', label: 'Студия курсов (методист)' },
  { code: 'curation.assign', section: 'curation', screen: 'teachers', action: 'assign', label: 'Курирование/назначение (методист)' },
  { code: 'schedule.build', section: 'schedule', screen: 'builder', action: 'build', label: 'Сборка расписания (завуч)' },
  { code: 'materials.lesson.generate', section: 'materials', screen: 'lesson', action: 'generate', label: 'Генерация материалов' },
  { code: 'materials.textbook.upload', section: 'materials', screen: 'textbook', action: 'upload', label: 'Загрузка учебника (учитель)' },
  // Communitoria (каналы/объявления). admin/owner — tenancy-роли Флёра, в токен не приходят (§7.4),
  // поэтому «завуч/админ» на объявлениях = доменная роль завуча; админ действует через панель Флёра.
  { code: 'comm.channel.manage', section: 'comm', screen: 'channels', action: 'manage', label: 'Создание каналов Communitoria' },
  { code: 'comm.announcement.post', section: 'comm', screen: 'announcements', action: 'post', label: 'Публикация объявлений (завуч)' },
  { code: 'notes.teacher.edit', section: 'notes', screen: 'teacher', action: 'edit', label: 'Заметки учителя' },
  { code: 'schedule.view', section: 'schedule', screen: 'schedule', action: 'view', label: 'Расписание' },
  // методист
  { code: 'methodics.umk.view', section: 'methodics', screen: 'umk', action: 'view', label: 'УМК' },
  { code: 'methodics.rp.view', section: 'methodics', screen: 'rp', action: 'view', label: 'Рабочая программа' },
  // родитель / ученик
  { code: 'diary.child.view', section: 'diary', screen: 'child', action: 'view', label: 'Дневник ребёнка' },
  { code: 'grades.child.view', section: 'grades', screen: 'child', action: 'view', label: 'Оценки ребёнка' },
  { code: 'tasks.view', section: 'tasks', screen: 'tasks', action: 'view', label: 'Задания' },
  { code: 'progress.view', section: 'progress', screen: 'progress', action: 'view', label: 'Успеваемость' },
  // психолог (risk-карта — гейт согласия на профилирование, §6.3)
  { code: 'psych.cases.view', section: 'psych', screen: 'cases', action: 'view', label: 'Кейсы' },
  { code: 'psych.sessions.view', section: 'psych', screen: 'sessions', action: 'view', label: 'Сессии' },
  { code: 'psych.risk.view', section: 'psych', screen: 'risk', action: 'view', label: 'Risk-карта' },
];

// Каталог строится ТОЛЬКО на доменных ролях (teacher|student|parent|staff·завуч/методист/
// психолог). admin/owner — tenancy-роли Флёра (RoleAssignment), в токен не приходят (канон
// §7.4) → пакетов на них нет; их кабинеты ведёт панель Флёра/walk-up, не каталог RP.
export const ROLE_PACKAGES: RolePackageDef[] = [
  { key: 'teacher', cabinet: 'teacher', label: 'Кабинет учителя', permissions: ['journal.grades.view', 'journal.grades.edit', 'planning.ktp.view', 'planning.ktp.edit', 'materials.lesson.generate', 'materials.textbook.upload', 'comm.channel.manage', 'notes.teacher.edit', 'lesson.conduct', 'schedule.view'] },
  { key: 'zavuch', cabinet: 'zavuch', label: 'Кабинет завуча', permissions: ['structure.disciplines.manage', 'structure.distribution.manage', 'planning.ktp.view', 'planning.ktp.edit', 'planning.ktp.approve', 'planning.kpp.approve', 'standards.assessment.manage', 'standards.org.manage', 'standards.fgos.approve', 'comm.channel.manage', 'comm.announcement.post', 'schedule.build', 'schedule.view'] },
  { key: 'methodist', cabinet: 'methodist', label: 'Кабинет методиста', permissions: ['structure.disciplines.manage', 'methodics.umk.view', 'methodics.rp.view', 'standards.timing.manage', 'methodics.manage', 'courses.manage', 'curation.assign', 'comm.channel.manage'] },
  { key: 'parent', cabinet: 'parent', label: 'Кабинет родителя', permissions: ['diary.child.view', 'grades.child.view', 'schedule.view'] },
  { key: 'student', cabinet: 'student', label: 'Кабинет ученика', permissions: ['tasks.view', 'schedule.view', 'progress.view'] },
  { key: 'psychologist', cabinet: 'psychologist', label: 'Кабинет психолога', permissions: ['psych.cases.view', 'psych.sessions.view', 'psych.risk.view'] },
];

/** Идемпотентно засеять каталог в БД из канонического определения (boot + сид). */
export async function syncAuthzCatalog(prisma: PrismaClient): Promise<void> {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { section: p.section, screen: p.screen, action: p.action, label: p.label },
      create: p,
    });
  }
  for (const pkg of ROLE_PACKAGES) {
    const row = await prisma.rolePackage.upsert({
      where: { key: pkg.key },
      update: { cabinet: pkg.cabinet, label: pkg.label },
      create: { key: pkg.key, cabinet: pkg.cabinet, label: pkg.label },
    });
    for (const code of pkg.permissions) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      await prisma.rolePackagePermission.upsert({
        where: { rolePackageId_permissionId: { rolePackageId: row.id, permissionId: perm.id } },
        update: {},
        create: { rolePackageId: row.id, permissionId: perm.id },
      });
    }
  }
  // прунинг: убрать пакеты, выпавшие из канона (например прежние admin/owner — tenancy-роли,
  // каталог на них не строим). Связи RolePackagePermission уходят каскадом.
  const keep = ROLE_PACKAGES.map((p) => p.key);
  await prisma.rolePackage.deleteMany({ where: { key: { notIn: keep } } });
}
