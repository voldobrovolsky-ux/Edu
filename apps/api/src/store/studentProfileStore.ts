import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classGroupStore } from "../store/classGroupStore.js";
import type { StudentProfile } from "../types/school.js";
import { resolveStudentPlacement } from "../services/schoolStructure.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "students.json");

class StudentProfileStore {
  private cache: StudentProfile[] | null = null;

  private all(): StudentProfile[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<StudentProfile>(DATA_PATH);
      this.cache = raw.map((profile) => {
        const normalizedBase: StudentProfile = {
          userId: String(profile.userId ?? ""),
          studentCode: String(profile.studentCode ?? ""),
          createdAt: String(profile.createdAt ?? new Date().toISOString()),
          grade: Number.isInteger(profile.grade) ? profile.grade : undefined,
          groupNumber: Number.isInteger(profile.groupNumber) ? profile.groupNumber : undefined,
          classGroupId: typeof profile.classGroupId === "string" ? profile.classGroupId : null,
        };
        const resolved = resolveStudentPlacement(normalizedBase);
        return {
          ...normalizedBase,
          grade: resolved?.grade ?? normalizedBase.grade,
          groupNumber: resolved?.groupNumber ?? normalizedBase.groupNumber,
          classGroupId:
            resolved?.classGroupId ??
            normalizedBase.classGroupId ??
            (resolved ? classGroupStore.findByGradeAndNumber(resolved.grade, resolved.groupNumber)?.id ?? null : null),
        };
      });
    }
    return this.cache;
  }

  list(): StudentProfile[] {
    return [...this.all()];
  }

  findByUserId(userId: string): StudentProfile | undefined {
    return this.all().find((s) => s.userId === userId);
  }

  findByStudentCode(studentCode: string): StudentProfile | undefined {
    return this.all().find((s) => s.studentCode === studentCode);
  }

  upsert(input: {
    userId: string;
    studentCode: string;
    grade?: number;
    groupNumber?: number;
    classGroupId?: string | null;
  }): StudentProfile {
    const current = this.all();
    const existingIdx = current.findIndex((s) => s.userId === input.userId);
    const next: StudentProfile = {
      userId: input.userId,
      studentCode: input.studentCode,
      grade: Number.isInteger(input.grade) ? input.grade : undefined,
      groupNumber: Number.isInteger(input.groupNumber) ? input.groupNumber : undefined,
      classGroupId: input.classGroupId ?? null,
      createdAt: existingIdx >= 0 ? current[existingIdx]!.createdAt : new Date().toISOString(),
    };

    const updated =
      existingIdx >= 0
        ? current.map((s, i) => (i === existingIdx ? next : s))
        : [...current, next];

    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
    return next;
  }

  removeByUserId(userId: string): void {
    const next = this.all().filter((s) => s.userId !== userId);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const studentProfileStore = new StudentProfileStore();

