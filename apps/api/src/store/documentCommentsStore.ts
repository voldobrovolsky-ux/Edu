import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentComment } from "../types/documents.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "documentComments.json");

function readAll(): DocumentComment[] {
  return readJsonArrayFile<DocumentComment>(DATA_PATH);
}

function writeAll(items: DocumentComment[]): void {
  writeJsonArrayFile(DATA_PATH, items);
}

export function listCommentsByDocumentId(documentId: string): DocumentComment[] {
  return readAll()
    .filter((c) => c.documentId === documentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addComment(args: { documentId: string; authorId: string; body: string; createdAt?: string }): DocumentComment {
  const items = readAll();
  const comment: DocumentComment = {
    id: randomUUID(),
    documentId: args.documentId,
    authorId: args.authorId,
    body: String(args.body ?? "").trim(),
    createdAt: args.createdAt ?? new Date().toISOString(),
  };
  if (!comment.body) throw new Error("BODY_REQUIRED");
  writeAll(items.concat([comment]));
  return comment;
}

export function deleteCommentsByDocumentId(documentId: string): void {
  const items = readAll();
  const keep = items.filter((c) => c.documentId !== documentId);
  writeAll(keep);
}

