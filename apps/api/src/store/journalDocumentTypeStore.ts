import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JournalDocumentType } from "../types/methospace.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "journalDocumentTypes.json");

class JournalDocumentTypeStore {
  private cache: JournalDocumentType[] | null = null;

  private all(): JournalDocumentType[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<any>(DATA_PATH);
      this.cache = raw.map((x) => ({
        id: String(x.id ?? ""),
        name: String(x.name ?? ""),
        description: String(x.description ?? ""),
        requiredForLessonTypeIds: Array.isArray(x.requiredForLessonTypeIds)
          ? x.requiredForLessonTypeIds.filter((v: unknown): v is string => typeof v === "string")
          : undefined,
      }));
    }
    return this.cache;
  }

  list(): JournalDocumentType[] {
    return [...this.all()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  findById(id: string): JournalDocumentType | undefined {
    return this.all().find((t) => t.id === id);
  }

  create(args: { name: string; description?: string; requiredForLessonTypeIds?: string[] }): JournalDocumentType {
    const name = String(args.name ?? "").trim();
    if (!name) throw new Error("NAME_REQUIRED");
    const next: JournalDocumentType = {
      id: randomUUID(),
      name,
      description: typeof args.description === "string" ? args.description : "",
      requiredForLessonTypeIds:
        Array.isArray(args.requiredForLessonTypeIds) && args.requiredForLessonTypeIds.length
          ? Array.from(new Set(args.requiredForLessonTypeIds.filter(Boolean)))
          : undefined,
    };
    const updated = [...this.all(), next];
    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
    return next;
  }

  update(id: string, patch: { name?: string; description?: string; requiredForLessonTypeIds?: string[] }): JournalDocumentType {
    const current = this.all();
    const idx = current.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const next: JournalDocumentType = {
      ...prev,
      name: typeof patch.name === "string" ? patch.name.trim() : prev.name,
      description: typeof patch.description === "string" ? patch.description : prev.description,
      requiredForLessonTypeIds:
        patch.requiredForLessonTypeIds !== undefined
          ? patch.requiredForLessonTypeIds.length
            ? Array.from(new Set(patch.requiredForLessonTypeIds.filter(Boolean)))
            : []
          : prev.requiredForLessonTypeIds,
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
    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const journalDocumentTypeStore = new JournalDocumentTypeStore();

