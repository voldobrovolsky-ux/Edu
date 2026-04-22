import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { AlarmSoundId } from "../audio/systemSoundConfig";
import { ALARM_SOUND_ID_LIST, isAlarmSoundId } from "../audio/systemSoundConfig";
import { playTaskTrackerStatusSound, primeServiceAudioFromUserGesture, systemSounds } from "../audio/systemSounds";
import { api } from "../lib/api";
import { ED_Z_MODAL_GLOBAL, ED_Z_MODAL_STACK, ED_Z_TRACKER_POPOVER } from "../lib/zLayers";
import {
  loadTrackerTasks,
  saveTrackerTasks,
  taskIsCollective,
  updateTrackerTask,
  type TrackerTask,
  type TrackerTaskPriority,
  type TrackerTaskStatus,
} from "../lib/taskTrackerStorage";
import { useAuth } from "../state/auth";

const REMINDER_PRESETS: { offsetMinutes: number; label: string }[] = [
  { offsetMinutes: 0, label: "В момент дедлайна" },
  { offsetMinutes: 5, label: "За 5 минут" },
  { offsetMinutes: 15, label: "За 15 минут" },
  { offsetMinutes: 60, label: "За 1 час" },
];

type FilterTab = "all" | "today" | "week" | "overdue" | "done";

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function matchesFilter(task: TrackerTask, tab: FilterTab, now: Date): boolean {
  if (tab === "all") return true;
  if (tab === "done") return task.status === "done";
  if (tab === "overdue") {
    if (task.status === "done" || !task.deadline) return false;
    return new Date(task.deadline).getTime() < now.getTime();
  }
  if (!task.deadline) return false;
  const dl = new Date(task.deadline);
  if (tab === "today") {
    return dl >= startOfToday() && dl <= endOfToday();
  }
  if (tab === "week") {
    const end = addDays(startOfToday(), 7);
    end.setHours(23, 59, 59, 999);
    return dl >= startOfToday() && dl <= end;
  }
  return true;
}

