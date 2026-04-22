import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

export type ParentChildLink = {
  id: string;
  parentUserId: string;
  studentUserId: string;
  createdAt: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "parent-children.json");

class ParentChildStore {
  private cache: ParentChildLink[] | null = null;

  private all(): ParentChildLink[] {
    if (!this.cache) this.cache = readJsonArrayFile<ParentChildLink>(DATA_PATH);
    return this.cache;
  }

  listByParent(parentUserId: string): ParentChildLink[] {
    return this.all().filter((x) => x.parentUserId === parentUserId);
  }

  isLinked(args: { parentUserId: string; studentUserId: string }): boolean {
    return this.all().some((x) => x.parentUserId === args.parentUserId && x.studentUserId === args.studentUserId);
  }

  /**
   * Минимальный upsert для демо/админки (UI ещё нет).
   * Дубликаты схлопываем по (parentUserId, studentUserId).
   */
  upsert(input: { id: string; parentUserId: string; studentUserId: string }): ParentChildLink {
    const current = this.all();
    const existingIdx = current.findIndex(
      (x) => x.parentUserId === input.parentUserId && x.studentUserId === input.studentUserId,
    );
    const next: ParentChildLink = {
      id: input.id,
      parentUserId: input.parentUserId,
      studentUserId: input.studentUserId,
      createdAt: existingIdx >= 0 ? current[existingIdx]!.createdAt : new Date().toISOString(),
    };

    const updated = existingIdx >= 0 ? current.map((x, i) => (i === existingIdx ? next : x)) : [...current, next];
    this.cache = updated;
    writeJsonArrayFile(DATA_PATH, updated);
    return next;
  }

  removeByParent(parentUserId: string): void {
    const next = this.all().filter((x) => x.parentUserId !== parentUserId);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  removeByStudent(studentUserId: string): void {
    const next = this.all().filter((x) => x.studentUserId !== studentUserId);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  removeLink(parentUserId: string, studentUserId: string): void {
    const next = this.all().filter((x) => !(x.parentUserId === parentUserId && x.studentUserId === studentUserId));
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  replaceChildren(parentUserId: string, studentUserIds: string[]): ParentChildLink[] {
    const unique = Array.from(new Set(studentUserIds));
    const keep = this.all().filter((x) => x.parentUserId !== parentUserId);
    const now = new Date().toISOString();
    const nextForParent = unique.map((studentUserId) => ({
      id: `${parentUserId}:${studentUserId}`,
      parentUserId,
      studentUserId,
      createdAt: now,
    }));
    const next = [...keep, ...nextForParent];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextForParent;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const parentChildStore = new ParentChildStore();

