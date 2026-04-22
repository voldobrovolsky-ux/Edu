import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { timetableSlotStore } from "../store/timetableSlotStore.js";
import type { TimetableLesson } from "../types/timetable.js";

function getWeekdayMon1(dateIso: string): 1 | 2 | 3 | 4 | 5 | null {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = ((date.getDay() + 6) % 7) + 1;
  if (weekday < 1 || weekday > 5) return null;
  return weekday as 1 | 2 | 3 | 4 | 5;
}

function getWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function iterWeekdaysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    const dow = getWeekdayMon1(cur);
    if (dow) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

type PatternEntry = {
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  slotIndex: number;
  groupNumber: number | null;
  template: TimetableLesson;
};

function buildPatternEntries(args: {
  candidates: TimetableLesson[];
  grade: number;
  disciplineCode: string;
  teacherUserId: string;
  allowedAllGroups: boolean;
  allowedGroupNumbers: Set<number> | null;
}): PatternEntry[] {
  const { candidates, grade, disciplineCode, teacherUserId, allowedAllGroups, allowedGroupNumbers } = args;
  const filtered = candidates.filter((l) => {
    if (l.grade !== grade || l.disciplineCode !== disciplineCode || l.teacherUserId !== teacherUserId) return false;
    if (allowedAllGroups) return true;
    if (l.groupNumber == null) return false;
    return allowedGroupNumbers!.has(l.groupNumber);
  });

  const byKey = new Map<string, TimetableLesson>();
  for (const l of filtered) {
    const dow = getWeekdayMon1(l.date);
    if (!dow) continue;
    const g = l.groupNumber == null ? "all" : String(l.groupNumber);
    const key = `${dow}|${l.slotIndex}|${g}`;
    if (!byKey.has(key)) byKey.set(key, l);
  }

  const entries: PatternEntry[] = [];
  for (const l of byKey.values()) {
    const dow = getWeekdayMon1(l.date);
    if (!dow) continue;
    entries.push({
      dayOfWeek: dow,
      slotIndex: l.slotIndex,
      groupNumber: l.groupNumber ?? null,
      template: l,
    });
  }
  return entries;
}

/**
 * Для журнала: в пределах [from, to] создаёт недостающие строки TimetableLesson
 * по шаблону уже существующих уроков этого учителя и предмета (тот же день недели / слот / группа).
 * Так в таблице видны все колонки четверти, а не только неделя, для которой успели заполнить сетку.
 */
export function ensureJournalQuarterLessonsMaterialized(args: {
  from: string;
  to: string;
  grade: number;
  disciplineCode: string;
  teacherUserId: string;
  allowedAllGroups: boolean;
  allowedGroupNumbers: Set<number> | null;
}): void {
  const inRange = timetableLessonStore.listByDateRange({ from: args.from, to: args.to }).filter((l) => {
    if (l.grade !== args.grade || l.disciplineCode !== args.disciplineCode || l.teacherUserId !== args.teacherUserId) {
      return false;
    }
    if (args.allowedAllGroups) return true;
    if (l.groupNumber == null) return false;
    return args.allowedGroupNumbers!.has(l.groupNumber);
  });

  let patternSource = inRange;
  if (patternSource.length === 0) {
    const broad = timetableLessonStore.listByTeacher({ teacherUserId: args.teacherUserId });
    patternSource = broad.filter((l) => {
      if (l.grade !== args.grade || l.disciplineCode !== args.disciplineCode) return false;
      if (args.allowedAllGroups) return true;
      if (l.groupNumber == null) return false;
      return args.allowedGroupNumbers!.has(l.groupNumber);
    });
  }

  const patternEntries = buildPatternEntries({
    candidates: patternSource,
    grade: args.grade,
    disciplineCode: args.disciplineCode,
    teacherUserId: args.teacherUserId,
    allowedAllGroups: args.allowedAllGroups,
    allowedGroupNumbers: args.allowedGroupNumbers,
  });
  if (patternEntries.length === 0) return;

  const dates = iterWeekdaysInRange(args.from, args.to);

  for (const dateIso of dates) {
    const dow = getWeekdayMon1(dateIso);
    if (!dow) continue;
    const weekStart = getWeekStart(dateIso);

    for (const pe of patternEntries) {
      if (pe.dayOfWeek !== dow) continue;

      const slotPattern = timetableSlotStore.findLessonByDayAndSlot({
        dayOfWeek: dow,
        slotIndex: pe.slotIndex,
        weekStart,
      });
      if (!slotPattern || slotPattern.kind !== "lesson") continue;

      const exists = timetableLessonStore
        .listByDate(dateIso)
        .some(
          (l) =>
            l.grade === args.grade &&
            l.disciplineCode === args.disciplineCode &&
            l.teacherUserId === args.teacherUserId &&
            l.slotIndex === pe.slotIndex &&
            (l.groupNumber ?? null) === pe.groupNumber,
        );
      if (exists) continue;

      const t = pe.template;
      timetableLessonStore.upsert({
        date: dateIso,
        slotIndex: pe.slotIndex,
        grade: args.grade,
        groupNumber: pe.groupNumber,
        disciplineCode: args.disciplineCode,
        teacherUserId: args.teacherUserId,
        teacherLoadId: t.teacherLoadId ?? null,
        slotPatternId: slotPattern.id,
        classGroupId: t.classGroupId ?? null,
      });
    }
  }
}
