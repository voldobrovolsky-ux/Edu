import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentBinding } from "../types/documents.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "documentBindings.json");

export type StoredDocumentBinding = DocumentBinding & {
  id: string;
  documentId: string;
  createdAt: string;
  createdByUserId?: string;
};

function readAll(): StoredDocumentBinding[] {
  return readJsonArrayFile<StoredDocumentBinding>(DATA_PATH);
}

function writeAll(items: StoredDocumentBinding[]): void {
  writeJsonArrayFile(DATA_PATH, items);
}

export function listBindingsByDocumentId(documentId: string): StoredDocumentBinding[] {
  return readAll()
    .filter((b) => b.documentId === documentId)
    .sort((a, b) => a.type.localeCompare(b.type) || a.refId.localeCompare(b.refId));
}

export function addBinding(args: { documentId: string; binding: DocumentBinding; createdByUserId?: string }): StoredDocumentBinding {
  const items = readAll();
  const norm: DocumentBinding = {
    type: String(args.binding.type ?? "").trim(),
    refId: String(args.binding.refId ?? "").trim(),
  };
  if (!norm.type || !norm.refId) throw new Error("BINDING_REQUIRED");
  const already = items.some((x) => x.documentId === args.documentId && x.type === norm.type && x.refId === norm.refId);
  if (already) {
    return items.find((x) => x.documentId === args.documentId && x.type === norm.type && x.refId === norm.refId)!;
  }
  const binding: StoredDocumentBinding = {
    id: randomUUID(),
    documentId: args.documentId,
    type: norm.type,
    refId: norm.refId,
    createdAt: new Date().toISOString(),
    createdByUserId: args.createdByUserId,
  };
  writeAll(items.concat([binding]));
  return binding;
}

export function deleteBinding(args: { documentId: string; bindingId: string }): void {
  const items = readAll();
  writeAll(items.filter((b) => !(b.documentId === args.documentId && b.id === args.bindingId)));
}

export function deleteBindingsByDocumentId(documentId: string): void {
  writeAll(readAll().filter((b) => b.documentId !== documentId));
}

