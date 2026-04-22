import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentFolder, DocumentTagSet, StoredDocument } from "../types/documents.js";
import { emptyTagSet } from "../types/documents.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "documents.json");
const FILES_ROOT = join(__dirname, "..", "..", "data", "files");

export function getDocumentsFilesRoot(): string {
  if (!existsSync(FILES_ROOT)) mkdirSync(FILES_ROOT, { recursive: true });
  return FILES_ROOT;
}

function safePathSegment(input: string): string {
  const s = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 64);
  return s.length ? s : "x";
}

function safeFileName(input: string): string {
  const base = safePathSegment(input);
  // guard against "." / ".." after sanitization
  if (base === "." || base === "..") return "file";
  return base;
}

function normalizeTagSet(input: unknown): DocumentTagSet {
  const base = emptyTagSet();
  if (!input || typeof input !== "object") return base;
  const obj = input as any;
  const disciplineCodes = Array.isArray(obj.disciplineCodes)
    ? obj.disciplineCodes.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const grades = Array.isArray(obj.grades)
    ? obj.grades.filter((x: unknown): x is number => typeof x === "number" && Number.isFinite(x))
    : [];
  const roles = Array.isArray(obj.roles)
    ? obj.roles.filter((x: unknown): x is any => typeof x === "string")
    : [];
  const periods = Array.isArray(obj.periods)
    ? obj.periods.filter((x: unknown): x is string => typeof x === "string")
    : [];
  return {
    disciplineCodes: Array.from(new Set(disciplineCodes)),
    grades: Array.from(new Set(grades)),
    roles: Array.from(new Set(roles)) as any,
    periods: Array.from(new Set(periods.map((p: string) => p.trim()).filter(Boolean))),
  };
}

function normalizeFolder(input: unknown): DocumentFolder {
  const fallback: DocumentFolder = { schoolId: "school-1" };
  if (!input || typeof input !== "object") return fallback;
  const obj = input as any;
  const schoolId = typeof obj.schoolId === "string" && obj.schoolId.trim() ? obj.schoolId.trim() : "school-1";
  const officeSection =
    typeof obj.officeSection === "string" && obj.officeSection.trim() ? obj.officeSection.trim() : undefined;
  const disciplineCode =
    typeof obj.disciplineCode === "string" && obj.disciplineCode.trim() ? obj.disciplineCode.trim() : undefined;
  const grade = typeof obj.grade === "number" && Number.isFinite(obj.grade) ? obj.grade : undefined;
  const iomTeacherUserId =
    typeof obj.iomTeacherUserId === "string" && obj.iomTeacherUserId.trim() ? obj.iomTeacherUserId.trim() : undefined;
  return { schoolId, officeSection, disciplineCode, grade, iomTeacherUserId };
}

function buildStorageRelPath(args: {
  folder: DocumentFolder;
  id: string;
  originalName: string;
}): string {
  const parts = [
    safePathSegment(args.folder.schoolId || "school-1"),
    args.folder.officeSection ? safePathSegment(args.folder.officeSection) : "school",
  ];
  if (args.folder.iomTeacherUserId) parts.push("iom", safePathSegment(args.folder.iomTeacherUserId));
  if (args.folder.disciplineCode) parts.push(safePathSegment(args.folder.disciplineCode));
  if (args.folder.grade != null) parts.push(safePathSegment(String(args.folder.grade)));

  const name = safeFileName(args.originalName);
  const file = `${args.id}__${name}`;
  parts.push(file);
  return parts.join("/");
}

function ensureWithinRoot(absPath: string): void {
  const root = normalize(getDocumentsFilesRoot() + sep);
  const target = normalize(absPath);
  if (!target.startsWith(root)) {
    throw new Error("INVALID_PATH");
  }
}

class DocumentStore {
  private cache: StoredDocument[] | null = null;

  private all(): StoredDocument[] {
    if (!this.cache) {
      this.cache = readJsonArrayFile<StoredDocument>(DATA_PATH).map((doc) => ({
        ...doc,
        originalFileName: doc.originalFileName ?? doc.originalName,
        sectionId: doc.sectionId ?? null,
        folderId: doc.folderId ?? null,
        disciplineId: doc.disciplineId ?? null,
        isStandardizing: Boolean(doc.isStandardizing),
        currentVersionId: doc.currentVersionId ?? doc.id,
        inTrash: Boolean(doc.inTrash),
        trashedAt: doc.trashedAt ?? null,
      }));
    }
    return this.cache;
  }

