import { useCallback, useEffect, useRef, useState } from "react";
import type { AlarmSoundId } from "../audio/systemSoundConfig";
import { isAlarmSoundId } from "../audio/systemSoundConfig";
import { playTaskTrackerAlarmSound } from "../audio/systemSounds";
import { ED_Z_TOAST } from "../lib/zLayers";
import { loadTrackerTasks, TASK_TRACKER_UPDATED_EVENT, type TrackerTask } from "../lib/taskTrackerStorage";

type ToastItem = { id: string; taskTitle: string; message: string };

function defaultAlarmForTask(task: TrackerTask): AlarmSoundId | null {
  if (task.alarmSoundId === "none") return null;
  if (task.alarmSoundId) return task.alarmSoundId;
  if (typeof document !== "undefined") {
    const d = document.documentElement.dataset.edDefaultTrackerAlarm;
    if (d === "none") return null;
    if (d && isAlarmSoundId(d)) return d;
  }
  return "alarm1";
}

export function TaskTrackerReminderHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const tasksRef = useRef<TrackerTask[]>([]);

  const pushToast = useCallback((taskTitle: string, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, taskTitle, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  const schedule = useCallback(() => {
    tasksRef.current = loadTrackerTasks();
    const tasks = tasksRef.current;
    const handles: number[] = [];
    const now = Date.now();

    for (const task of tasks) {
      if (task.status === "done" || !task.deadline) continue;
      const deadlineMs = new Date(task.deadline).getTime();
      if (Number.isNaN(deadlineMs)) continue;

      for (const { offsetMinutes } of task.reminders) {
        const fireAt = deadlineMs - offsetMinutes * 60_000;
        if (fireAt <= now) continue;
        const delay = fireAt - now;
        const label =
          offsetMinutes === 0
            ? "Срок задачи"
            : offsetMinutes < 60
              ? `За ${offsetMinutes} мин до срока`
              : `За ${offsetMinutes / 60} ч до срока`;
        handles.push(
          window.setTimeout(() => {
            const alarmId = defaultAlarmForTask(task);
            if (alarmId) playTaskTrackerAlarmSound(alarmId);
            pushToast(task.title, `${label}: пора сделать или срок подошёл.`);
          }, delay),
        );
      }
    }

    return () => {
      for (const h of handles) window.clearTimeout(h);
    };
  }, [pushToast]);

  useEffect(() => {
    let cleanup = schedule();
    const onUpdate = () => {
      cleanup();
      cleanup = schedule();
    };
    window.addEventListener(TASK_TRACKER_UPDATED_EVENT, onUpdate);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "edumed.tasks.v1") onUpdate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TASK_TRACKER_UPDATED_EVENT, onUpdate);
      window.removeEventListener("storage", onStorage);
      cleanup();
    };
  }, [schedule]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 flex max-w-sm flex-col gap-2"
      style={{ zIndex: ED_Z_TOAST }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 shadow-lg"
        >
          <div className="font-semibold">{t.taskTitle}</div>
          <div className="mt-1 text-sky-900/90">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
