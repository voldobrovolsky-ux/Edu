import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentationRevisionPayload, JournalRevisionPayload, RevisionJob, RevisionJobKind } from "../types/revisionJobs.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "revisionJobs.json");

class RevisionJobStore {
  private cache: RevisionJob[] | null = null;

  private all(): RevisionJob[] {
    if (!this.cache) this.cache = readJsonArrayFile<RevisionJob>(DATA_PATH);
    return this.cache;
  }

  private save(rows: RevisionJob[]): void {
    this.cache = rows;
    writeJsonArrayFile(DATA_PATH, rows);
  }

  list(): RevisionJob[] {
    return [...this.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(args: {
    kind: RevisionJobKind;
    scheduledAt: string;
    createdByUserId: string;
    payload: DocumentationRevisionPayload | JournalRevisionPayload;
  }): RevisionJob {
    const now = new Date().toISOString();
    const job: RevisionJob = {
      id: randomUUID(),
      kind: args.kind,
      status: "pending",
      createdAt: now,
      scheduledAt: args.scheduledAt,
      createdByUserId: args.createdByUserId,
      payload: args.payload,
    };
    const next = [...this.all(), job];
    this.save(next);
    return job;
  }

  listDuePending(nowIso: string): RevisionJob[] {
    return this.all().filter((j) => j.status === "pending" && j.scheduledAt <= nowIso);
  }

  updateStatus(
    id: string,
    patch: Partial<Pick<RevisionJob, "status" | "errorMessage" | "finishedAt">>,
  ): RevisionJob | null {
    const rows = this.all();
    const idx = rows.findIndex((j) => j.id === id);
    if (idx < 0) return null;
    const next = { ...rows[idx]!, ...patch };
    rows[idx] = next;
    this.save(rows);
    return next;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const revisionJobStore = new RevisionJobStore();
