import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { classStore } from "../store/classStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import type {
  CalendarEvent,
  CalendarEventKind,
  CalendarEventStatus,
  CalendarEventTargetGroup,
  CalendarDayVisualState,
  CalendarServiceType,
} from "../types/calendar.js";
import { resolveClassGroup } from "../services/schoolStructure.js";
import { isHHMM, isIsoDate, toMinutes } from "../utils/time.js";

export const calendarRouter = Router();

function isHeadTeacher(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  return Boolean(
    user &&
      (user.primaryRole === "head_teacher" ||
        user.primaryRole === "director" ||
        user.primaryRole === "sysadmin"),
  );
}

function isValidStatus(v: unknown): v is CalendarEventStatus {
  return v === "planned" || v === "held" || v === "cancelled";
}

function isValidKind(v: unknown): v is CalendarEventKind {
  return v === "general" || v === "service";
}

function isValidServiceType(v: unknown): v is CalendarServiceType {
  return v === "lunch" || v === "walk" || v === "self_study" || v === "other";
}

calendarRouter.get("/events", requireAuth, (req, res) => {
  const date = req.query.date != null ? String(req.query.date) : null;
  const from = req.query.from != null ? String(req.query.from) : null;
  const to = req.query.to != null ? String(req.query.to) : null;
  if (date) {
    if (!isIsoDate(date)) return res.status(400).json({ error: "INVALID_DATE" });
    return res.json({ events: calendarEventStore.listByDate(date) });
  }
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to)) {
    return res.status(400).json({ error: "DATE_RANGE_REQUIRED" });
  }
  return res.json({ events: calendarEventStore.listByDateRange({ from, to }) });
});

