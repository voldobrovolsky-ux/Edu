import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { classStore } from "../store/classStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { timetableConfigStore } from "../store/timetableConfigStore.js";
import { timetableSlotStore } from "../store/timetableSlotStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { timetableTeacherColorsStore } from "../store/timetableTeacherColorsStore.js";
import { timetableVisualBlocksStore } from "../store/timetableVisualBlocksStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import {
  computeTimetableSlots,
  eventTargetsGradeOrGroup,
  isEventBlockingSlot,
} from "../services/effectiveLessons.js";
import { ensureDefaultGroupsForGrade, getClassPartLabel, groupNumberToPart, resolveClassGroup } from "../services/schoolStructure.js";
import type { CalendarEvent } from "../types/calendar.js";
import type { TimetableLesson } from "../types/timetable.js";
import { isHHMM, isIsoDate } from "../utils/time.js";

export const timetableRouter = Router();

/** Завуч / директор / учётная запись admin — полное управление сеткой расписания. */
function isTimetableManager(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  if (!user) return false;
  if (user.username.trim().toLowerCase() === "admin") return true;
  return user.primaryRole === "head_teacher" || user.primaryRole === "director" || user.primaryRole === "sysadmin";
}

function mapLessonForGrid(lesson: any) {
  const discipline = disciplineStore.findByCode(lesson.disciplineCode);
  const teacher = userStore.findById(lesson.teacherUserId);
  return {
    ...lesson,
    teacherLoadId: lesson.teacherLoadId ?? null,
    disciplineName: discipline?.name ?? lesson.disciplineCode,
    teacherName: teacher ? `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim() : lesson.teacherUserId,
  };
}

function mapEventForGrid(event: CalendarEvent) {
  return {
    ...event,
    kind: event.kind ?? "general",
    serviceType: event.serviceType ?? null,
  };
}

function getWeekdayMon1(dateIso: string): 1 | 2 | 3 | 4 | 5 | null {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = ((date.getDay() + 6) % 7) + 1;
  if (weekday < 1 || weekday > 5) return null;
  return weekday as 1 | 2 | 3 | 4 | 5;
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isFutureWeek(weekStart: string): boolean {
  return todayIso() < weekStart;
}

function buildLessonOptionsForContext(args: {
  grade: number;
  groupNumber?: number | null;
  teacherUserId?: string | null;
  disciplineCode?: string | null;
  classGroupId?: string | null;
}) {
  return teacherLoadStore
    .listForContext({
      grade: args.grade,
      groupNumber: args.groupNumber ?? null,
      teacherUserId: args.teacherUserId ?? null,
      disciplineCode: args.disciplineCode ?? null,
      classGroupId: args.classGroupId ?? null,
    })
    .flatMap((load) => {
      const discipline = disciplineStore.findByCode(load.disciplineCode);
      const teacher = userStore.findById(load.teacherUserId);
      if (!discipline || !teacher) return [];
      return [
        {
          teacherLoadId: load.id,
          part: groupNumberToPart(load.groupNumber ?? null),
          partLabel: getClassPartLabel(load.groupNumber ?? null),
          groupNumber: load.groupNumber ?? null,
          classGroupId: load.classGroupId ?? null,
          disciplineCode: load.disciplineCode,
          disciplineName: discipline.name,
          teacherUserId: load.teacherUserId,
          teacherName: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim(),
        },
      ];
    })
    .sort((a, b) => a.disciplineName.localeCompare(b.disciplineName, "ru") || a.teacherName.localeCompare(b.teacherName, "ru"));
}

function listLessonsForPatternWeek(weekStart: string, slot: { dayOfWeek: number; slotIndexStart: number; slotIndexEnd: number }) {
  const date = addDays(weekStart, slot.dayOfWeek - 1);
  return timetableLessonStore
    .listByDate(date)
    .filter((lesson) => lesson.slotIndex >= slot.slotIndexStart && lesson.slotIndex <= slot.slotIndexEnd);
}

function weekHasSchedule(weekStart: string): boolean {
  return (
    timetableLessonStore.listByDateRange({ from: weekStart, to: addDays(weekStart, 4) }).length > 0 ||
    timetableSlotStore.hasWeekOverrides(weekStart)
  );
}

function findPreviousScheduledWeek(targetWeekStart: string): string | null {
  const lessonWeeks = timetableLessonStore
    .listByDateRange({ from: "2000-01-01", to: addDays(targetWeekStart, -1) })
    .map((lesson) => getWeekStart(lesson.date));
  const slotWeeks = timetableSlotStore
    .list()
    .map((slot) => slot.weekStart ?? null)
    .filter((week): week is string => typeof week === "string" && week < targetWeekStart);
  const candidates = Array.from(new Set([...lessonWeeks, ...slotWeeks])).filter((week) => week < targetWeekStart);
  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0] ?? null;
}

function buildAvailableLessonOptions(args: {
  grade: number;
  cellLessons: Array<{ groupNumber?: number | null }>;
  blockedGroupNumbers: number[];
  blockedWholeClass: boolean;
}) {
  const hasWholeClassLesson = args.cellLessons.some((lesson) => lesson.groupNumber == null);
  const occupiedGroups = new Set(
    args.cellLessons.map((lesson) => (lesson.groupNumber == null ? null : lesson.groupNumber)).filter((group): group is number => group != null),
  );
  const blockedGroups = new Set(args.blockedGroupNumbers);

  return teacherLoadStore
    .listByGrade(args.grade)
    .flatMap((load) => {
      const discipline = disciplineStore.findByCode(load.disciplineCode);
      const teacher = userStore.findById(load.teacherUserId);
      const groupNumber = load.groupNumber ?? null;

      if (!discipline || discipline.grade !== args.grade || !teacher) return [];
      if (groupNumber == null) {
        if (args.blockedWholeClass || hasWholeClassLesson || occupiedGroups.size > 0) return [];
      } else {
        if (args.blockedWholeClass || hasWholeClassLesson || blockedGroups.has(groupNumber) || occupiedGroups.has(groupNumber)) {
          return [];
        }
      }

      return [
        {
          teacherLoadId: load.id,
          part: groupNumberToPart(groupNumber),
          partLabel: getClassPartLabel(groupNumber),
          groupNumber,
          classGroupId: load.classGroupId ?? null,
          disciplineCode: load.disciplineCode,
          disciplineName: discipline.name,
          teacherUserId: load.teacherUserId,
          teacherName: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim(),
        },
      ];
    })
    .sort((a, b) => {
      const groupA = a.groupNumber ?? 0;
      const groupB = b.groupNumber ?? 0;
      if (groupA !== groupB) return groupA - groupB;
      if (a.disciplineName !== b.disciplineName) return a.disciplineName.localeCompare(b.disciplineName, "ru");
      return a.teacherName.localeCompare(b.teacherName, "ru");
    });
}

timetableRouter.get("/config", requireAuth, (_req, res) => {
  return res.json({ config: timetableConfigStore.get() });
});

timetableRouter.patch("/config", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const { defaultLessonMinutes, dayStartTime, workdayStartTime, workdayEndTime, lunchTime, lessonTimesBySlotIndex } = req.body ?? {};

  const patch: any = {};
  if (defaultLessonMinutes != null) {
    if (!Number.isInteger(defaultLessonMinutes) || defaultLessonMinutes <= 0) {
      return res.status(400).json({ error: "INVALID_DEFAULT_LESSON_MINUTES" });
    }
    patch.defaultLessonMinutes = defaultLessonMinutes;
  }
  if (dayStartTime != null) {
    if (typeof dayStartTime !== "string" || !isHHMM(dayStartTime)) {
      return res.status(400).json({ error: "INVALID_DAY_START_TIME" });
    }
    patch.dayStartTime = dayStartTime;
  }

  if (workdayStartTime != null) {
    if (typeof workdayStartTime !== "string" || !isHHMM(workdayStartTime)) {
      return res.status(400).json({ error: "INVALID_WORKDAY_START_TIME" });
    }
    patch.workdayStartTime = workdayStartTime;
  }

  if (workdayEndTime != null) {
    if (typeof workdayEndTime !== "string" || !isHHMM(workdayEndTime)) {
      return res.status(400).json({ error: "INVALID_WORKDAY_END_TIME" });
    }
    patch.workdayEndTime = workdayEndTime;
  }

  if (lunchTime != null) {
    if (typeof lunchTime !== "string" || !isHHMM(lunchTime)) {
      return res.status(400).json({ error: "INVALID_LUNCH_TIME" });
    }
    patch.lunchTime = lunchTime;
  }

  if (lessonTimesBySlotIndex != null) {
    if (typeof lessonTimesBySlotIndex !== "object" || lessonTimesBySlotIndex === null || Array.isArray(lessonTimesBySlotIndex)) {
      return res.status(400).json({ error: "INVALID_LESSON_TIMES" });
    }
    const normalized: Record<string, { startTime: string; endTime: string }> = {};
    for (const [k, v] of Object.entries(lessonTimesBySlotIndex)) {
      if (typeof v !== "object" || v === null) continue;
      const startTime = (v as any).startTime;
      const endTime = (v as any).endTime;
      if (typeof startTime !== "string" || typeof endTime !== "string" || !isHHMM(startTime) || !isHHMM(endTime)) {
        return res.status(400).json({ error: "INVALID_LESSON_TIMES_ENTRY" });
      }
      normalized[String(k)] = { startTime, endTime };
    }
    patch.lessonTimesBySlotIndex = normalized;
  }

  return res.json({ config: timetableConfigStore.update(patch) });
});

timetableRouter.get("/slots", requireAuth, (_req, res) => {
  return res.json({
    slots: timetableSlotStore.list(),
    byDay: timetableSlotStore.listGroupedByDay(),
    computedByDay: {
      "1": computeTimetableSlots(1),
      "2": computeTimetableSlots(2),
      "3": computeTimetableSlots(3),
      "4": computeTimetableSlots(4),
      "5": computeTimetableSlots(5),
    },
  });
});

timetableRouter.put("/slots/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const { kind, serviceType, serviceDescription, weekStart = null, blockLabel, blockColorIndex } = req.body ?? {};
  try {
    const existing = timetableSlotStore.findById(id);
    if (!existing) return res.status(404).json({ error: "SLOT_PATTERN_NOT_FOUND" });
    if (weekStart && kind === "service" && listLessonsForPatternWeek(weekStart, existing).length > 0) {
      return res.status(400).json({ error: "SLOT_HAS_LESSONS" });
    }
    const normalizedServiceDescription =
      kind === "service" && serviceType === "other" ? (serviceDescription != null ? String(serviceDescription).trim() : "") : null;
    const slot = timetableSlotStore.updateById({
      id,
      weekStart,
      kind,
      serviceType,
      serviceDescription: normalizedServiceDescription,
      blockLabel: blockLabel !== undefined ? (blockLabel == null ? null : String(blockLabel).trim() || null) : undefined,
      blockColorIndex:
        blockColorIndex !== undefined
          ? blockColorIndex == null
            ? null
            : Number.isInteger(Number(blockColorIndex))
              ? Number(blockColorIndex)
              : null
          : undefined,
    });
    return res.json({ slot });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.post("/slots", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const dayOfWeek = Number(req.body?.dayOfWeek);
  const weekStart = req.body?.weekStart != null ? String(req.body.weekStart) : null;
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) {
    return res.status(400).json({ error: "INVALID_DAY_OF_WEEK" });
  }
  try {
    const slot = timetableSlotStore.createNextForDay(dayOfWeek as 1 | 2 | 3 | 4 | 5, weekStart);
    return res.status(201).json({ slot });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.delete("/slots/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : null;
  try {
    const existing = timetableSlotStore.findById(id);
    if (!existing) return res.status(404).json({ error: "SLOT_PATTERN_NOT_FOUND" });
    if (existing.kind === "service") return res.status(400).json({ error: "SERVICE_SLOT_CANNOT_BE_DELETED" });
    if (existing.slotIndexStart !== existing.slotIndexEnd) return res.status(400).json({ error: "MERGED_SLOT_CANNOT_BE_DELETED" });
    if (weekStart && listLessonsForPatternWeek(weekStart, existing).length > 0) {
      return res.status(400).json({ error: "SLOT_HAS_LESSONS" });
    }
    const slot = timetableSlotStore.deactivateById(id, weekStart);
    return res.json({ slot });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/**
 * Batch-reset ряда слотов в недельном расписании.
 * Для каждого slotPatternId:
 * - удаляет TimetableLesson в соответствующем слоте/дне/неделе
 * - переводит слот в учебный (kind="lesson", serviceType=null)
 */
timetableRouter.post("/slot-rows/reset", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : null;
  const slotPatternIdsRaw = Array.isArray(req.body?.slotPatternIds) ? req.body.slotPatternIds : null;
  const slotPatternIds: string[] = slotPatternIdsRaw
    ? slotPatternIdsRaw.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  if (!weekStart || !isIsoDate(weekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });
  if (slotPatternIds.length === 0) return res.status(400).json({ error: "SLOT_PATTERN_IDS_REQUIRED" });

  try {
    const unique = Array.from(new Set<string>(slotPatternIds));
    for (const slotId of unique) {
      // updateById с kind="lesson" гарантирует создание/использование недельной копии слота
      const updatedSlot = timetableSlotStore.updateById({
        id: slotId,
        weekStart,
        kind: "lesson",
        serviceType: null,
        serviceDescription: null,
      });

      const date = addDays(weekStart, updatedSlot.dayOfWeek - 1);
      // Удаляем все уроки в этом слоте по дате и диапазону номеров урока (как в week-view),
      // а не по slotPatternId — у TimetableLesson может быть другой/пустой slotPatternId.
      const lessons = listLessonsForPatternWeek(weekStart, updatedSlot);
      for (const lesson of lessons) timetableLessonStore.removeById(lesson.id);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/**
 * Batch-delete ряда слотов в недельном расписании.
 * - удаляет TimetableLesson внутри удаляемых slotPatternId
 * - деактивирует TimetableSlotPattern в рамках weekStart (с созданием недельных копий, если нужно)
 * Важно: не позволяет оставить меньше 2 активных слотов в день.
 */
timetableRouter.post("/slot-rows/delete", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : null;
  const slotPatternIdsRaw = Array.isArray(req.body?.slotPatternIds) ? req.body.slotPatternIds : null;
  const slotPatternIds: string[] = slotPatternIdsRaw
    ? slotPatternIdsRaw.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  if (!weekStart || !isIsoDate(weekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });
  if (slotPatternIds.length === 0) return res.status(400).json({ error: "SLOT_PATTERN_IDS_REQUIRED" });

  try {
    const unique = Array.from(new Set<string>(slotPatternIds));
    const first = timetableSlotStore.findById(unique[0]!);
    if (!first) return res.status(404).json({ error: "SLOT_PATTERN_NOT_FOUND" });
    const dayOfWeek = first.dayOfWeek;

    for (const id of unique) {
      const s = timetableSlotStore.findById(id);
      if (!s) return res.status(404).json({ error: "SLOT_PATTERN_NOT_FOUND" });
      if (s.dayOfWeek !== dayOfWeek) return res.status(400).json({ error: "SLOTS_MUST_BE_IN_SAME_DAY" });
    }

    const activeSlots = timetableSlotStore.listByDay(dayOfWeek, weekStart);
    if (activeSlots.length - unique.length < 2) return res.status(400).json({ error: "CANNOT_DELETE_LAST_TWO_SLOTS" });

    const date = addDays(weekStart, dayOfWeek - 1);
    for (const slotId of unique) {
      const deactivatedSlot = timetableSlotStore.deactivateById(slotId, weekStart);
      const lessons = listLessonsForPatternWeek(weekStart, deactivatedSlot);
      for (const lesson of lessons) timetableLessonStore.removeById(lesson.id);
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.put("/slots/:id/merge", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const weekStart = req.body?.weekStart != null ? String(req.body.weekStart) : null;
  try {
    const slot = timetableSlotStore.mergeWithRight(id, weekStart);
    return res.json({ slot });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/** Объединить последовательные одноурочные слоты от id до endSlotIndex включительно. */
timetableRouter.put("/slots/:id/merge-range", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const weekStart = req.body?.weekStart != null ? String(req.body.weekStart) : null;
  const endSlotIndex = Number(req.body?.endSlotIndex);
  if (!Number.isInteger(endSlotIndex) || endSlotIndex <= 0) {
    return res.status(400).json({ error: "INVALID_END_SLOT_INDEX" });
  }
  try {
    const slot = timetableSlotStore.mergeRangeToEndIndex(id, weekStart, endSlotIndex);
    return res.json({ slot });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.put("/slots/:id/split", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const weekStart = req.body?.weekStart != null ? String(req.body.weekStart) : null;
  try {
    const slots = timetableSlotStore.split(id, weekStart);
    return res.json({ slots });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.get("/lesson-options", requireAuth, (req, res) => {
  const grade = Number(req.query.grade);
  const groupNumber =
    req.query.groupNumber == null || String(req.query.groupNumber) === ""
      ? null
      : Number(req.query.groupNumber);
  const teacherUserId = req.query.teacherUserId != null ? String(req.query.teacherUserId) : null;
  if (!Number.isInteger(grade) || grade <= 0) return res.status(400).json({ error: "INVALID_GRADE" });
  if (groupNumber != null && (!Number.isInteger(groupNumber) || groupNumber <= 0)) {
    return res.status(400).json({ error: "INVALID_GROUP" });
  }
  return res.json({
    options: buildLessonOptionsForContext({
      grade,
      groupNumber,
      teacherUserId,
    }),
  });
});

/**
 * Базовые уроки расписания (без применения перекрытий календаря).
 */
timetableRouter.get("/lessons", requireAuth, (req, res) => {
  const date = req.query.date != null ? String(req.query.date) : null;
  const from = req.query.from != null ? String(req.query.from) : null;
  const to = req.query.to != null ? String(req.query.to) : null;
  if (date) {
    if (!isIsoDate(date)) return res.status(400).json({ error: "INVALID_DATE" });
    return res.json({ lessons: timetableLessonStore.listByDate(date) });
  }
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to)) {
    return res.status(400).json({ error: "DATE_RANGE_REQUIRED" });
  }
  return res.json({ lessons: timetableLessonStore.listByDateRange({ from, to }) });
});

timetableRouter.post("/lessons", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });

  const { date, slotIndex, grade, groupNumber = null, disciplineCode, teacherUserId, teacherLoadId = null } = req.body ?? {};

  if (typeof date !== "string" || !isIsoDate(date)) return res.status(400).json({ error: "INVALID_DATE" });
  if (!Number.isInteger(slotIndex) || slotIndex <= 0) return res.status(400).json({ error: "INVALID_SLOT_INDEX" });
  if (!Number.isInteger(grade) || grade <= 0) return res.status(400).json({ error: "INVALID_GRADE" });
  if (groupNumber != null && (!Number.isInteger(groupNumber) || groupNumber <= 0)) {
    return res.status(400).json({ error: "INVALID_GROUP" });
  }
  if (typeof disciplineCode !== "string") return res.status(400).json({ error: "INVALID_DISCIPLINE_CODE" });
  if (typeof teacherUserId !== "string") return res.status(400).json({ error: "INVALID_TEACHER" });
  if (teacherLoadId != null && typeof teacherLoadId !== "string") return res.status(400).json({ error: "INVALID_TEACHER_LOAD" });

  if (!classStore.findByGrade(grade)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
  const dayOfWeek = getWeekdayMon1(date);
  if (!dayOfWeek) return res.status(400).json({ error: "OUTSIDE_WORKWEEK" });
  const slotPattern = timetableSlotStore.findLessonByDayAndSlot({ dayOfWeek, slotIndex, weekStart: getWeekStart(date) });
  if (!slotPattern) return res.status(400).json({ error: "SLOT_NOT_FOUND_OR_NOT_LESSON" });

  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  if (discipline.grade !== grade) {
    return res.status(400).json({ error: `Предмет «${disciplineCode}» не относится к классу ${grade}.` });
  }

  const teacher = userStore.findById(teacherUserId);
  if (!teacher) return res.status(400).json({ error: "TEACHER_NOT_FOUND" });
  const normalizedGroupForAccess = groupNumber == null ? null : groupNumber;
  const classGroup =
    normalizedGroupForAccess == null
      ? null
      : resolveClassGroup({
          grade,
          groupNumber: normalizedGroupForAccess,
          autoCreateDefault: true,
        });

  if (normalizedGroupForAccess != null && !classGroup) {
    return res.status(400).json({ error: `Группа ${normalizedGroupForAccess} не найдена для класса ${grade}.` });
  }

  const teacherLoad =
    (teacherLoadId ? teacherLoadStore.findById(teacherLoadId) ?? null : null) ??
    teacherLoadStore.findMatchingLoad({
      teacherUserId,
      disciplineCode,
      grade,
      groupNumber: normalizedGroupForAccess,
      classGroupId: classGroup?.id ?? null,
    });
  if (!teacherLoad || teacherLoad.teacherUserId !== teacherUserId || teacherLoad.disciplineCode !== disciplineCode) {
    return res.status(400).json({
      error:
        normalizedGroupForAccess == null
          ? `Для урока на весь класс нужна нагрузка учителя по предмету «${disciplineCode}» в ${grade} классе.`
          : `Для ${normalizedGroupForAccess} группы нужна соответствующая нагрузка учителя по предмету «${disciplineCode}».`,
    });
  }

  // Конфликты в одной “ячейке” расписания (date + slot + grade):
  const day = timetableLessonStore.listByDate(date).filter((l) => l.grade === grade && l.slotIndex === slotIndex);
  const hasWholeClass = day.some((l) => l.groupNumber == null);
  const groupLessons = day.filter((l) => l.groupNumber != null);
  const normalizedGroup = groupNumber == null ? null : groupNumber;

  if (normalizedGroup == null) {
    if (day.length > 0) return res.status(400).json({ error: "CELL_ALREADY_HAS_LESSONS" });
  } else {
    if (hasWholeClass) return res.status(400).json({ error: "CELL_HAS_WHOLE_CLASS_LESSON" });
    if (groupLessons.some((l) => l.groupNumber === normalizedGroup)) {
      return res.status(400).json({ error: "CELL_HAS_GROUP_LESSON" });
    }
    if (groupLessons.length >= 2) return res.status(400).json({ error: "MAX_2_GROUP_LESSONS_PER_SLOT" });
  }

  const lesson = timetableLessonStore.upsert({
    date,
    slotIndex,
    slotPatternId: slotPattern.id,
    grade,
    groupNumber: normalizedGroup,
    classGroupId: classGroup?.id ?? null,
    disciplineCode,
    teacherUserId,
    teacherLoadId: teacherLoad.id,
  });
  return res.status(201).json({ lesson });
});

timetableRouter.patch("/lessons/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const lesson = timetableLessonStore.findById(id);
  if (!lesson) return res.status(404).json({ error: "LESSON_NOT_FOUND" });

  const teacherLoadId = req.body?.teacherLoadId != null ? String(req.body.teacherLoadId) : null;
  const disciplineCode = req.body?.disciplineCode != null ? String(req.body.disciplineCode) : lesson.disciplineCode;
  const teacherUserId = req.body?.teacherUserId != null ? String(req.body.teacherUserId) : lesson.teacherUserId;
  const teacherLoad =
    (teacherLoadId ? teacherLoadStore.findById(teacherLoadId) ?? null : null) ??
    teacherLoadStore.findMatchingLoad({
      teacherUserId,
      disciplineCode,
      grade: lesson.grade,
      groupNumber: lesson.groupNumber ?? null,
      classGroupId: lesson.classGroupId ?? null,
    });

  if (!teacherLoad || teacherLoad.teacherUserId !== teacherUserId || teacherLoad.disciplineCode !== disciplineCode) {
    return res.status(400).json({
      error:
        lesson.groupNumber == null
          ? "Для выбранного предмета нет подходящей связки TeacherLoad для всего класса."
          : `Для ${lesson.groupNumber} группы нет подходящей связки TeacherLoad по выбранному предмету.`,
    });
  }

  try {
    const updated = timetableLessonStore.updateById(id, {
      disciplineCode,
      teacherUserId,
      teacherLoadId: teacherLoad.id,
    });
    return res.json({ lesson: updated });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.delete("/lessons/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  timetableLessonStore.removeById(id);
  return res.json({ ok: true });
});

/**
 * Представление дня: computed slots + “что реально в ячейке” с учётом событий.
 * Важно: это не отдельное расписание журнала. Это “эффективное” отображение,
 * где события временно заменяют уроки.
 */
timetableRouter.get("/day-view", requireAuth, (req, res) => {
  const date = String(req.query.date ?? "");
  const gradesParam = String(req.query.grades ?? "");
  if (!isIsoDate(date)) return res.status(400).json({ error: "INVALID_DATE" });
  const grades = gradesParam
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));
  if (grades.length === 0) return res.status(400).json({ error: "GRADES_REQUIRED" });

  const dayOfWeek = getWeekdayMon1(date);
  if (!dayOfWeek) return res.status(400).json({ error: "OUTSIDE_WORKWEEK" });
  const computedSlots = computeTimetableSlots(dayOfWeek, getWeekStart(date));
  const lessons = timetableLessonStore.listByDate(date).filter((l) => grades.includes(l.grade));
  const events = calendarEventStore.listByDate(date).filter((e) => e.status !== "cancelled");

  const byGrade: Record<string, any> = {};
  for (const grade of grades) {
    const groups = ensureDefaultGroupsForGrade(grade);
    byGrade[String(grade)] = computedSlots.map((slot) => {
      const cellLessons = lessons.filter(
        (l) => l.grade === grade && l.slotIndex >= slot.slotIndex && l.slotIndex <= (slot.slotIndexEnd ?? slot.slotIndex),
      );
      const gradeWideEvents = events.filter((ev) => {
        if (!isEventBlockingSlot({ event: ev, slot })) return false;
        return ev.grades.includes(grade);
      });

      const groupEventsByNumber = new Map<number, CalendarEvent[]>();
      for (const group of groups) {
        const matchingEvents = events.filter(
          (ev) =>
            !gradeWideEvents.some((gradeEvent) => gradeEvent.id === ev.id) &&
            eventTargetsGradeOrGroup({ event: ev, grade, groupNumber: group.groupNumber }) &&
            isEventBlockingSlot({ event: ev, slot }),
        );
        groupEventsByNumber.set(group.groupNumber, matchingEvents);
      }

      const availableOptions = slot.kind === "lesson" ? buildAvailableLessonOptions({
        grade,
        cellLessons,
        blockedWholeClass: gradeWideEvents.length > 0,
        blockedGroupNumbers: groups
          .filter((group) => (groupEventsByNumber.get(group.groupNumber) ?? []).length > 0)
          .map((group) => group.groupNumber),
      }) : [];

      if (gradeWideEvents.length > 0) {
        return {
          slotPatternId: slot.slotPatternId,
          slotIndex: slot.slotIndex,
          slotIndexEnd: slot.slotIndexEnd ?? slot.slotIndex,
          kind: slot.kind,
          serviceType: slot.serviceType ?? null,
          wholeClassEvents: gradeWideEvents.map(mapEventForGrid),
          wholeClass: {
            label: "Весь класс",
            lesson: null,
            availableOptions: [],
          },
          groups: groups.map((group) => ({
            id: group.id,
            label: getClassPartLabel(group.groupNumber),
            groupNumber: group.groupNumber,
            lesson: null,
            events: [],
            availableOptions: [],
          })),
        };
      }

      const wholeClassLesson = cellLessons.find((lesson) => lesson.groupNumber == null) ?? null;
      return {
        slotPatternId: slot.slotPatternId,
        slotIndex: slot.slotIndex,
        slotIndexEnd: slot.slotIndexEnd ?? slot.slotIndex,
        kind: slot.kind,
        serviceType: slot.serviceType ?? null,
        wholeClassEvents: [],
        wholeClass: {
          label: "Весь класс",
          lesson: wholeClassLesson ? mapLessonForGrid(wholeClassLesson) : null,
          availableOptions: availableOptions.filter((option) => option.groupNumber == null),
        },
        groups: groups.map((group) => {
          const lesson = cellLessons.find((item) => item.groupNumber === group.groupNumber) ?? null;
          const groupEvents = (groupEventsByNumber.get(group.groupNumber) ?? []).map(mapEventForGrid);
          return {
            id: group.id,
            label: getClassPartLabel(group.groupNumber),
            groupNumber: group.groupNumber,
            lesson: groupEvents.length > 0 ? null : lesson ? mapLessonForGrid(lesson) : null,
            events: groupEvents,
            availableOptions: groupEvents.length > 0
              ? []
              : availableOptions.filter((option) => option.groupNumber === group.groupNumber),
          };
        }),
      };
    });
  }

  return res.json({
    date,
    computedSlots,
    grades,
    grid: byGrade,
  });
});

timetableRouter.get("/week-view", requireAuth, (req, res) => {
  const weekStart = String(req.query.weekStart ?? "");
  const gradesParam = String(req.query.grades ?? "");
  if (!isIsoDate(weekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });
  const grades = gradesParam
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));
  if (grades.length === 0) return res.status(400).json({ error: "GRADES_REQUIRED" });

  timetableSlotStore.splitAllMergedPatterns();

  const dates = [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset));
  const lessons = timetableLessonStore.listByDateRange({ from: dates[0]!, to: dates[4]! });
  const eventsAll = calendarEventStore.listByDateRange({ from: dates[0]!, to: dates[4]! }).filter((e) => e.status !== "cancelled");
  const days: Record<string, any> = {};

  for (let dayOfWeek = 1 as const; dayOfWeek <= 5; dayOfWeek++) {
    const date = dates[dayOfWeek - 1]!;
    const slots = timetableSlotStore.listByDay(dayOfWeek, weekStart);
    const computedSlots = computeTimetableSlots(dayOfWeek, weekStart);
    const computedBySlotId = new Map<string, any>(computedSlots.map((s) => [s.slotPatternId as string, s]));
    const byGrade: Record<string, any[]> = {};
    for (const grade of grades) {
      const groups = ensureDefaultGroupsForGrade(grade);
      byGrade[String(grade)] = slots.map((slot) => {
        const cellLessons = lessons.filter(
          (l) => l.date === date && l.grade === grade && l.slotIndex >= slot.slotIndexStart && l.slotIndex <= slot.slotIndexEnd,
        );
        const computedSlot = computedBySlotId.get(slot.id);
        const eventsOnThisSlot =
          computedSlot == null
            ? []
            : eventsAll.filter((event) => event.date === date && isEventBlockingSlot({ event, slot: computedSlot }));

        const gradeWideEvents = eventsOnThisSlot.filter((ev) => ev.grades.includes(grade));

        const groupEventsByNumber = new Map<number, CalendarEvent[]>();
        for (const group of groups) {
          const matchingEvents = eventsOnThisSlot.filter(
            (ev) =>
              !gradeWideEvents.some((gradeEvent) => gradeEvent.id === ev.id) &&
              eventTargetsGradeOrGroup({ event: ev, grade, groupNumber: group.groupNumber }) &&
              isEventBlockingSlot({ event: ev, slot: computedSlot }),
          );
          groupEventsByNumber.set(group.groupNumber, matchingEvents);
        }

        const availableOptions =
          slot.kind === "lesson"
            ? buildAvailableLessonOptions({
                grade,
                cellLessons,
                blockedWholeClass: gradeWideEvents.length > 0,
                blockedGroupNumbers: groups
                  .filter((group) => (groupEventsByNumber.get(group.groupNumber) ?? []).length > 0)
                  .map((group) => group.groupNumber),
              })
            : [];

        const wholeClassLesson = cellLessons.find((lesson) => lesson.groupNumber == null) ?? null;

        if (gradeWideEvents.length > 0) {
          return {
            slotPatternId: slot.id,
            dayOfWeek,
            date,
            slotIndex: slot.slotIndexStart,
            slotIndexEnd: slot.slotIndexEnd,
            kind: slot.kind,
            serviceType: slot.serviceType ?? null,
            serviceDescription: slot.serviceDescription ?? null,
            blockLabel: slot.blockLabel ?? null,
            blockColorIndex: slot.blockColorIndex ?? null,
            wholeClassEvents: gradeWideEvents.map(mapEventForGrid),
            wholeClass: {
              label: "Весь класс",
              lesson: null,
              availableOptions: [],
            },
            groups: groups.map((group) => ({
              id: group.id,
              label: getClassPartLabel(group.groupNumber),
              groupNumber: group.groupNumber,
              lesson: null,
              events: [],
              availableOptions: [],
            })),
          };
        }

        return {
          slotPatternId: slot.id,
          dayOfWeek,
          date,
          slotIndex: slot.slotIndexStart,
          slotIndexEnd: slot.slotIndexEnd,
          kind: slot.kind,
          serviceType: slot.serviceType ?? null,
          serviceDescription: slot.serviceDescription ?? null,
          blockLabel: slot.blockLabel ?? null,
          blockColorIndex: slot.blockColorIndex ?? null,
          wholeClassEvents: [],
          wholeClass: {
            label: "Весь класс",
            lesson: wholeClassLesson ? mapLessonForGrid(wholeClassLesson) : null,
            availableOptions: availableOptions.filter((option) => option.groupNumber == null),
          },
          groups: groups.map((group) => {
            const lesson = cellLessons.find((item) => item.groupNumber === group.groupNumber) ?? null;
            const groupEvents = (groupEventsByNumber.get(group.groupNumber) ?? []).map(mapEventForGrid);
            return {
              id: group.id,
              label: getClassPartLabel(group.groupNumber),
              groupNumber: group.groupNumber,
              lesson: groupEvents.length > 0 ? null : lesson ? mapLessonForGrid(lesson) : null,
              events: groupEvents,
              availableOptions: availableOptions.filter((option) => option.groupNumber === group.groupNumber),
            };
          }),
        };
      });
    }
    const slotTimes = computedSlots.map((cs) => ({
      slotPatternId: cs.slotPatternId,
      slotIndex: cs.slotIndex,
      slotIndexEnd: cs.slotIndexEnd ?? cs.slotIndex,
      startTime: cs.startTime,
      endTime: cs.endTime,
    }));
    days[String(dayOfWeek)] = { date, slots, grades: byGrade, slotTimes };
  }

  const cfg = timetableConfigStore.get();
  const visualBlocks = timetableVisualBlocksStore.listForWeek(weekStart, grades);
  return res.json({
    weekStart,
    grades,
    hasSchedule: weekHasSchedule(weekStart),
    canCopyFromPreviousWeek: isFutureWeek(weekStart),
    previousScheduledWeekStart: findPreviousScheduledWeek(weekStart),
    days,
    teacherColors: timetableTeacherColorsStore.get(),
    lessonTimesBySlotIndex: cfg.lessonTimesBySlotIndex ?? {},
    visualBlocks,
  });
});

timetableRouter.post("/copy-week", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const targetWeekStart = String(req.body?.targetWeekStart ?? "");
  if (!isIsoDate(targetWeekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });
  if (!isFutureWeek(targetWeekStart)) return res.status(400).json({ error: "COPY_ONLY_FOR_FUTURE_WEEKS" });
  if (weekHasSchedule(targetWeekStart)) return res.status(400).json({ error: "TARGET_WEEK_ALREADY_EXISTS" });

  const sourceWeekStart = findPreviousScheduledWeek(targetWeekStart);
  if (!sourceWeekStart) return res.status(400).json({ error: "SOURCE_WEEK_NOT_FOUND" });

  const copiedSlots = timetableSlotStore.copyWeekPatterns(
    timetableSlotStore.hasWeekOverrides(sourceWeekStart) ? sourceWeekStart : null,
    targetWeekStart,
  );
  const copiedLessons = timetableLessonStore.replaceWeekLessons(sourceWeekStart, targetWeekStart);

  return res.status(201).json({
    sourceWeekStart,
    targetWeekStart,
    copiedSlots,
    copiedLessons,
  });
});

/**
 * Очистить текущую неделю в сетке: статусы слотов → «пустой» урок, уроки удаляются (опционально только выбранные классы).
 */
timetableRouter.post("/week/clear", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : null;
  const gradesRaw = Array.isArray(req.body?.grades) ? req.body.grades : null;
  const grades = gradesRaw ? gradesRaw.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0) : undefined;

  if (!weekStart || !isIsoDate(weekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });

  try {
    for (let dayOfWeek = 1 as const; dayOfWeek <= 5; dayOfWeek++) {
      const slots = timetableSlotStore.listByDay(dayOfWeek, weekStart);
      for (const slot of slots) {
        const updated = timetableSlotStore.updateById({
          id: slot.id,
          weekStart,
          kind: "lesson",
          serviceType: null,
          serviceDescription: null,
        });
        const lessons = listLessonsForPatternWeek(weekStart, updated);
        for (const lesson of lessons) {
          if (grades && grades.length > 0 && !grades.includes(lesson.grade)) continue;
          timetableLessonStore.removeById(lesson.id);
        }
      }
    }
    timetableVisualBlocksStore.removeForWeekAndGrades(weekStart, grades);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/**
 * Дублировать предыдущую неделю на текущую: сначала очистка target, затем копия шаблонов и уроков.
 */
timetableRouter.post("/week/duplicate-previous", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const targetWeekStart = typeof req.body?.targetWeekStart === "string" ? req.body.targetWeekStart : null;
  const gradesRaw = Array.isArray(req.body?.grades) ? req.body.grades : null;
  const grades = gradesRaw ? gradesRaw.map((x: unknown) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0) : undefined;

  if (!targetWeekStart || !isIsoDate(targetWeekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });

  const sourceWeekStart = findPreviousScheduledWeek(targetWeekStart);
  if (!sourceWeekStart) {
    return res.status(400).json({
      error: "NO_PREVIOUS_WEEK",
      message: "Нет расписания за предыдущую неделю — копировать нечего.",
    });
  }

  try {
    timetableLessonStore.removeLessonsInWeek(targetWeekStart, grades);
    const copiedSlots = timetableSlotStore.copyWeekPatterns(
      timetableSlotStore.hasWeekOverrides(sourceWeekStart) ? sourceWeekStart : null,
      targetWeekStart,
    );
    const copiedLessons = timetableLessonStore.duplicateWeekLessonsFiltered(sourceWeekStart, targetWeekStart, grades);
    return res.status(201).json({
      sourceWeekStart,
      targetWeekStart,
      copiedSlots,
      copiedLessons,
    });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.get("/teacher-colors", requireAuth, (_req, res) => {
  return res.json({ colors: timetableTeacherColorsStore.get() });
});

timetableRouter.patch("/teacher-colors", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const raw = req.body?.colors;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return res.status(400).json({ error: "INVALID_COLORS" });
  }
  const colors = timetableTeacherColorsStore.setAll(raw as Record<string, number>);
  return res.json({ colors });
});

function removeLessonsInSlotRangeForDay(args: {
  weekStart: string;
  dayOfWeek: number;
  grade: number;
  slotIndexStart: number;
  slotIndexEnd: number;
}) {
  const date = addDays(args.weekStart, args.dayOfWeek - 1);
  const lessons = timetableLessonStore
    .listByDate(date)
    .filter(
      (l) =>
        l.grade === args.grade && l.slotIndex >= args.slotIndexStart && l.slotIndex <= args.slotIndexEnd,
    );
  for (const l of lessons) timetableLessonStore.removeById(l.id);
}

function removeLessonsInVisualBlockRange(args: {
  weekStart: string;
  dayOfWeek: number;
  grade: number;
  gradeEnd: number;
  slotIndexStart: number;
  slotIndexEnd: number;
}) {
  for (let g = args.grade; g <= args.gradeEnd; g++) {
    removeLessonsInSlotRangeForDay({
      weekStart: args.weekStart,
      dayOfWeek: args.dayOfWeek,
      grade: g,
      slotIndexStart: args.slotIndexStart,
      slotIndexEnd: args.slotIndexEnd,
    });
  }
}

timetableRouter.post("/visual-blocks", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const weekStart = String(req.body?.weekStart ?? "");
  const dayOfWeek = Number(req.body?.dayOfWeek);
  let grade = Number(req.body?.grade);
  let gradeEnd = req.body?.gradeEnd != null ? Number(req.body.gradeEnd) : grade;
  const slotIndexStart = Number(req.body?.slotIndexStart);
  const slotIndexEnd = Number(req.body?.slotIndexEnd);
  const label = String(req.body?.label ?? "").trim();
  const colorIndex = Number(req.body?.colorIndex ?? 0);
  const kind = req.body?.kind === "blocked" ? "blocked" : "service";
  const serviceTypeRaw = req.body?.serviceType != null ? String(req.body.serviceType) : "lunch";
  const serviceDescription =
    kind === "service" && serviceTypeRaw === "other" ? (req.body?.serviceDescription != null ? String(req.body.serviceDescription).trim() : "") : null;

  if (!isIsoDate(weekStart)) return res.status(400).json({ error: "INVALID_WEEK_START" });
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) return res.status(400).json({ error: "INVALID_DAY" });
  if (!Number.isInteger(grade) || grade <= 0) return res.status(400).json({ error: "INVALID_GRADE" });
  if (!Number.isInteger(gradeEnd) || gradeEnd <= 0) return res.status(400).json({ error: "INVALID_GRADE_END" });
  if (gradeEnd < grade) [grade, gradeEnd] = [gradeEnd, grade];
  if (!Number.isInteger(slotIndexStart) || !Number.isInteger(slotIndexEnd) || slotIndexStart < 1 || slotIndexEnd < slotIndexStart) {
    return res.status(400).json({ error: "INVALID_SLOT_RANGE" });
  }
  if (!label) return res.status(400).json({ error: "LABEL_REQUIRED" });
  /** Не поддерживаем прямоугольник: только вертикаль (один класс) или горизонталь (одна строка времени). */
  if (grade < gradeEnd && slotIndexStart < slotIndexEnd) {
    return res.status(400).json({ error: "VISUAL_BLOCK_NOT_RECTANGLE" });
  }

  const serviceType =
    kind === "service" && ["lunch", "walk", "self_study", "other"].includes(serviceTypeRaw)
      ? (serviceTypeRaw as "lunch" | "walk" | "self_study" | "other")
      : kind === "service"
        ? "lunch"
        : null;

  if (
    timetableVisualBlocksStore.overlaps({
      weekStart,
      dayOfWeek,
      grade,
      gradeEnd,
      slotIndexStart,
      slotIndexEnd,
    })
  ) {
    return res.status(400).json({ error: "VISUAL_BLOCK_OVERLAP" });
  }

  try {
    removeLessonsInVisualBlockRange({ weekStart, dayOfWeek, grade, gradeEnd, slotIndexStart, slotIndexEnd });
    const block = timetableVisualBlocksStore.create({
      weekStart,
      dayOfWeek: dayOfWeek as 1 | 2 | 3 | 4 | 5,
      grade,
      gradeEnd,
      slotIndexStart,
      slotIndexEnd,
      label,
      colorIndex: Math.min(9, Math.max(0, Number.isInteger(colorIndex) ? colorIndex : 0)),
      kind,
      serviceType,
      serviceDescription: kind === "service" && serviceType === "other" ? serviceDescription : null,
    });
    return res.status(201).json({ block });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.patch("/visual-blocks/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const label = req.body?.label != null ? String(req.body.label).trim() : undefined;
  const colorIndex = req.body?.colorIndex != null ? Number(req.body.colorIndex) : undefined;
  const kind = req.body?.kind === "blocked" ? "blocked" : req.body?.kind === "service" ? "service" : undefined;
  const serviceType = req.body?.serviceType != null ? String(req.body.serviceType) : undefined;
  const serviceDescription = req.body?.serviceDescription != null ? String(req.body.serviceDescription) : undefined;

  const existing = timetableVisualBlocksStore.findById(id);
  if (!existing) return res.status(404).json({ error: "VISUAL_BLOCK_NOT_FOUND" });

  const patch: Parameters<typeof timetableVisualBlocksStore.updateById>[1] = {};
  if (label !== undefined) {
    if (!label) return res.status(400).json({ error: "LABEL_REQUIRED" });
    patch.label = label;
  }
  if (colorIndex !== undefined && Number.isInteger(colorIndex)) patch.colorIndex = Math.min(9, Math.max(0, colorIndex));
  if (kind !== undefined) {
    patch.kind = kind;
    patch.serviceType = kind === "service" ? (existing.serviceType ?? "lunch") : null;
    patch.serviceDescription = kind === "service" ? existing.serviceDescription : null;
  }
  if (serviceType != null && ["lunch", "walk", "self_study", "other"].includes(serviceType)) {
    patch.serviceType = serviceType as "lunch" | "walk" | "self_study" | "other";
  }
  if (serviceDescription !== undefined) patch.serviceDescription = serviceDescription || null;

  try {
    const block = timetableVisualBlocksStore.updateById(id, patch);
    return res.json({ block });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

timetableRouter.delete("/visual-blocks/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isTimetableManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = timetableVisualBlocksStore.findById(id);
  if (!existing) return res.status(404).json({ error: "VISUAL_BLOCK_NOT_FOUND" });
  timetableVisualBlocksStore.removeById(id);
  return res.json({ ok: true });
});

/**
 * Эффективный список уроков (для журнала/дневника): возвращает только те уроки,
 * которые НЕ перекрыты активными событиями календаря.
 */
timetableRouter.get("/effective-lessons", requireAuth, (req, res) => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!isIsoDate(from) || !isIsoDate(to)) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const grade = req.query.grade != null ? Number(req.query.grade) : null;
  const teacherUserId = req.query.teacherUserId != null ? String(req.query.teacherUserId) : null;
  const disciplineCode = req.query.disciplineCode != null ? String(req.query.disciplineCode) : null;
  const groupNumber = req.query.groupNumber != null ? Number(req.query.groupNumber) : null;

  let lessons = timetableLessonStore.listByDateRange({ from, to });
  if (grade != null && Number.isFinite(grade)) lessons = lessons.filter((l) => l.grade === grade);
  if (teacherUserId) lessons = lessons.filter((l) => l.teacherUserId === teacherUserId);
  if (disciplineCode) lessons = lessons.filter((l) => l.disciplineCode === disciplineCode);
  if (groupNumber != null && Number.isFinite(groupNumber)) {
    lessons = lessons.filter((l) => (l.groupNumber ?? null) === groupNumber);
  }

  const events = calendarEventStore.listByDateRange({ from, to }).filter((e) => e.status !== "cancelled");
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const arr = eventsByDate.get(ev.date) ?? [];
    arr.push(ev);
    eventsByDate.set(ev.date, arr);
  }

  const effective: (TimetableLesson & { blockedByEventId?: string | null })[] = [];
  for (const lesson of lessons) {
    const dayOfWeek = getWeekdayMon1(lesson.date);
    if (!dayOfWeek) continue;
    const daySlots = computeTimetableSlots(dayOfWeek);
    const slot = daySlots.find(
      (item) =>
        item.kind === "lesson" &&
        lesson.slotIndex >= item.slotIndex &&
        lesson.slotIndex <= (item.slotIndexEnd ?? item.slotIndex),
    );
    if (!slot) continue;
    const dayEvents = eventsByDate.get(lesson.date) ?? [];
    const blocker = dayEvents.find(
      (ev) =>
        eventTargetsGradeOrGroup({ event: ev, grade: lesson.grade, groupNumber: lesson.groupNumber ?? null }) &&
        isEventBlockingSlot({ event: ev, slot }),
    );
    if (blocker) continue; // “выбиваем” из журнала
    effective.push({ ...lesson, blockedByEventId: null });
  }

  return res.json({ lessons: effective });
});

