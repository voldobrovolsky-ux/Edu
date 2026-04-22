import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  loadTrackerTasks,
  TASK_TRACKER_UPDATED_EVENT,
  taskIsCollective,
  taskVisibleForUser,
  type TrackerTask,
} from "../lib/taskTrackerStorage";
import { useAuth } from "../state/auth";

type CalendarDay = { date: string; visualState: "workday" | "weekend_or_vacation" | "has_event" };

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoMonthLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfMonth(year: number, month1to12: number): Date {
  return new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function weekdayMon0(d: Date): number {
  // JS: Sun=0..Sat=6 -> Mon=0..Sun=6
  return (d.getDay() + 6) % 7;
}

function parseHHMMToMinutes(input: string | null | undefined): number | null {
  const s = String(input ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatTrackerDeadlineShort(d: Date): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function MainPage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const username = auth.user?.username ?? "user";
  const myUserId = auth.user?.id ?? "";

  const [myTrackerTasks, setMyTrackerTasks] = useState<TrackerTask[]>([]);
  useEffect(() => {
    const sync = () => {
      const all = loadTrackerTasks();
      setMyTrackerTasks(
        all
          .filter((t) => taskVisibleForUser(t, myUserId) && t.status !== "done")
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, 8),
      );
    };
    sync();
    window.addEventListener(TASK_TRACKER_UPDATED_EVENT, sync);
    return () => window.removeEventListener(TASK_TRACKER_UPDATED_EVENT, sync);
  }, [myUserId]);

  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const month = useMemo(() => isoMonthLocal(monthCursor), [monthCursor]);
  const todayIso = useMemo(() => isoDateLocal(new Date()), []);

  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  const refreshMonth = useCallback(async () => {
    setCalLoading(true);
    setCalError(null);
    try {
      const res = await api.calendarMonth(token, month);
      setCalendarDays((res?.days ?? []) as CalendarDay[]);
    } catch (e) {
      setCalError((e as Error).message);
    } finally {
      setCalLoading(false);
    }
  }, [token, month]);

  useEffect(() => {
    void refreshMonth();
  }, [refreshMonth]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [timetableCfg, setTimetableCfg] = useState<any>(null);
  const [timetableError, setTimetableError] = useState<string | null>(null);

  const [eventDialogDate, setEventDialogDate] = useState<string | null>(null);
  const [eventDialogTitle, setEventDialogTitle] = useState<string>("");
  const [eventDialogDescription, setEventDialogDescription] = useState<string>("");
  const [eventDialogDateValue, setEventDialogDateValue] = useState<string>("");
  const [eventTimeMode, setEventTimeMode] = useState<"slots" | "time">("slots");
  const [eventStartSlot, setEventStartSlot] = useState<number>(1);
  const [eventEndSlot, setEventEndSlot] = useState<number>(2);
  const [eventStartTime, setEventStartTime] = useState<string>("");
  const [eventEndTime, setEventEndTime] = useState<string>("");
  const [eventsForDialog, setEventsForDialog] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = useMemo(() => eventsForDialog.find((e) => e.id === selectedEventId) ?? null, [eventsForDialog, selectedEventId]);

  const [schoolGrades, setSchoolGrades] = useState<number[]>([]);
  const [gradeParts, setGradeParts] = useState<Record<number, "whole" | 1 | 2 | null>>({});

  const openEventDialog = useCallback(
    async (dateIso: string) => {
      setEventDialogDate(dateIso);
      setEventDialogTitle("");
      setEventDialogDescription("");
      setEventDialogDateValue(dateIso);
      setEventTimeMode("slots");
      setEventStartSlot(1);
      setEventEndSlot(2);
      setEventStartTime("");
      setEventEndTime("");
      setSelectedEventId(null);

      setEventsLoading(true);
      setEventsError(null);
      try {
        const res = await api.calendarEvents(token, { date: dateIso });
        setEventsForDialog((res?.events ?? []) as any[]);
      } catch (e) {
        setEventsError((e as Error).message);
        setEventsForDialog([]);
      } finally {
        setEventsLoading(false);
      }
    },
    [token],
  );

  const closeEventDialog = useCallback(() => {
    setEventDialogDate(null);
    setSelectedEventId(null);
  }, []);

  const refreshEventsForDialogDate = useCallback(async () => {
    if (!eventDialogDate) return;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const res = await api.calendarEvents(token, { date: eventDialogDate });
      setEventsForDialog((res?.events ?? []) as any[]);
    } catch (e) {
      setEventsError((e as Error).message);
      setEventsForDialog([]);
    } finally {
      setEventsLoading(false);
    }
  }, [eventDialogDate, token]);

  const createEvent = useCallback(async () => {
    if (!eventDialogDate) return;
    const title = eventDialogTitle.trim();
    if (!title) {
      setEventsError("Введите название мероприятия.");
      return;
    }
    const selected = Object.entries(gradeParts)
      .map(([k, v]) => ({ grade: Number(k), part: v }))
      .filter((x) => x.grade > 0 && x.part != null);

    const grades = selected.filter((x) => x.part === "whole").map((x) => x.grade);
    const groups = selected
      .filter((x) => x.part === 1 || x.part === 2)
      .map((x) => ({ grade: x.grade, groupNumber: x.part as 1 | 2 }));

    if (grades.length === 0 && groups.length === 0) {
      setEventsError("Выберите классы/группы.");
      return;
    }

    let startTime: string | null = null;
    let endTime: string | null = null;

    if (eventTimeMode === "slots") {
      const baseMinutes = parseHHMMToMinutes(timetableCfg?.dayStartTime ?? "") ?? 8 * 60;
      const dur =
        Number.isFinite(Number(timetableCfg?.defaultLessonMinutes)) && timetableCfg?.defaultLessonMinutes > 0
          ? Number(timetableCfg.defaultLessonMinutes)
          : 45;

      const a = Math.max(1, Number(eventStartSlot));
      const b = Math.max(a, Number(eventEndSlot));
      startTime = formatMinutesToHHMM(baseMinutes + (a - 1) * dur);
      endTime = formatMinutesToHHMM(baseMinutes + b * dur);
    } else {
      const a = parseHHMMToMinutes(eventStartTime);
      const b = parseHHMMToMinutes(eventEndTime);
      if (a == null || b == null || b <= a) {
        setEventsError("Некорректный диапазон времени.");
        return;
      }
      startTime = eventStartTime;
      endTime = eventEndTime;
    }

    try {
      setEventsLoading(true);
      setEventsError(null);
      await api.createCalendarEvent(token, {
        title,
        date: eventDialogDateValue,
        startTime,
        endTime,
        grades,
        groups,
        description: eventDialogDescription.trim() ? eventDialogDescription.trim() : undefined,
        status: "planned",
      });
      await refreshMonth();
      await refreshEventsForDialogDate();
    } catch (e) {
      setEventsError((e as Error).message);
    } finally {
      setEventsLoading(false);
    }
  }, [
    eventDialogDate,
    eventDialogDateValue,
    eventDialogDescription,
    eventDialogTitle,
    eventEndSlot,
    eventEndTime,
    eventStartSlot,
    eventStartTime,
    eventTimeMode,
    gradeParts,
    refreshEventsForDialogDate,
    refreshMonth,
    token,
    timetableCfg,
  ]);

  const updateSelectedEventStatus = useCallback(
    async (nextStatus: "planned" | "cancelled") => {
      if (!selectedEvent) return;
      try {
        setEventsLoading(true);
        setEventsError(null);
        await api.updateCalendarEvent(token, selectedEvent.id, { status: nextStatus });
        await refreshMonth();
        await refreshEventsForDialogDate();
        setSelectedEventId(null);
      } catch (e) {
        setEventsError((e as Error).message);
      } finally {
        setEventsLoading(false);
      }
    },
    [refreshEventsForDialogDate, refreshMonth, selectedEvent, token],
  );

  useEffect(() => {
    let cancelled = false;
    setTimetableError(null);
    void api
      .timetableConfig(token)
      .then((r) => {
        if (cancelled) return;
        setTimetableCfg(r?.config ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setTimetableError(e instanceof Error ? e.message : "TIMETABLE_LOAD_FAILED");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void api
      .schoolClasses(token)
      .then((res) => {
        if (cancelled) return;
        const grades = (res.classes ?? []).map((c: any) => c.grade).filter((g: any) => typeof g === "number").sort((a: number, b: number) => a - b);
        setSchoolGrades(grades);
        setGradeParts((prev) => {
          const next: Record<number, "whole" | 1 | 2 | null> = { ...prev };
          for (const g of grades) {
            if (!(g in next)) next[g] = null;
          }
          return next;
        });
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const timeIndicators = useMemo(() => {
    const d = new Date(now);
    const nowMinutes = d.getHours() * 60 + d.getMinutes();

    const lunchTimeStr = timetableCfg?.lunchTime ?? "13:00";
    const endTimeStr = timetableCfg?.workdayEndTime ?? "18:00";

    const lunchMinutes = parseHHMMToMinutes(lunchTimeStr);
    const endMinutes = parseHHMMToMinutes(endTimeStr);

    const lunchDiff = lunchMinutes != null ? lunchMinutes - nowMinutes : null;
    const endDiff = endMinutes != null ? endMinutes - nowMinutes : null;

    return {
      lunchTimeStr,
      endTimeStr,
      lunchDiff,
      endDiff,
      timetableError,
    };
  }, [now, timetableCfg, timetableError]);

  const monthGrid = useMemo(() => {
    const d = monthCursor;
    const y = d.getFullYear();
    const m1 = d.getMonth() + 1;
    const first = startOfMonth(y, m1);
    const leading = weekdayMon0(first);
    const count = daysInMonth(y, m1);

    const byDate = new Map(calendarDays.map((x) => [x.date, x.visualState] as const));
    const cells: Array<{ date: string | null; day: number | null; visual?: CalendarDay["visualState"] }> = [];
    for (let i = 0; i < leading; i++) cells.push({ date: null, day: null });
    for (let day = 1; day <= count; day++) {
      const date = `${y}-${String(m1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ date, day, visual: byDate.get(date) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [monthCursor, calendarDays]);

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5" data-dedus-id="main.sectionNav">
        <div className="text-sm text-slate-500">Раздел • Главная</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Доброго времени суток, @{username}!</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="ed-panel ed-panel-hover lg:col-span-2 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">Календарь</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{month}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium text-slate-900"
              >
                ←
              </button>
              <button
                onClick={() => setMonthCursor(() => new Date())}
                className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium text-slate-900"
              >
                Сегодня
              </button>
              <button
                onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium text-slate-900"
              >
                →
              </button>
              <button
                onClick={() => void refreshMonth()}
                className="ed-btn ed-btn-primary ed-interactive px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                disabled={calLoading}
              >
                Обновить
              </button>
            </div>
          </div>

          {calError ? <div className="mt-3 text-sm text-rose-700">{calError}</div> : null}

          <div className="mt-4 grid grid-cols-7 gap-2 text-xs text-slate-500">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((x) => (
              <div key={x} className="text-center">
                {x}
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {monthGrid.map((row, idx) => (
              <div key={idx} className="grid grid-cols-7 gap-2">
                {row.map((c, j) => {
                  const isToday = c.date === todayIso;
                  const bg =
                    c.visual === "has_event"
                      ? "bg-emerald-50"
                      : c.visual === "weekend_or_vacation"
                        ? "bg-amber-50"
                        : c.visual === "workday"
                          ? "bg-sky-50"
                          : "bg-white";
                  const ring = isToday ? "ring-1 ring-violet-400" : "ring-1 ring-slate-200";
                  return (
                    <button
                      key={j}
                      className={["ed-interactive ed-calendar-day h-10 rounded-xl", bg, ring, "flex items-center justify-center text-sm disabled:opacity-40"].join(" ")}
                      title={c.date ?? ""}
                      type="button"
                      onClick={() => {
                        if (!c.date) return;
                        void openEventDialog(c.date);
                      }}
                      disabled={!c.date}
                    >
                      {c.day ?? ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="ed-text-on-light rounded-full bg-sky-50 px-2 py-1 ring-1 ring-slate-200">Рабочий</span>
            <span className="ed-text-on-light rounded-full bg-amber-50 px-2 py-1 ring-1 ring-slate-200">Выходной/каникулы</span>
            <span className="ed-text-on-light rounded-full bg-emerald-50 px-2 py-1 ring-1 ring-slate-200">Событие</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ed-panel ed-panel-hover p-5">
            <div className="text-sm text-slate-500">Индикаторы времени</div>
            <div className="mt-3 grid gap-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">До обеда ({timeIndicators.lunchTimeStr})</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {timeIndicators.lunchDiff == null ? (
                    "—"
                  ) : timeIndicators.lunchDiff > 0 ? (
                    `До обеда осталось ${timeIndicators.lunchDiff} минут`
                  ) : timeIndicators.lunchDiff === 0 ? (
                    "Обед сейчас"
                  ) : (
                    "Обед прошёл"
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">До конца дня ({timeIndicators.endTimeStr})</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {timeIndicators.endDiff == null ? (
                    "—"
                  ) : timeIndicators.endDiff > 0 ? (
                    `До конца дня осталось ${timeIndicators.endDiff} минут`
                  ) : timeIndicators.endDiff === 0 ? (
                    "Конец рабочего дня сейчас"
                  ) : (
                    "Рабочий день закончился"
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="ed-panel ed-panel-hover p-5">
            <div className="text-sm text-slate-500">Задачи</div>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">Мои задачи</span> — где вы в ответственных. Полный список и
              фильтры — в трекере.
            </p>
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {myTrackerTasks.length === 0 ? (
                <li className="py-3 text-sm text-slate-500">Нет активных задач с вами в ответственных.</li>
              ) : (
                myTrackerTasks.map((t) => (
                  <li key={t.id} className="py-2.5">
                    <Link
                      to="/section/tasks"
                      className="block text-sm font-medium text-sky-800 hover:underline"
                    >
                      {taskIsCollective(t) ? (
                        <span className="mr-1 inline-block text-slate-500" title="Коллективная задача" aria-label="Коллективная задача">
                          👥
                        </span>
                      ) : null}
                      {t.title}
                    </Link>
                    {t.deadline ? (
                      <div className="mt-0.5 text-xs text-slate-500">{formatTrackerDeadlineShort(t.deadline)}</div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
            <Link
              to="/section/tasks"
              className="ed-btn ed-btn-primary ed-interactive mt-4 inline-flex px-4 py-2 text-sm font-medium text-white"
            >
              Открыть трекер задач
            </Link>
          </div>
      </div>
    </div>

    {eventDialogDate ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEventDialog();
          }}
        >
          <div className="ed-panel w-full max-w-3xl p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Мероприятия</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{eventDialogDate}</div>
              </div>
              <button onClick={closeEventDialog} className="ed-btn ed-btn-close ed-interactive px-3 py-1.5 text-sm">
                Закрыть
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="ed-card p-4">
                <div className="text-sm font-semibold text-slate-900">Создать мероприятие</div>
                <div className="mt-3 space-y-3">
                  <label className="block text-sm">
                    <div className="mb-1 text-slate-600">Название</div>
                    <input value={eventDialogTitle} onChange={(e) => setEventDialogTitle(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>

                  <label className="block text-sm">
                    <div className="mb-1 text-slate-600">Дата</div>
                    <input type="date" value={eventDialogDateValue} onChange={(e) => setEventDialogDateValue(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>

                  <div>
                    <div className="mb-1 text-sm text-slate-600">Время проведения</div>
                    <div className="flex gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={eventTimeMode === "slots"} onChange={() => setEventTimeMode("slots")} />
                        По слотам
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" checked={eventTimeMode === "time"} onChange={() => setEventTimeMode("time")} />
                        Конкретное время
                      </label>
                    </div>

                    {eventTimeMode === "slots" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="block text-sm">
                          <div className="mb-1 text-slate-600">С</div>
                          <input type="number" min={1} max={15} value={eventStartSlot} onChange={(e) => setEventStartSlot(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                        <label className="block text-sm">
                          <div className="mb-1 text-slate-600">По</div>
                          <input type="number" min={1} max={15} value={eventEndSlot} onChange={(e) => setEventEndSlot(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="block text-sm">
                          <div className="mb-1 text-slate-600">Начало</div>
                          <input type="time" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                        <label className="block text-sm">
                          <div className="mb-1 text-slate-600">Конец</div>
                          <input type="time" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                        </label>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-1 text-sm text-slate-600">Классы и группы</div>
                    <div className="space-y-2">
                      {schoolGrades.map((g) => {
                        const part = gradeParts[g] ?? null;
                        const checked = part != null;
                        return (
                          <div key={g} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const nextChecked = e.target.checked;
                                  setGradeParts((prev) => ({ ...prev, [g]: nextChecked ? (prev[g] ?? "whole") : null }));
                                }}
                              />
                              {g} класс
                            </label>
                            <select
                              disabled={!checked}
                              value={part ?? "whole"}
                              onChange={(e) => {
                                const v = e.target.value;
                                const next: "whole" | 1 | 2 = v === "whole" ? "whole" : Number(v) === 1 ? 1 : 2;
                                setGradeParts((prev) => ({ ...prev, [g]: next }));
                              }}
                              className="rounded-xl border border-slate-200 px-2 py-1 text-sm disabled:opacity-50"
                            >
                              <option value="whole">Весь класс</option>
                              <option value="1">Группа 1</option>
                              <option value="2">Группа 2</option>
                            </select>
                          </div>
                        );
                      })}
                      {schoolGrades.length === 0 ? <div className="text-sm text-slate-500">Загрузка классов...</div> : null}
                    </div>
                  </div>

                  <label className="block text-sm">
                    <div className="mb-1 text-slate-600">Описание</div>
                    <textarea value={eventDialogDescription} onChange={(e) => setEventDialogDescription(e.target.value)} className="w-full min-h-[80px] rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>

                  {eventsError ? <div className="text-sm text-rose-700">{eventsError}</div> : null}

                  <button
                    disabled={eventsLoading}
                    onClick={() => void createEvent()}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Создать
                  </button>
                </div>
              </div>

              <div className="ed-card p-4">
                <div className="text-sm font-semibold text-slate-900">Список мероприятий</div>
                <div className="mt-3 space-y-2">
                  {eventsLoading ? <div className="text-sm text-slate-500">Загрузка...</div> : null}
                  {eventsForDialog.map((ev) => {
                    let timeLabel = "весь день";
                    if (ev.startTime && ev.endTime) timeLabel = `${ev.startTime} - ${ev.endTime}`;
                    else if (ev.startTime && !ev.endTime) timeLabel = ev.startTime;
                    else if (!ev.startTime && ev.endTime) timeLabel = ev.endTime;
                    const statusLabel = ev.status === "cancelled" ? "Отменено" : "Активно";
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSelectedEventId(ev.id)}
                        className={["w-full rounded-xl border px-3 py-2 text-left", selectedEventId === ev.id ? "border-violet-400 bg-violet-50" : "border-slate-200"].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{ev.title}</div>
                            <div className="mt-1 text-xs text-slate-500">{timeLabel}</div>
                          </div>
                          <div className={["shrink-0 rounded-full px-2 py-1 text-[10px] font-medium", ev.status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"].join(" ")}>
                            {statusLabel}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {eventsForDialog.length === 0 && !eventsLoading ? <div className="text-sm text-slate-600">На эту дату мероприятий нет.</div> : null}
                </div>

                {selectedEvent ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 p-3">
                    <div className="text-sm font-semibold text-slate-900">Профиль мероприятия</div>
                    <div className="mt-2 text-sm font-medium text-slate-900">{selectedEvent.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {selectedEvent.startTime && selectedEvent.endTime ? `${selectedEvent.startTime} - ${selectedEvent.endTime}` : "весь день"} • {selectedEvent.date}
                    </div>
                    {selectedEvent.description ? <div className="mt-2 text-sm text-slate-700 line-clamp-3">{selectedEvent.description}</div> : null}

                    <div className="mt-3 space-y-2">
                      <label className="block text-sm">
                        <div className="mb-1 text-slate-600">Статус</div>
                        <select
                          value={selectedEvent.status === "cancelled" ? "cancelled" : "planned"}
                          onChange={(e) => void updateSelectedEventStatus(e.target.value === "cancelled" ? "cancelled" : "planned")}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        >
                          <option value="planned">Активно</option>
                          <option value="cancelled">Отменено</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => setSelectedEventId(null)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      >
                        Готово
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

