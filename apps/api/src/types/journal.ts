import type { GradeRanges } from "./school.js";

export type JournalLessonMeta = {
  id: string;
  timetableLessonId: string; // TimetableLesson.id
  topic: string;
  attachedDocumentIds: string[]; // Discipline.documents[].id
  /** Тип урока из справочника «Типы уроков» (настройки журнала). */
  journalLessonTypeId?: string | null;
  updatedAt: string;
  createdAt: string;
};

export type JournalLessonStudentMark = {
  id: string;
  timetableLessonId: string; // TimetableLesson.id
  studentUserId: string; // StoredUser.id (student)
  mark: number | null; // 1..5
  absent: boolean;
  updatedAt: string;
  createdAt: string;
};

export function computeFinalMark(args: { average: number | null; gradeRanges: GradeRanges }): number | null {
  const avg = args.average;
  if (avg == null || !Number.isFinite(avg)) return null;
  const ranges = args.gradeRanges;
  const keys: Array<"5" | "4" | "3" | "2" | "1"> = ["5", "4", "3", "2", "1"];
  for (const k of keys) {
    const r = ranges[k];
    if (!r) continue;
    if (avg >= r.min && avg <= r.max) return Number(k);
  }
  return null;
}

