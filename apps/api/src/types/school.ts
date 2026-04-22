export type SchoolClass = {
  id: string;
  grade: number; // номер класса (GENERAL DESCRIPTION §3.2)
  createdAt: string;
};

export type ClassGroup = {
  id: string;
  grade: number;
  groupNumber: number;
  createdAt: string;
};

export type StudentProfile = {
  userId: string;
  studentCode: string; // GENERAL DESCRIPTION §2.4
  grade?: number;
  groupNumber?: number;
  classGroupId?: string | null;
  createdAt: string;
};

export type DocumentRef = {
  id: string;
  name: string;
  url: string;
};

export type GradeRanges = Record<
  "1" | "2" | "3" | "4" | "5",
  { min: number; max: number }
>;

export type Discipline = {
  id: string;
  code: string; // MATEM5 (GENERAL DESCRIPTION §2.4)
  baseCode: string; // MATEM
  name: string; // человеческое название
  grade: number;
  documents: DocumentRef[];
  /**
   * Корневая папка в «Документы -> Дисциплины» (например, «Математика»).
   * Сохраняем поле для обратной совместимости: ранее хранилась одна папка на код.
   */
  documentFolderId?: string | null;
  /** Корневая папка для дисциплины (например, «Математика»). */
  rootFolderId?: string | null;
  /** Папка для конкретного класса (например, «Математика 5 класс»). */
  classFolderId?: string | null;
  gradeRanges: GradeRanges; // диапазоны средних баллов для итоговых оценок
  createdAt: string;
};

export type TeacherLoad = {
  id: string;
  teacherUserId: string;
  disciplineCode: string; // внутренний ключ
  grade: number;
  /**
   * null/undefined = ведёт "весь класс" (без группового ограничения).
   * 1/2 = ведёт только конкретную группу.
   */
  groupNumber?: number | null;
  classGroupId?: string | null;
  createdAt: string;
};

