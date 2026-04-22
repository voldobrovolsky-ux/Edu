import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

export type DocumentSection = {
  id: string;
  name: string;
  createdAt: string;
  ownerUserId?: string;
  passwordHash?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "documentSections.json");

class DocumentSectionStore {
  private cache: DocumentSection[] | null = null;

  private all(): DocumentSection[] {
    if (!this.cache) {
      this.cache = readJsonArrayFile<DocumentSection>(DATA_PATH).map((row) => ({
        ...row,
        ownerUserId: row.ownerUserId,
        passwordHash: row.passwordHash ?? "",
      }));
    }
    return this.cache;
  }

  list(): DocumentSection[] {
    return [...this.all()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  findById(id: string): DocumentSection | undefined {
    return this.all().find((x) => x.id === id);
  }

  findByName(name: string): DocumentSection | undefined {
    const normalized = name.trim().toLocaleLowerCase("ru");
    return this.all().find((x) => x.name.trim().toLocaleLowerCase("ru") === normalized);
  }

  create(name: string, ownerUserId: string): DocumentSection {
    const item: DocumentSection = {
      id: randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      ownerUserId,
      passwordHash: "",
    };
    const next = [...this.all(), item];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return item;
  }

  updateById(id: string, patch: { name?: string; passwordHash?: string }): DocumentSection {
    const current = this.all();
    const idx = current.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const trimmed = patch.name != null ? patch.name.trim() : prev.name;
    if (!trimmed) throw new Error("NAME_REQUIRED");
    const nextItem: DocumentSection = {
      ...prev,
      name: trimmed,
      passwordHash: patch.passwordHash !== undefined ? patch.passwordHash : prev.passwordHash,
    };
    const next = [...current.slice(0, idx), nextItem, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextItem;
  }

  updateName(id: string, name: string): DocumentSection {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("NAME_REQUIRED");
    return this.updateById(id, { name: trimmed });
  }

  removeById(id: string): void {
    const next = this.all().filter((x) => x.id !== id);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const documentSectionStore = new DocumentSectionStore();
