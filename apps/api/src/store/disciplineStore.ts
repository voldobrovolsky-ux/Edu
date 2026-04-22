import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Discipline, GradeRanges } from "../types/school.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "disciplines.json");

const DEFAULT_RANGES: GradeRanges = {
  "1": { min: 0, max: 0 },
  "2": { min: 0, max: 0 },
  "3": { min: 0, max: 0 },
  "4": { min: 0, max: 0 },
  "5": { min: 0, max: 0 },
};

function normalizeRanges(input: unknown): GradeRanges {
  if (!input || typeof input !== "object") return { ...DEFAULT_RANGES };
  const obj = input as any;
  const out: GradeRanges = { ...DEFAULT_RANGES };
  for (const k of ["1", "2", "3", "4", "5"] as const) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const min = typeof v.min === "number" ? v.min : out[k].min;
      const max = typeof v.max === "number" ? v.max : out[k].max;
      out[k] = { min, max };
    }
  }
  return out;
}

class DisciplineStore {
  private cache: Discipline[] | null = null;

  private all(): Discipline[] {
    if (!this.cache) this.cache = readJsonArrayFile<Discipline>(DATA_PATH);
    return this.cache;
  }

  list(): Discipline[] {
    return [...this.all()].sort((a, b) => a.code.localeCompare(b.code));
  }

  listByGrade(grade: number): Discipline[] {
    return this.all()
      .filter((d) => d.grade === grade)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  findByCode(code: string): Discipline | undefined {
    return this.all().find((d) => d.code === code);
  }

  create(args: {
    code: string;
    baseCode: string;
    name: string;
    grade: number;
    documents: Discipline["documents"];
    documentFolderId?: string | null;
    rootFolderId?: string | null;
    classFolderId?: string | null;
    gradeRanges?: unknown;
  }): Discipline {
    if (this.findByCode(args.code)) throw new Error("DISCIPLINE_CODE_TAKEN");
    const discipline: Discipline = {
      id: randomUUID(),
      code: args.code,
      baseCode: args.baseCode,
      name: args.name,
      grade: args.grade,
      documents: Array.isArray(args.documents) ? args.documents : [],
      documentFolderId: args.documentFolderId ?? null,
      rootFolderId: args.rootFolderId ?? null,
      classFolderId: args.classFolderId ?? null,
      gradeRanges: normalizeRanges(args.gradeRanges),
      createdAt: new Date().toISOString(),
    };
    const next = [...this.all(), discipline];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return discipline;
  }

  updateByCode(
    code: string,
    patch: Partial<Pick<Discipline, "documents" | "gradeRanges" | "name" | "documentFolderId" | "rootFolderId" | "classFolderId">>,
  ): Discipline {
    const current = this.all();
    const idx = current.findIndex((d) => d.code === code);
    if (idx < 0) throw new Error("DISCIPLINE_NOT_FOUND");
    const prev = current[idx]!;
    const nextDiscipline: Discipline = {
      ...prev,
      name: typeof patch.name === "string" ? patch.name : prev.name,
      documents: Array.isArray(patch.documents) ? patch.documents : prev.documents,
      documentFolderId: patch.documentFolderId !== undefined ? patch.documentFolderId ?? null : prev.documentFolderId ?? null,
      rootFolderId: patch.rootFolderId !== undefined ? patch.rootFolderId ?? null : prev.rootFolderId ?? null,
      classFolderId: patch.classFolderId !== undefined ? patch.classFolderId ?? null : prev.classFolderId ?? null,
      gradeRanges: patch.gradeRanges ? normalizeRanges(patch.gradeRanges) : prev.gradeRanges,
    };
    const next = [...current.slice(0, idx), nextDiscipline, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDiscipline;
  }

  removeDocumentEverywhere(documentId: string): void {
    const current = this.all();
    const next = current.map((d) => ({
      ...d,
      documents: d.documents.filter((x) => x.id !== documentId),
    }));
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  removeByCode(code: string): Discipline | null {
    const current = this.all();
    const existing = current.find((d) => d.code === code) ?? null;
    if (!existing) return null;
    const next = current.filter((d) => d.code !== code);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return existing;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const disciplineStore = new DisciplineStore();

