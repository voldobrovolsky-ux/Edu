import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimetableLesson } from "../types/timetable.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "timetableLessons.json");

class TimetableLessonStore {
  private cache: TimetableLesson[] | null = null;

  private all(): TimetableLesson[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<TimetableLesson>(DATA_PATH);
      this.cache = raw.map((lesson) => ({
        ...lesson,
        slotPatternId: typeof lesson.slotPatternId === "string" ? lesson.slotPatternId : null,
        groupNumber: lesson.groupNumber ?? null,
        classGroupId: typeof lesson.classGroupId === "string" ? lesson.classGroupId : null,
        teacherLoadId: typeof lesson.teacherLoadId === "string" ? lesson.teacherLoadId : null,
      }));
    }
    return this.cache;
  }

  listByDate(date: string): TimetableLesson[] {
    return this.all().filter((l) => l.date === date);
  }

  findById(id: string): TimetableLesson | undefined {
    return this.all().find((l) => l.id === id);
  }

  listByDateRange(args: { from: string; to: string }): TimetableLesson[] {
    const { from, to } = args;
    return this.all().filter((l) => l.date >= from && l.date <= to);
  }

  listByTeacher(args: { teacherUserId: string; from?: string; to?: string }): TimetableLesson[] {
    const { teacherUserId, from, to } = args;
    return this.all().filter((l) => {
      if (l.teacherUserId !== teacherUserId) return false;
      if (from && l.date < from) return false;
      if (to && l.date > to) return false;
      return true;
    });
  }

  upsert(args: Omit<TimetableLesson, "id" | "createdAt">): TimetableLesson {
    const current = this.all();
    const groupKey = args.groupNumber == null ? null : args.groupNumber;
    const existing = current.find(
      (l) =>
        l.date === args.date &&
        l.slotIndex === args.slotIndex &&
        l.grade === args.grade &&
        (l.groupNumber == null ? null : l.groupNumber) === groupKey,
    );
    if (existing) return existing;

    const item: TimetableLesson = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...args,
      groupNumber: groupKey,
      classGroupId: args.classGroupId ?? null,
      teacherLoadId: args.teacherLoadId ?? null,
    };
    const next = [...current, item];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return item;
  }

  removeById(id: string): void {
    const current = this.all();
    const next = current.filter((l) => l.id !== id);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  updateById(
    id: string,
    patch: Partial<Pick<TimetableLesson, "disciplineCode" | "teacherUserId" | "teacherLoadId" | "slotPatternId">>,
  ): TimetableLesson {
    const current = this.all();
    const idx = current.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error("LESSON_NOT_FOUND");
    const prev = current[idx]!;
    const nextItem: TimetableLesson = {
      ...prev,
      disciplineCode: patch.disciplineCode ?? prev.disciplineCode,
      teacherUserId: patch.teacherUserId ?? prev.teacherUserId,
      teacherLoadId: patch.teacherLoadId !== undefined ? patch.teacherLoadId ?? null : prev.teacherLoadId ?? null,
      slotPatternId: patch.slotPatternId !== undefined ? patch.slotPatternId ?? null : prev.slotPatternId ?? null,
    };
    const next = [...current.slice(0, idx), nextItem, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextItem;
  }

  replaceWeekLessons(sourceWeekStart: string, targetWeekStart: string): TimetableLesson[] {
    const current = this.all();
    const sourceLessons = current.filter((lesson) => lesson.date >= sourceWeekStart && lesson.date <= addDays(sourceWeekStart, 4));
    const targetDateSet = new Set([0, 1, 2, 3, 4].map((offset) => addDays(targetWeekStart, offset)));
    const kept = current.filter((lesson) => !targetDateSet.has(lesson.date));
    const now = new Date().toISOString();
    const copied = sourceLessons.map((lesson) => ({
      ...lesson,
      id: randomUUID(),
      date: addDays(targetWeekStart, diffDays(sourceWeekStart, lesson.date)),
      createdAt: now,
    }));
    const next = [...kept, ...copied];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return copied;
  }

  /** Удаляет уроки в диапазоне дат target-недели; если grades задан — только эти классы. */
  removeLessonsInWeek(weekStart: string, grades?: number[]): number {
    const current = this.all();
    const weekDates = new Set([0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset)));
    const gradeSet = grades && grades.length > 0 ? new Set(grades) : null;
    const next = current.filter((lesson) => {
      if (!weekDates.has(lesson.date)) return true;
      if (!gradeSet) return false;
      return !gradeSet.has(lesson.grade);
    });
    const removed = current.length - next.length;
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return removed;
  }

  /** Копирует уроки с source-недели на target; опционально только выбранные классы. */
  duplicateWeekLessonsFiltered(sourceWeekStart: string, targetWeekStart: string, grades?: number[]): TimetableLesson[] {
    const current = this.all();
    let sourceLessons = current.filter((lesson) => lesson.date >= sourceWeekStart && lesson.date <= addDays(sourceWeekStart, 4));
    if (grades && grades.length > 0) {
      const gset = new Set(grades);
      sourceLessons = sourceLessons.filter((l) => gset.has(l.grade));
    }
    const now = new Date().toISOString();
    const copied = sourceLessons.map((lesson) => ({
      ...lesson,
      id: randomUUID(),
      date: addDays(targetWeekStart, diffDays(sourceWeekStart, lesson.date)),
      createdAt: now,
    }));
    const next = [...current, ...copied];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return copied;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDays(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((to - from) / 86400000);
}

export const timetableLessonStore = new TimetableLessonStore();

