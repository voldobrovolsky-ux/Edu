import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TeacherLoad } from "../types/school.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "teacherLoads.json");

class TeacherLoadStore {
  private cache: TeacherLoad[] | null = null;

  private all(): TeacherLoad[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<any[]>(DATA_PATH) as any[];
      // Поддержка старого формата без grade/groupNumber.
      this.cache = raw.map((l) => {
        const disciplineCode: string = String(l.disciplineCode ?? "");
        const gradeInCode = (() => {
          const m = disciplineCode.match(/(\d+)$/);
          if (!m) return null;
          const n = Number(m[1]);
          return Number.isFinite(n) ? n : null;
        })();
        return {
          id: String(l.id ?? randomUUID()),
          teacherUserId: String(l.teacherUserId ?? ""),
          disciplineCode,
          grade: typeof l.grade === "number" ? l.grade : gradeInCode ?? 0,
          groupNumber: l.groupNumber ?? null,
          classGroupId: typeof l.classGroupId === "string" ? l.classGroupId : null,
          createdAt: String(l.createdAt ?? new Date().toISOString()),
        } satisfies TeacherLoad;
      });
    }
    return this.cache;
  }

  list(): TeacherLoad[] {
    return [...this.all()];
  }

  listByTeacher(teacherUserId: string): TeacherLoad[] {
    return this.all().filter((l) => l.teacherUserId === teacherUserId);
  }

  listByGrade(grade: number): TeacherLoad[] {
    return this.all().filter((l) => l.grade === grade);
  }

  findById(id: string): TeacherLoad | undefined {
    return this.all().find((l) => l.id === id);
  }

  listForContext(args: {
    grade: number;
    groupNumber?: number | null;
    teacherUserId?: string | null;
    disciplineCode?: string | null;
    classGroupId?: string | null;
  }): TeacherLoad[] {
    const normalizedGroup = args.groupNumber ?? null;
    return this.all().filter((l) => {
      if (l.grade !== args.grade) return false;
      if ((l.groupNumber ?? null) !== normalizedGroup) return false;
      if (args.teacherUserId != null && l.teacherUserId !== args.teacherUserId) return false;
      if (args.disciplineCode != null && l.disciplineCode !== args.disciplineCode) return false;
      if (args.classGroupId != null && (l.classGroupId ?? null) !== args.classGroupId) return false;
      return true;
    });
  }

  findMatchingLoad(args: {
    teacherUserId: string;
    disciplineCode: string;
    grade: number;
    groupNumber?: number | null;
    classGroupId?: string | null;
  }): TeacherLoad | null {
    return (
      this.listForContext({
        grade: args.grade,
        groupNumber: args.groupNumber ?? null,
        teacherUserId: args.teacherUserId,
        disciplineCode: args.disciplineCode,
        classGroupId: args.classGroupId ?? null,
      })[0] ?? null
    );
  }

  upsert(args: {
    teacherUserId: string;
    disciplineCode: string;
    grade: number;
    groupNumber?: number | null;
    classGroupId?: string | null;
  }): TeacherLoad {
    const current = this.all();
    const normalizedGroup = args.groupNumber ?? null;
    const existing = current.find((l) => {
      const lGroup = l.groupNumber ?? null;
      return (
        l.teacherUserId === args.teacherUserId &&
        l.disciplineCode === args.disciplineCode &&
        l.grade === args.grade &&
        lGroup === normalizedGroup
      );
    });
    if (existing) return existing;

    const item: TeacherLoad = {
      id: randomUUID(),
      teacherUserId: args.teacherUserId,
      disciplineCode: args.disciplineCode,
      grade: args.grade,
      groupNumber: normalizedGroup,
      classGroupId: args.classGroupId ?? null,
      createdAt: new Date().toISOString(),
    };
    const next = [...current, item];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return item;
  }

  replaceByTeacher(
    teacherUserId: string,
    rows: Array<{ disciplineCode: string; grade: number; groupNumber?: number | null; classGroupId?: string | null }>,
  ): TeacherLoad[] {
    const filtered = this.all().filter((l) => l.teacherUserId !== teacherUserId);
    const now = new Date().toISOString();
    const added: TeacherLoad[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const groupNumber = row.groupNumber ?? null;
      const key = `${row.disciplineCode}:${row.grade}:${groupNumber ?? "all"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      added.push({
        id: randomUUID(),
        teacherUserId,
        disciplineCode: row.disciplineCode,
        grade: row.grade,
        groupNumber,
        classGroupId: row.classGroupId ?? null,
        createdAt: now,
      });
    }
    const next = [...filtered, ...added];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return added;
  }

  /**
   * Разрешает ли запись TeacherLoad конкретному уроку учителя.
   *
   * Логика сопоставления:
   * - "весь класс" (groupNumber=null) матчится только с уроком без группы
   * - группа матчится только с этой же группой
   */
  isTeacherAllowedLesson(args: {
    teacherUserId: string;
    disciplineCode: string;
    grade: number;
    groupNumber?: number | null;
    classGroupId?: string | null;
  }): boolean {
    return Boolean(
      this.findMatchingLoad({
        teacherUserId: args.teacherUserId,
        disciplineCode: args.disciplineCode,
        grade: args.grade,
        groupNumber: args.groupNumber ?? null,
        classGroupId: args.classGroupId ?? null,
      }),
    );
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const teacherLoadStore = new TeacherLoadStore();

