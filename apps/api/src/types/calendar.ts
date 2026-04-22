import type { CalendarAnalyticsMeta } from "./analytics.js";

export type CalendarEventStatus = "planned" | "held" | "cancelled";
export type CalendarEventKind = "general" | "service";
export type CalendarServiceType = "lunch" | "walk" | "self_study" | "other";

export type CalendarEventTargetGroup = {
  grade: number;
  groupNumber: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  /**
   * Текст мероприятия (опционально).
   * GENERAL DESCRIPTION §2.4 (описание из UI).
   */
  description?: string;
  date: string; // YYYY-MM-DD (без повторяемости, GENERAL DESCRIPTION + ограничения задачи)
  /**
   * Время события. Если startTime/endTime не заданы — считаем событие “весь день”
   * (перекрывает все слоты выбранных классов).
   */
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
  /**
   * Участники события:
   * - grades: целые классы (по SchoolClass.grade)
   * - groups: конкретные группы внутри класса
   */
  grades: number[];
  groups: CalendarEventTargetGroup[];
  kind?: CalendarEventKind;
  serviceType?: CalendarServiceType | null;
  analytics?: CalendarAnalyticsMeta | null;
  status: CalendarEventStatus;
  createdAt: string;
  updatedAt: string;
};

export type CalendarDayVisualState = "workday" | "weekend_or_vacation" | "has_event";

