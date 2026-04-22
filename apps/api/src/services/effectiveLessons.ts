import { timetableConfigStore } from "../store/timetableConfigStore.js";
import { timetableSlotStore } from "../store/timetableSlotStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import type { CalendarEvent } from "../types/calendar.js";
import type { TimetableComputedSlot, TimetableLesson } from "../types/timetable.js";
import { fromMinutes, isHHMM, rangesOverlap, toMinutes } from "../utils/time.js";

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

export function computeTimetableSlots(dayOfWeek?: 1 | 2 | 3 | 4 | 5, weekStart?: string | null): TimetableComputedSlot[] {
  const cfg = timetableConfigStore.get();
  const slots = dayOfWeek ? timetableSlotStore.listByDay(dayOfWeek, weekStart) : timetableSlotStore.listByDay(1, weekStart);
  const base = toMinutes(cfg.dayStartTime) ?? 8 * 60;

  let cursor = base;
  const overrides = cfg.lessonTimesBySlotIndex ?? {};
  return slots.map((s) => {
    const span = s.slotIndexEnd - s.slotIndexStart + 1;
    const mergedKey = s.slotIndexStart !== s.slotIndexEnd ? `${s.slotIndexStart}-${s.slotIndexEnd}` : null;
    const keySingle = String(s.slotIndexStart);
    const ovr = (mergedKey && overrides[mergedKey]) || overrides[keySingle];
    if (ovr && isHHMM(ovr.startTime) && isHHMM(ovr.endTime)) {
      const startM = toMinutes(ovr.startTime)!;
      const endM = toMinutes(ovr.endTime)!;
      cursor = Math.max(cursor, endM);
      return {
        slotPatternId: s.id,
        dayOfWeek: s.dayOfWeek,
        slotIndex: s.slotIndexStart,
        slotIndexEnd: s.slotIndexEnd,
        kind: s.kind,
        serviceType: s.serviceType ?? null,
        startTime: ovr.startTime,
        endTime: ovr.endTime,
        durationMinutes: Math.max(0, endM - startM),
      };
    }

    const durationMinutes = span * cfg.defaultLessonMinutes;
    const start = cursor;
    const end = cursor + durationMinutes;
    cursor = end;
    return {
      slotPatternId: s.id,
      dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndexStart,
      slotIndexEnd: s.slotIndexEnd,
      kind: s.kind,
      serviceType: s.serviceType ?? null,
      startTime: fromMinutes(start),
      endTime: fromMinutes(end),
      durationMinutes,
    };
  });
}

export function eventTargetsGradeOrGroup(args: {
  event: CalendarEvent;
  grade: number;
  groupNumber: number | null;
}): boolean {
  const { event, grade, groupNumber } = args;
  if (event.grades.includes(grade)) return true;
  if (groupNumber == null) return false;
  return event.groups.some((g) => g.grade === grade && g.groupNumber === groupNumber);
}

export function isEventBlockingSlot(args: {
  event: CalendarEvent;
  slot: TimetableComputedSlot;
}): boolean {
  const { event, slot } = args;
  if (event.status === "cancelled") return false;
  const slotStart = toMinutes(slot.startTime)!;
  const slotEnd = toMinutes(slot.endTime)!;
  const allDay = !event.startTime || !event.endTime;
  if (allDay) return true;
  const evStart = toMinutes(event.startTime!);
  const evEnd = toMinutes(event.endTime!);
  if (evStart == null || evEnd == null) return false;
  return rangesOverlap(slotStart, slotEnd, evStart, evEnd);
}

/**
 * "Эффективные уроки" = базовые уроки расписания минус те,
 * которые перекрыты календарными событиями (planned/held).
 */
export function listEffectiveLessons(args: { from: string; to: string }): TimetableLesson[] {
  const lessons = timetableLessonStore.listByDateRange({ from: args.from, to: args.to });
  const events = calendarEventStore.listByDateRange({ from: args.from, to: args.to }).filter((e) => e.status !== "cancelled");
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const arr = eventsByDate.get(ev.date) ?? [];
    arr.push(ev);
    eventsByDate.set(ev.date, arr);
  }

  const effective: TimetableLesson[] = [];
  for (const lesson of lessons) {
    const dayOfWeek = getWeekdayMon1(lesson.date);
    if (!dayOfWeek) continue;
    const computedSlots = computeTimetableSlots(dayOfWeek, getWeekStart(lesson.date));
    const slot = computedSlots.find(
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
    if (blocker) continue;
    effective.push(lesson);
  }
  return effective;
}

