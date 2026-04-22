import type { AlarmSoundId } from "../audio/systemSoundConfig";

/** Устаревший маркер «только я» в локальных данных; на UI маппится на текущего пользователя. */
export const TASK_TRACKER_SELF_ID = "__self__";

export type TrackerTaskStatus = "planned" | "in_progress" | "waiting" | "done";

export type TrackerTaskPriority = "low" | "medium" | "high";

export type TrackerReminder = { offsetMinutes: number };

export type TrackerTask = {
  id: string;
  title: string;
  description: string;
  status: TrackerTaskStatus;
  priority: TrackerTaskPriority;
  deadline: Date | null;
  reminders: TrackerReminder[];
  alarmSoundId: AlarmSoundId | "none" | null;
  /** Пустой массив = только текущий пользователь (личная задача на этом устройстве). */
  assigneeIds: string[];
  /** Кто создал / главный ответственный. */
  ownerId: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

const STORAGE_V1 = "edumed.tasks.v1";
const STORAGE_V0 = "edumed.tasks.v0";

export const TASK_TRACKER_UPDATED_EVENT = "edumed:task-tracker-updated";

function emitUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TASK_TRACKER_UPDATED_EVENT));
  }
}

type V0DayTask = { id: string; text: string; done: boolean };
type V0Shape = Record<string, V0DayTask[]>;

function migrateV0(): TrackerTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_V0);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const out: TrackerTask[] = [];
    const now = new Date().toISOString();
    for (const list of Object.values(parsed as V0Shape)) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        if (!t || typeof t !== "object" || typeof t.id !== "string" || typeof t.text !== "string") continue;
        out.push({
          id: t.id,
          title: t.text,
          description: "",
          status: t.done ? "done" : "planned",
          priority: "medium",
          deadline: null,
          reminders: [],
          alarmSoundId: null,
          assigneeIds: [],
          ownerId: null,
          tags: [],
          createdAt: new Date(now),
          updatedAt: new Date(now),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Задача видна пользователю: явно в assigneeIds или пустой список (= только я). */
export function taskVisibleForUser(task: TrackerTask, currentUserId: string): boolean {
  if (!currentUserId) return false;
  if (task.assigneeIds.length === 0) return true;
  return task.assigneeIds.includes(currentUserId);
}

export function taskIsCollective(task: TrackerTask): boolean {
  return task.assigneeIds.length >= 2;
}

function parseTask(raw: unknown): TrackerTask | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const title = typeof o.title === "string" ? o.title : null;
  if (!id || !title) return null;
  const status =
    o.status === "planned" ||
    o.status === "in_progress" ||
    o.status === "waiting" ||
    o.status === "done"
      ? o.status
      : "planned";
  const priority =
    o.priority === "low" || o.priority === "medium" || o.priority === "high" ? o.priority : "medium";
  let deadline: Date | null = null;
  if (o.deadline === null || o.deadline === undefined) deadline = null;
  else if (typeof o.deadline === "string") {
    const d = new Date(o.deadline);
    deadline = Number.isNaN(d.getTime()) ? null : d;
  }
  const reminders: TrackerReminder[] = [];
  if (Array.isArray(o.reminders)) {
    for (const r of o.reminders) {
      if (r && typeof r === "object" && typeof (r as TrackerReminder).offsetMinutes === "number") {
        reminders.push({ offsetMinutes: (r as TrackerReminder).offsetMinutes });
      }
    }
  }
  let alarmSoundId: AlarmSoundId | "none" | null = null;
  if (o.alarmSoundId === "none") alarmSoundId = "none";
  if (
    o.alarmSoundId === "alarm1" ||
    o.alarmSoundId === "alarm2" ||
    o.alarmSoundId === "alarm3" ||
    o.alarmSoundId === "alarm4" ||
    o.alarmSoundId === "alarm5"
  ) {
    alarmSoundId = o.alarmSoundId;
  }

  let assigneeIds: string[] = [];
  if (Array.isArray(o.assigneeIds)) {
    assigneeIds = o.assigneeIds.filter((x): x is string => typeof x === "string");
  } else if (typeof o.assigneeId === "string") {
    if (o.assigneeId === TASK_TRACKER_SELF_ID || o.assigneeId === "") assigneeIds = [];
    else assigneeIds = [o.assigneeId];
  }

  const ownerId =
    o.ownerId === null || o.ownerId === undefined ? null : typeof o.ownerId === "string" ? o.ownerId : null;

  const tags = Array.isArray(o.tags) ? o.tags.filter((x): x is string => typeof x === "string") : [];
  const createdAt =
    typeof o.createdAt === "string" && !Number.isNaN(new Date(o.createdAt).getTime())
      ? new Date(o.createdAt)
      : new Date();
  const updatedAt =
    typeof o.updatedAt === "string" && !Number.isNaN(new Date(o.updatedAt).getTime())
      ? new Date(o.updatedAt)
      : new Date();
  return {
    id,
    title,
    description: typeof o.description === "string" ? o.description : "",
    status,
    priority,
    deadline,
    reminders,
    alarmSoundId,
    assigneeIds,
    ownerId,
    tags,
    createdAt,
    updatedAt,
  };
}

function serializeTask(t: TrackerTask): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    reminders: t.reminders,
    alarmSoundId: t.alarmSoundId,
    assigneeIds: t.assigneeIds,
    ownerId: t.ownerId,
    tags: t.tags,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function loadTrackerTasks(): TrackerTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_V1);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(parseTask).filter((x): x is TrackerTask => x != null);
      }
    }
    const migrated = migrateV0();
    if (migrated.length > 0) {
      saveTrackerTasks(migrated);
      try {
        localStorage.removeItem(STORAGE_V0);
      } catch {
        /* ignore */
      }
    }
    return migrated;
  } catch {
    return [];
  }
}

export function saveTrackerTasks(tasks: TrackerTask[]) {
  try {
    localStorage.setItem(STORAGE_V1, JSON.stringify(tasks.map(serializeTask)));
    emitUpdated();
  } catch {
    /* ignore */
  }
}

export function updateTrackerTask(tasks: TrackerTask[], id: string, patch: Partial<TrackerTask>): TrackerTask[] {
  const now = new Date();
  return tasks.map((t) =>
    t.id === id
      ? {
          ...t,
          ...patch,
          updatedAt: now,
        }
      : t,
  );
}
