import { quarterStore } from "../store/quarterStore.js";

/** Период уроков для ревизии: по умолчанию от начала четверти, содержащей дату запуска, до даты запуска; иначе последние 30 дней. */
export function defaultLessonDateBoundsForScheduledAt(scheduledAtIso: string): { from: string; to: string } {
  const to = scheduledAtIso.slice(0, 10);
  const qs = quarterStore.list();
  for (const q of qs) {
    if (to >= q.startDate && to <= q.endDate) {
      return { from: q.startDate, to };
    }
  }
  const t = new Date(`${to}T12:00:00`);
  t.setDate(t.getDate() - 30);
  const from = t.toISOString().slice(0, 10);
  return { from, to };
}
