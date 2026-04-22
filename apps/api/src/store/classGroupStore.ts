import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClassGroup } from "../types/school.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "classGroups.json");

class ClassGroupStore {
  private cache: ClassGroup[] | null = null;

  private all(): ClassGroup[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<ClassGroup>(DATA_PATH);
      const byKey = new Map<string, ClassGroup>();
      for (const item of raw) {
        if (!Number.isInteger(item?.grade) || item.grade <= 0) continue;
        if (!Number.isInteger(item?.groupNumber) || item.groupNumber <= 0) continue;
        const key = `${item.grade}:${item.groupNumber}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          id: String(item.id ?? randomUUID()),
          grade: item.grade,
          groupNumber: item.groupNumber,
          createdAt: String(item.createdAt ?? new Date().toISOString()),
        });
      }
      this.cache = Array.from(byKey.values()).sort((a, b) =>
        a.grade !== b.grade ? a.grade - b.grade : a.groupNumber - b.groupNumber,
      );
    }
    return this.cache;
  }

  list(): ClassGroup[] {
    return [...this.all()];
  }

  listByGrade(grade: number): ClassGroup[] {
    return this.all()
      .filter((g) => g.grade === grade)
      .sort((a, b) => a.groupNumber - b.groupNumber);
  }

  findById(id: string): ClassGroup | undefined {
    return this.all().find((g) => g.id === id);
  }

  findByGradeAndNumber(grade: number, groupNumber: number): ClassGroup | undefined {
    return this.all().find((g) => g.grade === grade && g.groupNumber === groupNumber);
  }

  create(args: { grade: number; groupNumber: number }): ClassGroup {
    const { grade, groupNumber } = args;
    if (!Number.isInteger(grade) || grade <= 0) throw new Error("INVALID_GRADE");
    if (!Number.isInteger(groupNumber) || groupNumber <= 0) throw new Error("INVALID_GROUP");
    const existing = this.findByGradeAndNumber(grade, groupNumber);
    if (existing) return existing;

    const grp: ClassGroup = {
      id: randomUUID(),
      grade,
      groupNumber,
      createdAt: new Date().toISOString(),
    };
    const next = [...this.all(), grp];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return grp;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const classGroupStore = new ClassGroupStore();

