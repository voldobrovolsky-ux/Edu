import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SchoolClass } from "../types/school.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "classes.json");

class ClassStore {
  private cache: SchoolClass[] | null = null;

  private all(): SchoolClass[] {
    if (this.cache) return this.cache;

    const existing = readJsonArrayFile<SchoolClass>(DATA_PATH);
    // Авто-инициализация базовых классов: если в хранилище нет ни одного класса.
    if (!existing.length) {
      const next: SchoolClass[] = Array.from({ length: 7 }).map((_, i) => {
        const grade = i + 1;
        return {
          id: randomUUID(),
          grade,
          createdAt: new Date().toISOString(),
        };
      });
      this.cache = next.sort((a, b) => a.grade - b.grade);
      writeJsonArrayFile(DATA_PATH, this.cache);
      return this.cache;
    }

    // На всякий случай: сортировка и удаление возможных дублей по grade.
    const byGrade = new Map<number, SchoolClass>();
    for (const c of existing) {
      if (!Number.isFinite(c.grade) || c.grade <= 0) continue;
      if (!byGrade.has(c.grade)) byGrade.set(c.grade, c);
    }
    this.cache = Array.from(byGrade.values()).sort((a, b) => a.grade - b.grade);
    return this.cache;
  }

  list(): SchoolClass[] {
    return [...this.all()].sort((a, b) => a.grade - b.grade);
  }

  findByGrade(grade: number): SchoolClass | undefined {
    return this.all().find((c) => c.grade === grade);
  }

  create(grade: number): SchoolClass {
    if (!Number.isInteger(grade) || grade <= 0) throw new Error("INVALID_GRADE");
    const existing = this.findByGrade(grade);
    if (existing) return existing;

    const cls: SchoolClass = {
      id: randomUUID(),
      grade,
      createdAt: new Date().toISOString(),
    };
    const next = [...this.all(), cls];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return cls;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const classStore = new ClassStore();

