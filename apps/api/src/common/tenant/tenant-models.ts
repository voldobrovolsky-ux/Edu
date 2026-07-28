/**
 * Доменные модели под изоляцией тенанта (§3.6, канон Флёра) → колонка ключа тенанта.
 * ЕДИНИЦА ИЗОЛЯЦИИ = школа = Workspace; ключ = workspaceId. Единый источник истины для
 * tenant-guard (и будущего RLS, ключуемого на workspaceId).
 *
 * НЕ перечисленные модели не фильтруются осознанно:
 *  - User / Membership / Session — directory & identity, доступ по florus_user_id
 *    (членства пользователя живут в РАЗНЫХ школах — фильтр по одной их бы скрыл);
 *  - Organization — ПЛАТФОРМА (одна, общая), не тенант; Worknet — tenancy-инфра (сеть);
 *  - OutboxEvent / ProcessedEvent — инфраструктура шины, читается системным воркером.
 * Workspace фильтруется по собственному `id` (видишь только свою школу).
 */
export const TENANT_COLUMN: Record<string, string> = {
  Workspace: 'id',
  Subject: 'workspaceId',
  Class: 'workspaceId',
  Lesson: 'workspaceId',
  Teacher: 'workspaceId',
  Device: 'workspaceId',
  ChannelMembership: 'workspaceId',
  MealOrder: 'workspaceId',
  Student: 'workspaceId',
  SubGroup: 'workspaceId',
  TeachingAssignment: 'workspaceId',
  Grade: 'workspaceId',
  GeneratedMaterial: 'workspaceId',
  StudentProfile: 'workspaceId',
  TeacherNote: 'workspaceId',
  Notification: 'workspaceId',
  Consent: 'workspaceId',
  AuditLog: 'workspaceId',
  Entitlement: 'workspaceId',
  // движок планирования (Phase 1)
  Ktp: 'workspaceId',
  KtpTopic: 'workspaceId',
  Timetable: 'workspaceId',
  TimetableSlot: 'workspaceId',
  Kpp: 'workspaceId',
  KppLesson: 'workspaceId',
  KppMapping: 'workspaceId',
  LessonContent: 'workspaceId',
  CompetencyNode: 'workspaceId',
  InterestNode: 'workspaceId',
  MasteryEdge: 'workspaceId',
  InterestEdge: 'workspaceId',
  BriefTest: 'workspaceId',
  BriefTestCode: 'workspaceId',
  AssessmentResult: 'workspaceId',
  AssessmentResultItem: 'workspaceId',
  JournalCell: 'workspaceId',
  AssessmentPolicy: 'workspaceId',
  TimingProfile: 'workspaceId',
  OrgStandards: 'workspaceId',
  WorkspaceSettings: 'workspaceId',
  FgosHours: 'workspaceId',
  Methodic: 'workspaceId',
  Course: 'workspaceId',
  CourseAssignment: 'workspaceId',
  // документохранилище
  File: 'workspaceId',
  DocVersion: 'workspaceId',
  Tag: 'workspaceId',
  Lens: 'workspaceId',
  Collection: 'workspaceId',
  CollectionFile: 'workspaceId',
  ShareGrant: 'workspaceId',
  // учебники / парсер (doc.file.enriched → textbook.parsed)
  Material: 'workspaceId',
  TextbookTopic: 'workspaceId',
  TextbookCard: 'workspaceId',
  // Communitoria (граф контактов + инварианты миноров)
  Parenthood: 'workspaceId',
  Channel: 'workspaceId',
  ChannelParticipant: 'workspaceId',
  // Communitoria (каналы/сообщения/объявления)
  Message: 'workspaceId',
  MessageReaction: 'workspaceId',
  Ack: 'workspaceId',
  // Пилотный auth (временный)
  PilotInvite: 'workspaceId',
};
