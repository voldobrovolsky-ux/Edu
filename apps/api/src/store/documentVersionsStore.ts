import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentVersion } from "../types/documents.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "documentVersions.json");
const FILES_ROOT = join(__dirname, "..", "..", "data", "files");

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
  if (base === "." || base === "..") return "file";
  return base;
}

function ensureWithinRoot(absPath: string): void {
  const root = normalize(FILES_ROOT + sep);
  const target = normalize(absPath);
  if (!target.startsWith(root)) throw new Error("INVALID_PATH");
}

function buildVersionStorageRelPath(args: { documentId: string; versionId: string; originalName: string }): string {
  const docSeg = safePathSegment(args.documentId);
  const name = safeFileName(args.originalName);
  const file = `${args.versionId}__${name}`;
  return join("versions", docSeg, file).split("\\").join("/");
}

function absFromRel(storageRelPath: string): string {
  return join(FILES_ROOT, storageRelPath);
}

function readAll(): DocumentVersion[] {
  const items = readJsonArrayFile<DocumentVersion>(DATA_PATH);
  // normalize possible missing fields
  return items.map((v) => ({
    ...v,
    comment: v.comment,
    createdAt: v.createdAt,
    createdByUserId: v.createdByUserId,
    sizeBytes: v.sizeBytes,
    mimeType: v.mimeType,
    originalName: v.originalName,
    storageRelPath: v.storageRelPath,
    isCurrent: Boolean(v.isCurrent),
  }));
}

function writeAll(items: DocumentVersion[]): void {
  writeJsonArrayFile(DATA_PATH, items);
}

export function listVersionsByDocumentId(documentId: string): DocumentVersion[] {
  return readAll()
    .filter((v) => v.documentId === documentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findVersionById(versionId: string): DocumentVersion | undefined {
  return readAll().find((v) => v.id === versionId);
}

export function setCurrentVersionForDocument(documentId: string, versionId: string): void {
  const items = readAll();
  const next = items.map((v) => (v.documentId === documentId ? { ...v, isCurrent: v.id === versionId } : v));
  writeAll(next);
}

export function createDocumentVersion(args: {
  documentId: string;
  createdByUserId: string;
  comment?: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt?: string;
}): DocumentVersion {
  if (!existsSync(FILES_ROOT)) mkdirSync(FILES_ROOT, { recursive: true });
  const versionId = randomUUID();
  const createdAt = args.createdAt ?? new Date().toISOString();
  const storageRelPath = buildVersionStorageRelPath({
    documentId: args.documentId,
    versionId,
    originalName: args.originalName,
  });
  const absTarget = absFromRel(storageRelPath);
  ensureWithinRoot(absTarget);
  const dir = dirname(absTarget);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(absTarget, args.buffer);

  const version: DocumentVersion = {
    id: versionId,
    documentId: args.documentId,
    createdAt,
    createdByUserId: args.createdByUserId,
    comment: args.comment ? String(args.comment).trim() || undefined : undefined,
    sizeBytes: args.sizeBytes,
    mimeType: args.mimeType,
    originalName: args.originalName,
    storageRelPath,
    isCurrent: true,
  };

  const items = readAll();
  const next = items
    .map((v) => (v.documentId === args.documentId ? { ...v, isCurrent: false } : v))
    .concat([version]);
  writeAll(next);
  return version;
}

export function deleteVersionsByDocumentId(documentId: string): void {
  const items = readAll();
  const toDelete = items.filter((v) => v.documentId === documentId);
  const keep = items.filter((v) => v.documentId !== documentId);

  for (const v of toDelete) {
    try {
      const abs = absFromRel(v.storageRelPath);
      ensureWithinRoot(abs);
      rmSync(abs, { force: true });
    } catch {
      // ignore
    }
  }
  writeAll(keep);
}

