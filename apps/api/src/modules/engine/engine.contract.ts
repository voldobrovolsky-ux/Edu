/**
 * События движка планирования (Архстандарт §6 — мастер-каталог). Subjects `edustore.<домен>.<событие>`,
 * на kernel-outbox (DomainEvent-конверт). Имена существующих subject'ов не меняются — только новые.
 */
export const ENGINE_EVENTS = {
  ktpGenerated: 'edustore.ktp.generated',
  ktpApproved: 'edustore.ktp.approved',
  kppScheduled: 'edustore.kpp.scheduled',
  kppApproved: 'edustore.kpp.approved',
  scheduleBuilt: 'edustore.schedule.built',
  lessonStarted: 'edustore.lesson.started',
  lessonPhaseChanged: 'edustore.lesson.phase.changed',
  // сигналы результата → ИОМ (Архстандарт §6). attendance/topic несут реальный studentId.
  attendanceMarked: 'edustore.attendance.marked',
  topicProgressed: 'edustore.topic.progressed', // нетерминальное
  topicCompleted: 'edustore.topic.completed', // терминальное (mastery)
  // петля летучки. brieftest по присутствующим (КОДЫ); assessment.checked несёт studentCode (§3).
  brieftestGenerated: 'edustore.brieftest.generated',
  assessmentChecked: 'edustore.assessment.checked',
  // журнал — только grade.posted (реальный studentId); персонализация — ktp.shift.proposed (предложение)
  gradePosted: 'edustore.grade.posted',
  ktpShiftProposed: 'edustore.ktp.shift.proposed',
} as const;

export interface AttendanceMarkedV1 {
  lessonId: string;
  marks: { studentId: string; status: string; arrivalTime?: string }[];
}
export interface TopicProgressedV1 {
  lessonId: string;
  topicId: string;
  timeSpent: number;
}
export interface TopicCompletedV1 {
  lessonId: string;
  topicId: string;
}
export interface BrieftestGeneratedV1 {
  briefTestId: string;
  lessonId: string;
  count: number;
}
export interface AssessmentCheckedV1 {
  briefTestId: string;
  lessonId: string;
  results: { studentCode: string; score: number }[]; // КОДЫ (не studentId) — гейт §3
}
export interface GradePostedV1 {
  lessonId: string;
  studentId: string; // реальный (человеко-авторское)
  grade: string;
}
export interface KtpShiftProposedV1 {
  lessonId: string;
  action: string;
  reason?: string;
}

export interface KtpApprovedV1 {
  ktpId: string;
  classId: string;
  disciplineId: string;
}
/** Черновик КТП создан/дополнен генератором из разбора учебника (textbook.parsed). */
export interface KtpGeneratedV1 {
  ktpId: string;
  classId: string;
  disciplineId: string;
  materialId: string;
  topicsAdded: number;
  cardsAttached: number;
}
export interface KppScheduledV1 {
  kppId: string;
  classId: string;
  disciplineId: string;
  lessonCount: number;
}
export interface KppApprovedV1 {
  kppId: string;
}
export interface LessonStartedV1 {
  lessonId: string;
}
export interface LessonPhaseChangedV1 {
  lessonId: string;
  phase: string;
}
