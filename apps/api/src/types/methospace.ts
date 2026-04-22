import type { JournalLessonTypeColorKey } from "./journalLessonTypeColors.js";

export type MethodPackLessonBinding = {
  date: string; // YYYY-MM-DD
  slotIndex: number;
  grade?: number;
  groupNumber?: number;
};

export type MethodPack = {
  id: string;
  disciplineCode: string; // MATEM5 и т.п.
  /**
   * Опциональная привязка к классам и/или конкретным урокам (по дате/слоту).
   * Если classesGrades пуст, методпакет доступен для всей дисциплины.
   */
  classGrades: number[];
  lessonBindings: MethodPackLessonBinding[];

  theme: string;
  goals: string;
  lessonPlan: string;
  materialDocumentIds: string[];
  homework: string;
  gradingCriteria: string;

  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type JournalLessonType = {
  id: string;
  name: string;
  description: string;
  /**
   * Коды сущностей дисциплин (MATEM5 и т.д.), для которых эталон показывается в метод. пространстве.
   * Пустой массив — тип доступен в журнале для всех предметов, в карточке дисциплины не фильтруется по коду.
   */
  disciplineCodes: string[];
  standardDocumentId: string | null;
  colorKey: JournalLessonTypeColorKey;
  createdAt: string;
  updatedAt: string;
};

export type JournalDocumentType = {
  /**
   * Уникальный идентификатор типа.
   *
   * Важно: для интеграции с существующим хранилищем документов
   * используем договорённость: документы в Document archive помечаются этим типом через
   * `tags.periods` = [id типа].
   *
   * Это не добавляет нового "истинного" хранилища связей, т.к. мы опираемся на
   * уже существующую фильтрацию документов по `periods`.
   */
  id: string;
  name: string;
  description: string;
  /** Если пусто/undefined — документ обязателен для всех типов уроков. */
  requiredForLessonTypeIds?: string[];
};

