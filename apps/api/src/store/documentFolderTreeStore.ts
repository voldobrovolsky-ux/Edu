import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

export type DocumentTreeFolder = {
  id: string;
  name: string;
  sectionId: string | null;
  parentFolderId: string | null;
  disciplineId?: string | null;
  createdAt: string;
  /**
   * Автор папки (кто создал/владелец). Используется для ограничения:
   * менять доступ может только автор (или sysadmin).
   *
   * Для старых записей может быть undefined (историческая миграция).
   */
  ownerUserId?: string;
  /**
   * Тип доступа к папке.
   * - "private" — приватная (видна только автору или sysadmin)
   * - "org" — общая для всех пользователей школы/организации
   * - "selected" — доступ для выбранных пользователей/ролей
   *
   * Для старых записей может быть undefined (будет интерпретироваться через legacy-поля `shared/sharedWithUserIds`).
   */
  accessType?: "private" | "org" | "selected";
  /** Для "selected": пользовательские id. */
  sharedWithUserIds?: string[];
  /** Для "selected": primaryRole id. */
  sharedWithRoleIds?: string[];
  /** Hash пароля папки (bcrypt). Если есть — папка требует пароль. */
  passwordHash?: string;
  /** Общая папка (видна в UI, список доступа — sharedWithUserIds) */
  shared?: boolean;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "documentFoldersTree.json");

class DocumentFolderTreeStore {
  private cache: DocumentTreeFolder[] | null = null;

  private all(): DocumentTreeFolder[] {
    if (!this.cache) this.cache = readJsonArrayFile<DocumentTreeFolder>(DATA_PATH);
    return this.cache;
  }

  list(): DocumentTreeFolder[] {
    return [...this.all()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  findById(id: string): DocumentTreeFolder | undefined {
    return this.all().find((x) => x.id === id);
  }

  create(args: {
    name: string;
    sectionId?: string | null;
    parentFolderId?: string | null;
    disciplineId?: string | null;
    ownerUserId: string;
  }): DocumentTreeFolder {
    const item: DocumentTreeFolder = {
      id: randomUUID(),
      name: args.name.trim(),
      sectionId: args.sectionId ?? null,
      parentFolderId: args.parentFolderId ?? null,
      disciplineId: args.disciplineId ?? null,
      createdAt: new Date().toISOString(),
      ownerUserId: args.ownerUserId,
      accessType: "private",
    };
    const next = [...this.all(), item];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return item;
  }

  updateById(
    id: string,
    patch: {
      name?: string;
      sectionId?: string | null;
      parentFolderId?: string | null;
      disciplineId?: string | null;
      ownerUserId?: string;
      accessType?: "private" | "org" | "selected";
      shared?: boolean;
      sharedWithUserIds?: string[];
      sharedWithRoleIds?: string[];
      passwordHash?: string;
    },
  ): DocumentTreeFolder {
    const current = this.all();
    const idx = current.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    if (patch.name != null && !String(patch.name).trim()) throw new Error("NAME_REQUIRED");
    const nextItem: DocumentTreeFolder = {
      ...prev,
      name: patch.name != null ? String(patch.name).trim() : prev.name,
      sectionId: patch.sectionId !== undefined ? patch.sectionId : prev.sectionId,
      parentFolderId: patch.parentFolderId !== undefined ? patch.parentFolderId : prev.parentFolderId,
      disciplineId: patch.disciplineId !== undefined ? patch.disciplineId : prev.disciplineId ?? null,
      ownerUserId: patch.ownerUserId !== undefined ? patch.ownerUserId : prev.ownerUserId,
      accessType: patch.accessType !== undefined ? patch.accessType : prev.accessType,
      shared: patch.shared !== undefined ? patch.shared : prev.shared,
      sharedWithUserIds: patch.sharedWithUserIds !== undefined ? patch.sharedWithUserIds : prev.sharedWithUserIds,
      sharedWithRoleIds: patch.sharedWithRoleIds !== undefined ? patch.sharedWithRoleIds : prev.sharedWithRoleIds,
      passwordHash: patch.passwordHash !== undefined ? patch.passwordHash : prev.passwordHash,
    };
    const next = [...current.slice(0, idx), nextItem, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextItem;
  }

  findByDisciplineId(disciplineId: string): DocumentTreeFolder | undefined {
    return this.all().find((x) => (x.disciplineId ?? null) === disciplineId);
  }

  /** Обновить sectionId у папки и всех потомков (по parentFolderId). */
  updateSectionForSubtree(rootId: string, sectionId: string | null): void {
    const all = this.all();
    const byParent = new Map<string | null, DocumentTreeFolder[]>();
    for (const f of all) {
      const p = f.parentFolderId ?? null;
      const arr = byParent.get(p) ?? [];
      arr.push(f);
      byParent.set(p, arr);
    }
    const toUpdate = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      toUpdate.add(id);
      const children = byParent.get(id) ?? [];
      for (const c of children) stack.push(c.id);
    }
    const next = all.map((f) => (toUpdate.has(f.id) ? { ...f, sectionId } : f));
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  removeByIds(ids: Set<string>): void {
    const next = this.all().filter((x) => !ids.has(x.id));
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  /** Все потомки (включая root), BFS по parentFolderId. */
  collectDescendants(rootIds: string[]): Set<string> {
    const all = this.all();
    const byParent = new Map<string | null, string[]>();
    for (const f of all) {
      const p = f.parentFolderId ?? null;
      const arr = byParent.get(p) ?? [];
      arr.push(f.id);
      byParent.set(p, arr);
    }
    const out = new Set<string>();
    const stack = [...rootIds];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      const kids = byParent.get(id) ?? [];
      for (const k of kids) stack.push(k);
    }
    return out;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const documentFolderTreeStore = new DocumentFolderTreeStore();