  private visible(items: StoredDocument[]): StoredDocument[] {
    return items.filter((d) => !d.inTrash);
  }

  list(filter?: {
    disciplineCode?: string;
    grade?: number;
    officeSection?: string;
    roles?: string[];
    periods?: string[];
    iomTeacherUserId?: string;
  }): StoredDocument[] {
    let items = this.visible([...this.all()]);
    if (filter?.disciplineCode) {
      items = items.filter(
        (d) => d.folder.disciplineCode === filter.disciplineCode || d.tags.disciplineCodes.includes(filter.disciplineCode!),
      );
    }
    if (filter?.grade != null) items = items.filter((d) => d.folder.grade === filter.grade || d.tags.grades.includes(filter.grade!));
    if (filter?.officeSection) items = items.filter((d) => d.folder.officeSection === filter.officeSection);
    if (filter?.roles?.length) {
      const wanted = new Set(filter.roles);
      items = items.filter((d) => d.tags.roles.some((r) => wanted.has(String(r))));
    }
    if (filter?.periods?.length) {
      const wanted = new Set(filter.periods.map((p) => p.trim()).filter(Boolean));
      items = items.filter((d) => d.tags.periods.some((p) => wanted.has(String(p).trim())));
    }
    if (filter?.iomTeacherUserId) {
      const id = filter.iomTeacherUserId.trim();
      items = items.filter((d) => d.folder.iomTeacherUserId === id);
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findById(id: string): StoredDocument | undefined {
    const d = this.all().find((x) => x.id === id);
    if (!d || d.inTrash) return undefined;
    return d;
  }

  findByIdIncludingTrash(id: string): StoredDocument | undefined {
    return this.all().find((d) => d.id === id);
  }

  /**
   * Регистрирует загруженный файл:
   * - перемещает temp-файл в `data/files/...`
   * - сохраняет метаданные в `data/documents.json`
   */
  createFromUpload(args: {
    tempPath: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdByUserId: string;
    tags?: unknown;
    folder?: unknown;
    sectionId?: string | null;
    folderId?: string | null;
    disciplineId?: string | null;
    isStandardizing?: boolean;
  }): StoredDocument {
    const id = randomUUID();
    const folder = normalizeFolder(args.folder);
    const tags = normalizeTagSet(args.tags);
    const storageRelPath = buildStorageRelPath({ folder, id, originalName: args.originalName });
    const absTarget = join(getDocumentsFilesRoot(), storageRelPath);
    ensureWithinRoot(absTarget);
    const dir = dirname(absTarget);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    renameSync(args.tempPath, absTarget);

    const doc: StoredDocument = {
      id,
      originalFileName: args.originalName,
      originalName: args.originalName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      storageRelPath,
      tags,
      folder,
      sectionId: typeof args.sectionId === "string" ? args.sectionId : null,
      folderId: typeof args.folderId === "string" ? args.folderId : null,
      disciplineId: typeof args.disciplineId === "string" ? args.disciplineId : null,
      isStandardizing: Boolean(args.isStandardizing),
      createdByUserId: args.createdByUserId,
      createdAt: new Date().toISOString(),
      currentVersionId: id,
      inTrash: false,
      trashedAt: null,
    };
    const next = [...this.all(), doc];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return doc;
  }

  /**
   * Создаёт документ из буфера (без temp-файла), например заготовки журнала.
   */
  createFromBuffer(args: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    createdByUserId: string;
    tags?: unknown;
    folder?: unknown;
    sectionId?: string | null;
    folderId?: string | null;
    disciplineId?: string | null;
    isStandardizing?: boolean;
  }): StoredDocument {
    const id = randomUUID();
    const folder = normalizeFolder(args.folder);
    const tags = normalizeTagSet(args.tags);
    const storageRelPath = buildStorageRelPath({ folder, id, originalName: args.originalName });
    const absTarget = join(getDocumentsFilesRoot(), storageRelPath);
    ensureWithinRoot(absTarget);
    const dir = dirname(absTarget);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(absTarget, args.buffer);

    const doc: StoredDocument = {
      id,
      originalFileName: args.originalName,
      originalName: args.originalName,
      mimeType: args.mimeType,
      sizeBytes: args.buffer.length,
      storageRelPath,
      tags,
      folder,
      sectionId: typeof args.sectionId === "string" ? args.sectionId : null,
      folderId: typeof args.folderId === "string" ? args.folderId : null,
      disciplineId: typeof args.disciplineId === "string" ? args.disciplineId : null,
      isStandardizing: Boolean(args.isStandardizing),
      createdByUserId: args.createdByUserId,
      createdAt: new Date().toISOString(),
      currentVersionId: id,
      inTrash: false,
      trashedAt: null,
    };
    const next = [...this.all(), doc];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return doc;
  }

  overwriteStoredFile(id: string, buffer: Buffer): StoredDocument {
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const abs = join(getDocumentsFilesRoot(), prev.storageRelPath);
    ensureWithinRoot(abs);
    writeFileSync(abs, buffer);
    const nextDoc: StoredDocument = {
      ...prev,
      sizeBytes: buffer.length,
    };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  /**
   * Заменяет файл на диске (в т.ч. другое расширение), сохраняя id документа.
   */
  replaceStoredFileFromUpload(id: string, args: {
    tempPath: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }): StoredDocument {
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const oldAbs = join(getDocumentsFilesRoot(), prev.storageRelPath);
    ensureWithinRoot(oldAbs);
    try {
      rmSync(oldAbs, { force: true });
    } catch {
      // ignore
    }

    const folder = prev.folder;
    const storageRelPath = buildStorageRelPath({ folder, id: prev.id, originalName: args.originalName });
    const absTarget = join(getDocumentsFilesRoot(), storageRelPath);
    ensureWithinRoot(absTarget);
    const dir = dirname(absTarget);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    renameSync(args.tempPath, absTarget);

    const nextDoc: StoredDocument = {
      ...prev,
      originalFileName: args.originalName,
      originalName: args.originalName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      storageRelPath,
    };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  replaceStoredFileFromBuffer(
    id: string,
    args: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      createdByUserId?: string;
      createdAt?: string;
    },
  ): StoredDocument {
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const oldAbs = join(getDocumentsFilesRoot(), prev.storageRelPath);
    ensureWithinRoot(oldAbs);
    try {
      rmSync(oldAbs, { force: true });
    } catch {
      // ignore
    }

    const storageRelPath = buildStorageRelPath({ folder: prev.folder, id: prev.id, originalName: args.originalName });
    const absTarget = join(getDocumentsFilesRoot(), storageRelPath);
    ensureWithinRoot(absTarget);
    const dir = dirname(absTarget);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(absTarget, args.buffer);

    const nextDoc: StoredDocument = {
      ...prev,
      originalFileName: args.originalName,
      originalName: args.originalName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      storageRelPath,
      createdByUserId: args.createdByUserId ?? prev.createdByUserId,
      createdAt: args.createdAt ?? new Date().toISOString(),
    };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  setCurrentVersionId(id: string, currentVersionId: string): StoredDocument {
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const nextDoc: StoredDocument = { ...prev, currentVersionId };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  updateAuditFields(id: string, args: { createdByUserId?: string; createdAt?: string }): StoredDocument {
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const nextDoc: StoredDocument = {
      ...prev,
      createdByUserId: args.createdByUserId ?? prev.createdByUserId,
      createdAt: args.createdAt ?? prev.createdAt,
    };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  updateMeta(id: string, patch: {
    tags?: unknown;
    folder?: unknown;
    sectionId?: string | null;
    folderId?: string | null;
    disciplineId?: string | null;
    isStandardizing?: boolean;
    inTrash?: boolean;
    trashedAt?: string | null;
  }): StoredDocument {
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const nextDoc: StoredDocument = {
      ...prev,
      tags: patch.tags != null ? normalizeTagSet(patch.tags) : prev.tags,
      folder: patch.folder != null ? normalizeFolder(patch.folder) : prev.folder,
      sectionId: patch.sectionId !== undefined ? (patch.sectionId ?? null) : prev.sectionId ?? null,
      folderId: patch.folderId !== undefined ? (patch.folderId ?? null) : prev.folderId ?? null,
      disciplineId: patch.disciplineId !== undefined ? patch.disciplineId ?? null : prev.disciplineId ?? null,
      isStandardizing: patch.isStandardizing !== undefined ? Boolean(patch.isStandardizing) : Boolean(prev.isStandardizing),
      inTrash: patch.inTrash !== undefined ? Boolean(patch.inTrash) : Boolean(prev.inTrash),
      trashedAt: patch.trashedAt !== undefined ? patch.trashedAt : prev.trashedAt ?? null,
    };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  moveToTrash(id: string): StoredDocument {
    return this.updateMeta(id, { inTrash: true, trashedAt: new Date().toISOString() });
  }

  restoreFromTrash(id: string): StoredDocument {
    return this.updateMeta(id, { inTrash: false, trashedAt: null });
  }

  delete(id: string): { ok: true } {
    const current = this.all();
    const doc = current.find((d) => d.id === id);
    if (!doc) throw new Error("NOT_FOUND");
    const abs = join(getDocumentsFilesRoot(), doc.storageRelPath);
    ensureWithinRoot(abs);
    try {
      rmSync(abs, { force: true });
    } catch {
      // ignore
    }
    const next = current.filter((d) => d.id !== id);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return { ok: true };
  }

  /** Переименование файла (и пути в хранилище) с сохранением id. */
  renameOriginal(id: string, newOriginalName: string): StoredDocument {
    const name = String(newOriginalName ?? "").trim();
    if (!name) throw new Error("NAME_REQUIRED");
    const current = this.all();
    const idx = current.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("NOT_FOUND");
    const prev = current[idx]!;
    const oldAbs = join(getDocumentsFilesRoot(), prev.storageRelPath);
    ensureWithinRoot(oldAbs);
    const newRel = buildStorageRelPath({ folder: prev.folder, id: prev.id, originalName: name });
    const newAbs = join(getDocumentsFilesRoot(), newRel);
    ensureWithinRoot(newAbs);
    const dir = dirname(newAbs);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    renameSync(oldAbs, newAbs);
    const nextDoc: StoredDocument = { ...prev, originalFileName: name, originalName: name, storageRelPath: newRel };
    const next = [...current.slice(0, idx), nextDoc, ...current.slice(idx + 1)];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextDoc;
  }

  /**
   * Копия файла и новая запись (для маршрутов выгрузки и «Копировать» в UI).
   */
  duplicateDocument(sourceId: string, args: {
    sectionId?: string | null;
    folderId?: string | null;
    createdByUserId: string;
    tags?: DocumentTagSet;
    folder?: DocumentFolder;
  }): StoredDocument {
    const prev = this.all().find((d) => d.id === sourceId);
    if (!prev) throw new Error("NOT_FOUND");
    const srcAbs = join(getDocumentsFilesRoot(), prev.storageRelPath);
    ensureWithinRoot(srcAbs);
    const buf = readFileSync(srcAbs);
    const folder = args.folder ?? prev.folder;
    const tags = args.tags ?? { ...prev.tags, periods: [...prev.tags.periods] };
    return this.createFromBuffer({
      buffer: buf,
      originalName: prev.originalName,
      mimeType: prev.mimeType,
      createdByUserId: args.createdByUserId,
      tags,
      folder,
      sectionId: args.sectionId !== undefined ? args.sectionId : prev.sectionId ?? null,
      folderId: args.folderId !== undefined ? args.folderId : prev.folderId ?? null,
      disciplineId: null,
      isStandardizing: false,
    });
  }

  moveDocuments(documentIds: string[], target: {
    sectionId?: string | null;
    folderId?: string | null;
    disciplineId?: string | null;
    isStandardizing?: boolean;
  }): StoredDocument[] {
    const ids = new Set(documentIds);
    const current = this.all();
    const next = current.map((doc) =>
      ids.has(doc.id)
        ? {
            ...doc,
            sectionId: target.sectionId ?? doc.sectionId ?? null,
            folderId: target.folderId ?? null,
            disciplineId: target.disciplineId !== undefined ? target.disciplineId ?? null : doc.disciplineId ?? null,
            isStandardizing: target.isStandardizing !== undefined ? Boolean(target.isStandardizing) : Boolean(doc.isStandardizing),
          }
        : doc,
    );
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return next.filter((d) => ids.has(d.id));
  }

  /** Все документы (для дерева документов, включая «корень» без sectionId/folderId). */
  listAll(opts?: { includeTrashed?: boolean }): StoredDocument[] {
    let rows = [...this.all()];
    if (!opts?.includeTrashed) rows = this.visible(rows);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listTrashed(): StoredDocument[] {
    return this.all()
      .filter((d) => d.inTrash)
      .sort((a, b) => (b.trashedAt ?? "").localeCompare(a.trashedAt ?? ""));
  }

  deleteByIds(ids: string[]): void {
    const idSet = new Set(ids);
    for (const id of idSet) {
      try {
        this.delete(id);
      } catch {
        // already gone
      }
    }
  }

  deleteWhere(predicate: (d: StoredDocument) => boolean): string[] {
    const toRemove = this.all().filter(predicate).map((d) => d.id);
    this.deleteByIds(toRemove);
    return toRemove;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const documentStore = new DocumentStore();