calendarRouter.post("/events", requireAuth, (req: AuthedRequest, res) => {
  if (!isHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const {
    title,
    description,
    date,
    startTime = null,
    endTime = null,
    grades = [],
    groups = [],
    kind = "general",
    serviceType = null,
    analytics = null,
    status = "planned",
  } = req.body ?? {};

  if (typeof title !== "string" || title.trim().length === 0) return res.status(400).json({ error: "INVALID_TITLE" });
  if (typeof date !== "string" || !isIsoDate(date)) return res.status(400).json({ error: "INVALID_DATE" });
  if (!isValidStatus(status)) return res.status(400).json({ error: "INVALID_STATUS" });
  if (!isValidKind(kind)) return res.status(400).json({ error: "INVALID_KIND" });
  if (serviceType != null && !isValidServiceType(serviceType)) return res.status(400).json({ error: "INVALID_SERVICE_TYPE" });
  if (description != null && typeof description !== "string") return res.status(400).json({ error: "INVALID_DESCRIPTION" });

  if (startTime != null && (typeof startTime !== "string" || !isHHMM(startTime))) {
    return res.status(400).json({ error: "INVALID_START_TIME" });
  }
  if (endTime != null && (typeof endTime !== "string" || !isHHMM(endTime))) {
    return res.status(400).json({ error: "INVALID_END_TIME" });
  }
  if (startTime != null && endTime != null) {
    const a = toMinutes(startTime);
    const b = toMinutes(endTime);
    if (a == null || b == null || b <= a) return res.status(400).json({ error: "INVALID_TIME_RANGE" });
  }

  const parsedGrades: number[] = Array.isArray(grades)
    ? grades.filter((g: unknown): g is number => typeof g === "number" && Number.isInteger(g) && g > 0)
    : [];

  const parsedGroups: CalendarEventTargetGroup[] = Array.isArray(groups)
    ? groups
        .map((g: any) => ({ grade: g?.grade, groupNumber: g?.groupNumber }))
        .filter((g) => Number.isInteger(g.grade) && g.grade > 0 && Number.isInteger(g.groupNumber) && g.groupNumber > 0)
    : [];

  if (parsedGrades.length === 0 && parsedGroups.length === 0) {
    return res.status(400).json({ error: "TARGET_REQUIRED" });
  }

  for (const gr of parsedGrades) {
    if (!classStore.findByGrade(gr)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
  }
  for (const tg of parsedGroups) {
    if (!classStore.findByGrade(tg.grade)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
    if (!resolveClassGroup({ grade: tg.grade, groupNumber: tg.groupNumber, autoCreateDefault: true })) {
      return res.status(400).json({ error: `Группа ${tg.groupNumber} не найдена для класса ${tg.grade}.` });
    }
  }

  const event = calendarEventStore.create({
    title: title.trim(),
    description: description != null ? description.trim() : undefined,
    date,
    startTime,
    endTime,
    grades: [...new Set(parsedGrades)],
    groups: parsedGroups,
    kind,
    serviceType: serviceType ?? null,
    analytics:
      analytics && typeof analytics === "object"
        ? {
            activityType:
              analytics.activityType === "project" ||
              analytics.activityType === "club" ||
              analytics.activityType === "facultative" ||
              analytics.activityType === "event"
                ? analytics.activityType
                : "event",
            stations: Array.isArray(analytics.stations)
              ? analytics.stations.map((station: any) => ({
                  id: typeof station?.id === "string" && station.id.trim() ? station.id : `station-${Math.random().toString(36).slice(2, 8)}`,
                  title: String(station?.title ?? "Станция"),
                  assignments: Array.isArray(station?.assignments)
                    ? station.assignments
                        .filter((assignment: any) => typeof assignment?.teacherUserId === "string")
                        .map((assignment: any) => ({
                          teacherUserId: String(assignment.teacherUserId),
                          plannedDurationMinutes: Number(assignment.plannedDurationMinutes ?? 0),
                          actualDurationMinutes: Number(assignment.actualDurationMinutes ?? 0),
                        }))
                    : [],
                }))
              : [],
          }
        : null,
    status,
  });
  return res.status(201).json({ event });
});

calendarRouter.patch("/events/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const patch: Partial<Omit<CalendarEvent, "id" | "createdAt">> = {};

  const { title, description, startTime, endTime, grades, groups, kind, serviceType, analytics, status } = req.body ?? {};
  if (title != null) {
    if (typeof title !== "string" || title.trim().length === 0) return res.status(400).json({ error: "INVALID_TITLE" });
    patch.title = title.trim();
  }
  if (description != null) {
    if (typeof description !== "string") return res.status(400).json({ error: "INVALID_DESCRIPTION" });
    const trimmed = description.trim();
    patch.description = trimmed.length ? trimmed : undefined;
  }
  if (status != null) {
    if (!isValidStatus(status)) return res.status(400).json({ error: "INVALID_STATUS" });
    patch.status = status;
  }
  if (kind != null) {
    if (!isValidKind(kind)) return res.status(400).json({ error: "INVALID_KIND" });
    patch.kind = kind;
  }
  if (serviceType !== undefined) {
    if (serviceType != null && !isValidServiceType(serviceType)) {
      return res.status(400).json({ error: "INVALID_SERVICE_TYPE" });
    }
    patch.serviceType = serviceType ?? null;
  }
  if (analytics !== undefined) {
    patch.analytics =
      analytics && typeof analytics === "object"
        ? {
            activityType:
              analytics.activityType === "project" ||
              analytics.activityType === "club" ||
              analytics.activityType === "facultative" ||
              analytics.activityType === "event"
                ? analytics.activityType
                : "event",
            stations: Array.isArray(analytics.stations)
              ? analytics.stations.map((station: any) => ({
                  id: typeof station?.id === "string" && station.id.trim() ? station.id : `station-${Math.random().toString(36).slice(2, 8)}`,
                  title: String(station?.title ?? "Станция"),
                  assignments: Array.isArray(station?.assignments)
                    ? station.assignments
                        .filter((assignment: any) => typeof assignment?.teacherUserId === "string")
                        .map((assignment: any) => ({
                          teacherUserId: String(assignment.teacherUserId),
                          plannedDurationMinutes: Number(assignment.plannedDurationMinutes ?? 0),
                          actualDurationMinutes: Number(assignment.actualDurationMinutes ?? 0),
                        }))
                    : [],
                }))
              : [],
          }
        : null;
  }
  if (startTime !== undefined) {
    if (startTime != null && (typeof startTime !== "string" || !isHHMM(startTime))) {
      return res.status(400).json({ error: "INVALID_START_TIME" });
    }
    patch.startTime = startTime;
  }
  if (endTime !== undefined) {
    if (endTime != null && (typeof endTime !== "string" || !isHHMM(endTime))) {
      return res.status(400).json({ error: "INVALID_END_TIME" });
    }
    patch.endTime = endTime;
  }
  if (patch.startTime != null && patch.endTime != null) {
    const a = toMinutes(patch.startTime);
    const b = toMinutes(patch.endTime);
    if (a == null || b == null || b <= a) return res.status(400).json({ error: "INVALID_TIME_RANGE" });
  }

  if (grades !== undefined || groups !== undefined) {
    const parsedGrades: number[] = Array.isArray(grades)
      ? grades.filter((g: unknown): g is number => typeof g === "number" && Number.isInteger(g) && g > 0)
      : [];
    const parsedGroups: CalendarEventTargetGroup[] = Array.isArray(groups)
      ? groups
          .map((g: any) => ({ grade: g?.grade, groupNumber: g?.groupNumber }))
          .filter((g) => Number.isInteger(g.grade) && g.grade > 0 && Number.isInteger(g.groupNumber) && g.groupNumber > 0)
      : [];

    if (parsedGrades.length === 0 && parsedGroups.length === 0) {
      return res.status(400).json({ error: "TARGET_REQUIRED" });
    }

    for (const gr of parsedGrades) {
      if (!classStore.findByGrade(gr)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
    }
    for (const tg of parsedGroups) {
      if (!classStore.findByGrade(tg.grade)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
      if (!resolveClassGroup({ grade: tg.grade, groupNumber: tg.groupNumber, autoCreateDefault: true })) {
        return res.status(400).json({ error: `Группа ${tg.groupNumber} не найдена для класса ${tg.grade}.` });
      }
    }

    patch.grades = [...new Set(parsedGrades)];
    patch.groups = parsedGroups;
  }

  try {
    const event = calendarEventStore.update(id, patch);
    return res.json({ event });
  } catch (e) {
    return res.status(404).json({ error: (e as Error).message });
  }
});

calendarRouter.delete("/events/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  calendarEventStore.remove(id);
  return res.json({ ok: true });
});

/**
 * Месячная сетка для UI календаря.
 * Сейчас “каникулы” не конфигурируются отдельно, поэтому weekend_or_vacation = выходные.
 */
calendarRouter.get("/month", requireAuth, (req, res) => {
  const month = String(req.query.month ?? ""); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "INVALID_MONTH" });
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return res.status(400).json({ error: "INVALID_MONTH" });

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${yStr}-${mStr}-01`;
  const to = `${yStr}-${mStr}-${String(daysInMonth).padStart(2, "0")}`;
  const events = calendarEventStore.listByDateRange({ from, to }).filter((e) => e.status !== "cancelled");
  const eventDates = new Set(events.map((e) => e.date));

  const days: { date: string; visualState: CalendarDayVisualState }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${yStr}-${mStr}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun
    const isWeekend = dow === 0 || dow === 6;
    const hasEvent = eventDates.has(date);
    const visualState: CalendarDayVisualState = hasEvent ? "has_event" : isWeekend ? "weekend_or_vacation" : "workday";
    days.push({ date, visualState });
  }
  return res.json({ month, days });
});

