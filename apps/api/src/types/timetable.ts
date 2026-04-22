export type TimetableConfig = {
  id: "timetable-config";
  /**
   * “время 1 урока = X минут” для всей сетки (GENERAL DESCRIPTION §3.2).
   * Используется как значение по умолчанию для всех слотов.
   */
  defaultLessonMinutes: number;
  /**
   * Начало первого слота (нужно для наложения событий по времени).
   * Формат: "HH:MM".
   */
  dayStartTime: string;

  /**
   * Явные интервалы по номеру урока (slotIndex, 1..N) для колонки времени.
   * Если задано для slotIndexStart объединённого блока — интервал покрывает весь диапазон.
   */
  lessonTimesBySlotIndex?: Partial<Record<string, { startTime: string; endTime: string }>>;

  /**
   * Глобальные параметры рабочего дня для индикаторов времени.
   * Эти поля не ломают старую логику, т.к. используются только UI-уровнем.
   */
  workdayStartTime?: string;
  workdayEndTime?: string;
  lunchTime?: string;
  updatedAt: string;
};

export type TimetableSlot = {
  id: string;
  index: number; // 1..N (номер урока в дне)
  /**
   * Локальное переопределение длительности конкретного слота.
   * Если null/undefined — берётся TimetableConfig.defaultLessonMinutes.
   */
  durationMinutesOverride?: number | null;
  createdAt: string;
};

export type TimetableSlotPatternKind = "lesson" | "service";
export type TimetableServiceType = "lunch" | "walk" | "self_study" | "other";

export type TimetableSlotPattern = {
  id: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  weekStart?: string | null;
  slotIndexStart: number;
  slotIndexEnd: number;
  kind: TimetableSlotPatternKind;
  serviceType?: TimetableServiceType | null;
  /**
   * Пользовательское описание для `serviceType="other"`.
   * Для остальных служебных типов хранится как `null`.
   */
  serviceDescription?: string | null;
  /** Подпись для объединённого блока (несколько номеров урока). */
  blockLabel?: string | null;
  /** Индекс цвета из палитры UI (0..9). */
  blockColorIndex?: number | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TimetableLesson = {
  id: string;
  date: string; // YYYY-MM-DD
  slotIndex: number; // TimetableSlot.index
  slotPatternId?: string | null;
  grade: number; // SchoolClass.grade
  /**
   * null/undefined = урок для всего класса.
   * number = урок для конкретной группы (ClassGroup.groupNumber).
   */
  groupNumber?: number | null;
  classGroupId?: string | null;
  disciplineCode: string; // Discipline.code (например MATEM5)
  teacherUserId: string; // User.id (учитель)
  teacherLoadId?: string | null;
  createdAt: string;
};

export type TimetableComputedSlot = {
  slotPatternId?: string;
  dayOfWeek?: 1 | 2 | 3 | 4 | 5;
  slotIndex: number;
  slotIndexEnd?: number;
  kind?: TimetableSlotPatternKind;
  serviceType?: TimetableServiceType | null;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
};

