import type { PrimaryRole } from "./roles.js";

export type DocumentTagSet = {
  disciplineCodes: string[];
  grades: number[];
  roles: PrimaryRole[];
  /** произвольная строка периода (например, "2025-Q1", "2026-03") */
  periods: string[];
  /**
   * Связи для ревизии: дисциплина, урок, тип документа журнала / тип урока.
   * Не используется для бизнес-логики выборок, только для последующей аналитики.
   */
  journalTrace?: {
    disciplineCode: string;
    timetableLessonId?: string;
    lessonDateIso?: string;
    journalDocumentTypeId?: string;
    journalLessonTypeId?: string;
  };
};

export type DocumentFolder = {
  /** Пока одна школа в инстансе; оставляем поле под расширение */
  schoolId: string; // e.g. "school-1"
  /** Кабинет/раздел, где хранится документ (document_archive | methospace | ...) */
  officeSection?: string;
  disciplineCode?: string;
  grade?: number;
  /** Документы ИОМ конкретного педагога (папка в профиле завуча). */
  iomTeacherUserId?: string | null;
};

export type StoredDocument = {
  id: string;
  originalFileName?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * Относительный путь внутри файлового хранилища.
   * Раздаётся через `/files/${storageRelPath}`.
   */
  storageRelPath: string;
  tags: DocumentTagSet;
  folder: DocumentFolder;
  sectionId?: string | null;
  folderId?: string | null;
  disciplineId?: string | null;
  isStandardizing?: boolean;
  createdByUserId: string;
  createdAt: string;
  /**
   * Текущая версия документа (для истории/отката).
   * Если поле отсутствует у старых записей — считаем, что документа нет в версии, пока не будет добавлена первая.
   */
  currentVersionId?: string | null;
  /** Мягкое удаление: документ скрыт из дерева, файл на диске сохраняется */
  inTrash?: boolean;
  trashedAt?: string | null;
};

export type DocumentVersion = {
  id: string;
  documentId: string;
  createdAt: string;
  createdByUserId: string;
  comment?: string;
  sizeBytes: number;
  mimeType: string;
  originalFileName?: string;
  originalName: string;
  /**
   * Относительный путь внутри файлового хранилища.
   * Раздаётся через `/files/${storageRelPath}`.
   */
  storageRelPath: string;
  isCurrent: boolean;
};

export type DocumentComment = {
  id: string;
  documentId: string;
  authorId: string;
  createdAt: string;
  body: string;
};

export type DocumentBinding = {
  type: "lesson" | "class" | "journalDecision" | "studentPortfolio" | "iom" | string;
  refId: string;
};

export function emptyTagSet(): DocumentTagSet {
  return { disciplineCodes: [], grades: [], roles: [], periods: [] };
}

