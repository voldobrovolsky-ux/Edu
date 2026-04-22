import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JournalLessonType } from "../types/methospace.js";
import { isJournalLessonTypeColorKey, type JournalLessonTypeColorKey } from "../types/journalLessonTypeColors.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "journalLessonTypes.json");

class JournalLessonTypeStore {
  private cache: JournalLessonType[] | null = null;

  private all(): JournalLessonType[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<any>(DATA_PATH);
      this.cache = raw.map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        description: String(r.description ?? ""),
        disciplineCodes: Array.isArray(r.disciplineCodes) ? r.disciplineCodes.filter((x: unknown): x is string => typeof x === "string") : [],
        standardDocumentId: r.standardDocumentId != null ? String(r.standardDocumentId) : null,
        colorKey: normalizeColorKey(r.colorKey),
        createdAt: String(r.createdAt ?? new Date().toISOString()),
        updatedAt: String(r.updatedAt ?? new Date().toISOString()),
      }));
    }
    return this.cache!;
  }

  list(): JournalLessonType[] {
    return [...this.all()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  findById(id: string): JournalLessonType | undefined {
    return this.all().find((t) => t.id === id);
  }

  create(args: {
    name: string;
    description?: string;
    disciplineCodes?: string[];
    colorKey: JournalLessonTypeColorKey;
    standardDocumentId?: string | null;
  }): JournalLessonType {
    const name = String(args.name ?? "").trim();
    if (!name) throw new Error("NAME_REQUIRED");
    const now = new Date().toISOString();
    const next: JournalLessonType = {
      id: randomUUID(),
      name,
      description: typeof args.description === "string" ? args.description : "",
      disciplineCodes: Array.isArray(args.disciplineCodes) ? args.disciplineCodes.map((c) => String(c).trim()).filter(Boolean) : [],
      standardDocumentId: args.standardDocumentId != null ? String(args.standardDocumentId) : null,
      colorKey: args.colorKey,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...this.all(), next];
    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
    return next;
  }

  update(
    id: string,
    patch: {
      name?: string;
      description?: string;
      disciplineCodes?: string[];
      colorKey?: JournalLessonTypeColorKey;
      standardDocumentId?: string | null;
    },
  ): JournalLessonType {
    const current = this.all();
    const idx = current.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const next: JournalLessonType = {
      ...prev,
      name: patch.name != null ? String(patch.name).trim() : prev.name,
      description: patch.description != null ? String(patch.description) : prev.description,
      disciplineCodes: patch.disciplineCodes != null ? patch.disciplineCodes.map((c) => String(c).trim()).filter(Boolean) : prev.disciplineCodes,
      colorKey: patch.colorKey != null ? normalizeColorKey(patch.colorKey) : prev.colorKey,
      standardDocumentId:
        patch.standardDocumentId !== undefined
          ? patch.standardDocumentId == null
            ? null
            : String(patch.standardDocumentId)
          : prev.standardDocumentId,
      updatedAt: new Date().toISOString(),
    };
    if (!next.name) throw new Error("NAME_REQUIRED");
    const updated = [...current.slice(0, idx), next, ...current.slice(idx + 1)];
    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
    return next;
  }

  delete(id: string): void {
    const current = this.all();
    const updated = current.filter((t) => t.id !== id);
    if (updated.length === current.length) throw new Error("NOT_FOUND");
    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

function normalizeColorKey(v: unknown): JournalLessonTypeColorKey {
  const s = typeof v === "string" ? v : "";
  if (isJournalLessonTypeColorKey(s)) return s;
  return "neutral_blue_gray";
}

export const journalLessonTypeStore = new JournalLessonTypeStore();
