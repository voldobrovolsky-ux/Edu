import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MethodPack } from "../types/methospace.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "methodPacks.json");

function normalizeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)));
}

function normalizeNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(v.filter((x): x is number => typeof x === "number" && Number.isFinite(x))),
  );
}

function normalizeBindings(v: unknown): MethodPack["lessonBindings"] {
  if (!Array.isArray(v)) return [];
  const out: MethodPack["lessonBindings"] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const obj = item as any;
    const date = typeof obj.date === "string" ? obj.date : "";
    const slotIndex = typeof obj.slotIndex === "number" ? obj.slotIndex : NaN;
    if (!date || !Number.isFinite(slotIndex)) continue;
    const grade = typeof obj.grade === "number" && Number.isFinite(obj.grade) ? obj.grade : undefined;
    const groupNumber =
      typeof obj.groupNumber === "number" && Number.isFinite(obj.groupNumber) ? obj.groupNumber : undefined;
    out.push({ date, slotIndex, grade, groupNumber });
  }
  return out;
}

class MethodPackStore {
  private cache: MethodPack[] | null = null;

  private all(): MethodPack[] {
    if (!this.cache) this.cache = readJsonArrayFile<MethodPack>(DATA_PATH);
    return this.cache;
  }

  list(filter?: { disciplineCode?: string; createdByUserId?: string }): MethodPack[] {
    let items = [...this.all()];
    if (filter?.disciplineCode) items = items.filter((p) => p.disciplineCode === filter.disciplineCode);
    if (filter?.createdByUserId) items = items.filter((p) => p.createdByUserId === filter.createdByUserId);
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  findById(id: string): MethodPack | undefined {
    return this.all().find((p) => p.id === id);
  }

  create(args: {
    disciplineCode: string;
    createdByUserId: string;
    theme: unknown;
    goals: unknown;
    lessonPlan: unknown;
    materialDocumentIds?: unknown;
    homework: unknown;
    gradingCriteria: unknown;
    classGrades?: unknown;
    lessonBindings?: unknown;
  }): MethodPack {
    if (!args.disciplineCode) throw new Error("DISCIPLINE_CODE_REQUIRED");
    const now = new Date().toISOString();
    const pack: MethodPack = {
      id: randomUUID(),
      disciplineCode: args.disciplineCode,
      classGrades: normalizeNumberArray(args.classGrades),
      lessonBindings: normalizeBindings(args.lessonBindings),
      theme: normalizeString(args.theme),
      goals: normalizeString(args.goals),
      lessonPlan: normalizeString(args.lessonPlan),
      materialDocumentIds: normalizeStringArray(args.materialDocumentIds),
      homework: normalizeString(args.homework),
      gradingCriteria: normalizeString(args.gradingCriteria),
      createdByUserId: args.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...this.all(), pack];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return pack;
  }

  update(id: string, patch: Partial<Omit<MethodPack, "id" | "createdByUserId" | "createdAt">>): MethodPack {
    const current = this.all();
    const idx = current.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const nextPack: MethodPack = {
      ...prev,
      disciplineCode: typeof patch.disciplineCode === "string" ? patch.disciplineCode : prev.disciplineCode,
      classGrades: patch.classGrades ? normalizeNumberArray(patch.classGrades) : prev.classGrades,
      lessonBindings: patch.lessonBindings ? normalizeBindings(patch.lessonBindings) : prev.lessonBindings,
      theme: typeof patch.theme === "string" ? patch.theme : prev.theme,
      goals: typeof patch.goals === "string" ? patch.goals : prev.goals,
      lessonPlan: typeof patch.lessonPlan === "string" ? patch.lessonPlan : prev.lessonPlan,
      materialDocumentIds: patch.materialDocumentIds ? normalizeStringArray(patch.materialDocumentIds) : prev.materialDocumentIds,
      homework: typeof patch.homework === "string" ? patch.homework : prev.homework,
      gradingCriteria: typeof patch.gradingCriteria === "string" ? patch.gradingCriteria : prev.gradingCriteria,
      updatedAt: new Date().toISOString(),
    };
    const next = [...current.slice(0, idx), nextPack, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextPack;
  }

  delete(id: string): { ok: true } {
    const current = this.all();
    if (!current.some((p) => p.id === id)) throw new Error("NOT_FOUND");
    const next = current.filter((p) => p.id !== id);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return { ok: true };
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const methodPackStore = new MethodPackStore();