function statusDotClass(s: TrackerTaskStatus): string {
  switch (s) {
    case "done":
      return "bg-emerald-500";
    case "in_progress":
      return "bg-sky-500";
    case "waiting":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

function statusLabel(s: TrackerTaskStatus): string {
  switch (s) {
    case "planned":
      return "Запланирована";
    case "in_progress":
      return "В работе";
    case "waiting":
      return "Ожидает ответа";
    case "done":
      return "Выполнена";
  }
}

function priorityGlyph(p: TrackerTaskPriority): string {
  switch (p) {
    case "high":
      return "▲";
    case "low":
      return "▼";
    default:
      return "●";
  }
}

function priorityTitle(p: TrackerTaskPriority): string {
  switch (p) {
    case "high":
      return "Высокий";
    case "low":
      return "Низкий";
    default:
      return "Средний";
  }
}

function formatDeadline(d: Date | null): string {
  if (!d) return "Без дедлайна";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

type PickerUser = { id: string; fio: string };

export function TaskTrackerPage() {
  const auth = useAuth();
  const myId = auth.user?.id ?? "";
  const myDisplayName = useMemo(() => {
    if (!auth.user) return "";
    const n = [auth.user.lastName, auth.user.firstName].filter(Boolean).join(" ").trim();
    return n || auth.user.username;
  }, [auth.user]);

  const [tasks, setTasks] = useState<TrackerTask[]>(() => loadTrackerTasks());
  const [colleagues, setColleagues] = useState<PickerUser[]>([]);
  const [quick, setQuick] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [now, setNow] = useState(() => new Date());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deadlineTaskId, setDeadlineTaskId] = useState<string | null>(null);

  useEffect(() => {
    const token = auth.accessToken;
    if (!token) {
      setColleagues([]);
      return;
    }
    let cancelled = false;
    void api
      .chatsUsers(token)
      .then((r) => {
        if (cancelled) return;
        setColleagues((r.users ?? []).map((u) => ({ id: u.id, fio: u.fio })));
      })
      .catch(() => {
        if (!cancelled) setColleagues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.accessToken]);

  const colleaguePicker = useMemo(() => {
    const m = new Map<string, string>();
    if (myId && myDisplayName) m.set(myId, myDisplayName);
    for (const c of colleagues) m.set(c.id, c.fio);
    return [...m.entries()]
      .map(([id, fio]) => ({ id, fio }))
      .sort((a, b) => {
        if (a.id === myId) return -1;
        if (b.id === myId) return 1;
        return a.fio.localeCompare(b.fio, "ru");
      });
  }, [colleagues, myId, myDisplayName]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const persist = useCallback((next: TrackerTask[]) => {
    setTasks(next);
    saveTrackerTasks(next);
  }, []);

  const filtered = useMemo(
    () => tasks.filter((t) => matchesFilter(t, filter, now)).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [tasks, filter, now],
  );

  const detailTask = detailId ? tasks.find((t) => t.id === detailId) ?? null : null;
  const deadlineTask = deadlineTaskId ? tasks.find((t) => t.id === deadlineTaskId) ?? null : null;

  const addQuick = useCallback(() => {
    const title = quick.trim();
    if (!title) return;
    try {
      const id = crypto.randomUUID();
      const nowD = new Date();
      const row: TrackerTask = {
        id,
        title,
        description: "",
        status: "planned",
        priority: "medium",
        deadline: null,
        reminders: [],
        alarmSoundId: null,
        assigneeIds: myId ? [myId] : [],
        ownerId: myId || null,
        tags: [],
        createdAt: nowD,
        updatedAt: nowD,
      };
      persist([row, ...tasks]);
      setQuick("");
    } catch {
      playTaskTrackerStatusSound("error");
    }
  }, [quick, tasks, persist, myId]);

  const toggleCheckbox = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      const nextStatus: TrackerTaskStatus = t.status === "done" ? "planned" : "done";
      const next = updateTrackerTask(tasks, id, { status: nextStatus });
      persist(next);
      if (nextStatus === "done") playTaskTrackerStatusSound("success");
    },
    [tasks, persist],
  );

  const openDeadline = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    primeServiceAudioFromUserGesture();
    setDeadlineTaskId(id);
  }, []);

  return (
    <div className="space-y-4">
      <section className="ed-panel ed-panel-hover p-5">
        <div className="ed-caption">Раздел • Трекер задач</div>
        <h1 className="ed-h2 mt-1">Трекер задач</h1>
        <p className="mt-2 text-sm text-slate-600">
          Список задач с дедлайнами и напоминаниями. Изменения сохраняются в браузере сразу.{" "}
          <Link to="/section/main" className="text-sky-700 underline hover:text-sky-900">
            На главную
          </Link>
        </p>
      </section>

      <section className="ed-panel ed-panel-hover p-5" data-dedus-id="taskTracker.addTask">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addQuick();
          }}
          className="ed-input w-full px-3 py-2.5 text-sm"
          placeholder="Добавить задачу…"
          aria-label="Быстрое добавление задачи"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "Все"],
              ["today", "Сегодня"],
              ["week", "Эта неделя"],
              ["overdue", "Просроченные"],
              ["done", "Выполненные"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={[
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === key
                  ? "border-sky-400 bg-sky-50 text-sky-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">Нет задач в этом фильтре.</li>
          ) : (
            filtered.map((t) => {
              const overdue =
                t.deadline && t.status !== "done" && new Date(t.deadline).getTime() < now.getTime();
              return (
                <li key={t.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailId(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailId(t.id);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-3 px-3 py-3 text-left hover:bg-slate-50/80"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-slate-300"
                      checked={t.status === "done"}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCheckbox(t.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t.status === "done" ? "Вернуть в работу" : "Отметить выполненной"}
                    />
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(t.status)}`} title={statusLabel(t.status)} />
                    <div className="min-w-0 flex-1">
                      <div
                        className={[
                          "flex min-w-0 items-center gap-1.5 truncate text-sm font-medium",
                          t.status === "done" ? "text-slate-400 line-through" : "text-slate-900",
                        ].join(" ")}
                      >
                        {taskIsCollective(t) ? (
                          <span className="shrink-0 text-base leading-none text-slate-500" title="Коллективная задача" aria-label="Коллективная задача">
                            👥
                          </span>
                        ) : null}
                        <span className="truncate">{t.title}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      title="Дедлайн и напоминания"
                      onClick={(e) => openDeadline(e, t.id)}
                    >
                      {formatDeadline(t.deadline)}
                    </button>
                    <span className="w-5 shrink-0 text-center text-slate-500" title={priorityTitle(t.priority)}>
                      {priorityGlyph(t.priority)}
                    </span>
                    {overdue ? (
                      <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">Просрочено</span>
                    ) : (
                      <span className="w-[72px] shrink-0" />
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {detailTask ? (
        <TaskDetailModal
          task={detailTask}
          colleaguePicker={colleaguePicker}
          myId={myId}
          onClose={() => setDetailId(null)}
          onOpenDeadline={(id) => setDeadlineTaskId(id)}
          onSave={(patch) => {
            try {
              const next = updateTrackerTask(tasks, detailTask.id, patch);
              persist(next);
              playTaskTrackerStatusSound("success");
            } catch {
              playTaskTrackerStatusSound("error");
            }
          }}
          onDelete={() => {
            try {
              persist(tasks.filter((x) => x.id !== detailTask.id));
              setDetailId(null);
            } catch {
              playTaskTrackerStatusSound("error");
            }
          }}
        />
      ) : null}

      {deadlineTask ? (
        <DeadlineModal
          task={deadlineTask}
          onClose={() => setDeadlineTaskId(null)}
          onSave={(patch) => {
            try {
              const next = updateTrackerTask(tasks, deadlineTask.id, patch);
              persist(next);
              playTaskTrackerStatusSound("success");
              setDeadlineTaskId(null);
            } catch {
              playTaskTrackerStatusSound("error");
            }
          }}
        />
      ) : null}
    </div>
  );
}

function TaskDetailModal({
  task,
  colleaguePicker,
  myId,
  onClose,
  onOpenDeadline,
  onSave,
  onDelete,
}: {
  task: TrackerTask;
  colleaguePicker: PickerUser[];
  myId: string;
  onClose: () => void;
  onOpenDeadline: (id: string) => void;
  onSave: (patch: Partial<TrackerTask>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<TrackerTaskStatus>(task.status);
  const [priority, setPriority] = useState<TrackerTaskPriority>(task.priority);
  const [tagsStr, setTagsStr] = useState(task.tags.join(", "));
  const [assigneePick, setAssigneePick] = useState<Set<string>>(() => {
    const ids = task.assigneeIds.length ? task.assigneeIds : myId ? [myId] : [];
    return new Set(ids);
  });

  const assigneeKey = task.assigneeIds.slice().sort().join("|");
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setTagsStr(task.tags.join(", "));
    const ids = task.assigneeIds.length ? task.assigneeIds : myId ? [myId] : [];
    setAssigneePick(new Set(ids));
  }, [task.id, assigneeKey, myId, task.title, task.description, task.status, task.priority, task.tags]);

  const nameById = useMemo(() => new Map(colleaguePicker.map((u) => [u.id, u.fio] as const)), [colleaguePicker]);
  const ownerLabel =
    task.ownerId && nameById.has(task.ownerId) ? nameById.get(task.ownerId)! : task.ownerId ? task.ownerId : "—";

  const toggleAssignee = (id: string) => {
    setAssigneePick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return next;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const apply = () => {
    const tags = tagsStr
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const assigneeIds = [...assigneePick].sort((a, b) => a.localeCompare(b));
    onSave({ title: title.trim() || task.title, description, status, priority, tags, assigneeIds });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: ED_Z_MODAL_GLOBAL }}
      role="dialog"
      aria-modal
      aria-labelledby="task-detail-title"
    >
      <div className="ed-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h2 id="task-detail-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            {assigneePick.size >= 2 ? (
              <span className="text-xl leading-none text-slate-500" title="Коллективная задача" aria-hidden>
                👥
              </span>
            ) : null}
            <span>Задача</span>
          </h2>
          <button type="button" className="ed-btn ed-btn-close ed-interactive text-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600">Заголовок</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="ed-input mt-1 w-full px-3 py-2 text-sm" />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600">Описание</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="ed-input mt-1 w-full px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600">Статус</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TrackerTaskStatus)}
            className="ed-input mt-1 w-full px-3 py-2 text-sm"
          >
            <option value="planned">Запланирована</option>
            <option value="in_progress">В работе</option>
            <option value="waiting">Ожидает ответа</option>
            <option value="done">Выполнена</option>
          </select>
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600">Приоритет</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TrackerTaskPriority)}
            className="ed-input mt-1 w-full px-3 py-2 text-sm"
          >
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
        </label>

        <div className="mt-3 text-sm">
          <span className="text-slate-600">Автор / главный ответственный</span>
          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">{ownerLabel}</div>
        </div>

        <div className="mt-3 text-sm">
          <span className="text-slate-600">Ответственные</span>
          <p className="mt-0.5 text-xs text-slate-500">Один — личная задача; несколько — коллективная (👥 в списке).</p>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-auto rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-2">
            {colleaguePicker.length === 0 ? (
              <li className="text-xs text-slate-500">Список коллег загружается после входа. Пока доступен только вы.</li>
            ) : null}
            {colleaguePicker.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={assigneePick.has(u.id)}
                    onChange={() => toggleAssignee(u.id)}
                  />
                  {u.fio}
                  {u.id === myId ? <span className="text-xs text-slate-400">(вы)</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600">Метки (через запятую)</span>
          <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="ed-input mt-1 w-full px-3 py-2 text-sm" />
        </label>

        <div className="mt-3">
          <button
            type="button"
            className="text-sm font-medium text-sky-700 hover:text-sky-900"
            onClick={() => onOpenDeadline(task.id)}
          >
            Дедлайн и напоминания…
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm" onClick={apply}>
            Готово
          </button>
          <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ed-btn ed-interactive ml-auto border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800"
            onClick={() => {
              if (window.confirm("Удалить задачу?")) onDelete();
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DeadlineModal({
  task,
  onClose,
  onSave,
}: {
  task: TrackerTask;
  onClose: () => void;
  onSave: (patch: Partial<TrackerTask>) => void;
}) {
  const noDeadlineInitial = !task.deadline;
  const [noDeadline, setNoDeadline] = useState(noDeadlineInitial);
  const [dateStr, setDateStr] = useState(() => (task.deadline ? isoDateLocal(task.deadline) : isoDateLocal(new Date())));
  const [timeStr, setTimeStr] = useState(() => {
    if (!task.deadline) return "12:00";
    const d = task.deadline;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [reminders, setReminders] = useState(() => task.reminders.map((r) => r.offsetMinutes));
  const [alarmId, setAlarmId] = useState<AlarmSoundId | "none" | null>(task.alarmSoundId);

  const toggleReminder = (offset: number) => {
    setReminders((prev) => (prev.includes(offset) ? prev.filter((x) => x !== offset) : [...prev, offset].sort((a, b) => b - a)));
  };

  const apply = () => {
    let deadline: Date | null = null;
    if (!noDeadline) {
      const [yy, mm, dd] = dateStr.split("-").map(Number);
      const [th, tm] = timeStr.split(":").map(Number);
      if (Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)) {
        deadline = new Date(yy, mm - 1, dd, Number.isFinite(th) ? th : 12, Number.isFinite(tm) ? tm : 0, 0, 0);
      }
    }
    onSave({
      deadline,
      reminders: noDeadline ? [] : reminders.map((offsetMinutes) => ({ offsetMinutes })),
      alarmSoundId: alarmId,
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/35 p-4"
      style={{ zIndex: ED_Z_MODAL_STACK }}
      role="dialog"
      aria-modal
    >
      <div className="ed-panel max-h-[90vh] w-full max-w-md overflow-y-auto p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Дедлайн и напоминания</h2>
          <button type="button" className="ed-btn ed-btn-close ed-interactive text-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{task.title}</p>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={noDeadline} onChange={(e) => setNoDeadline(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Без дедлайна
        </label>

        {!noDeadline ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">Дата</span>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="ed-input mt-1 w-full px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Время</span>
              <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} className="ed-input mt-1 w-full px-3 py-2 text-sm" />
            </label>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="text-sm font-medium text-slate-800">Напоминания</div>
          <ul className="mt-2 space-y-2">
            {REMINDER_PRESETS.map((p) => (
              <li key={p.offsetMinutes}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reminders.includes(p.offsetMinutes)}
                    onChange={() => toggleReminder(p.offsetMinutes)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {p.label}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <div className="text-sm font-medium text-slate-800">Сигнал дедлайна</div>
          <ul
            className="mt-2 max-h-40 overflow-auto rounded-xl border border-slate-200 py-1"
            style={{ zIndex: ED_Z_TRACKER_POPOVER }}
          >
            <li>
              <button
                type="button"
                className={[
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  alarmId === null ? "bg-sky-100 font-medium text-sky-900" : "hover:bg-slate-50",
                ].join(" ")}
                onClick={() => {
                  setAlarmId(null);
                  const def = document.documentElement.dataset.edDefaultTrackerAlarm;
                  const id = def && isAlarmSoundId(def) ? def : "alarm1";
                  systemSounds.play(id);
                }}
              >
                <span className={alarmId === null ? "text-sky-600" : "text-transparent"}>●</span>
                По умолчанию (из персонализации)
              </button>
            </li>
            <li>
              <button
                type="button"
                className={[
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  alarmId === "none" ? "bg-sky-100 font-medium text-sky-900" : "hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setAlarmId("none")}
              >
                <span className={alarmId === "none" ? "text-sky-600" : "text-transparent"}>●</span>
                Без звука
              </button>
            </li>
            {ALARM_SOUND_ID_LIST.map((id, i) => (
              <li key={id}>
                <button
                  type="button"
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    alarmId === id ? "bg-sky-100 font-medium text-sky-900" : "hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => {
                    setAlarmId(id);
                    systemSounds.play(id);
                  }}
                >
                  <span className={alarmId === id ? "text-sky-600" : "text-transparent"}>●</span>
                  Сигнал {i + 1}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm" onClick={apply}>
            Сохранить
          </button>
          <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
