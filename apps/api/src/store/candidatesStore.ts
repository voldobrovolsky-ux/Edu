import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateApplication, CandidateFileCategory, CandidateFileMeta, CandidateStored, CandidateStatus } from "../types/candidates.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "candidates.json");

function nowIso(): string {
  return new Date().toISOString();
}

class CandidatesStore {
  private cache: CandidateStored[] | null = null;

  private all(): CandidateStored[] {
    if (!this.cache) {
      this.cache = readJsonArrayFile<CandidateStored>(DATA_PATH).map((c) => ({
        candidateId: String((c as CandidateStored).candidateId),
        status: ((c as CandidateStored).status ?? "invited") as CandidateStatus,
        createdAt: String((c as CandidateStored).createdAt ?? nowIso()),
        updatedAt: String((c as CandidateStored).updatedAt ?? nowIso()),
        submittedAt: (c as CandidateStored).submittedAt ?? null,
        application: (c as CandidateStored).application ?? null,
        files: Array.isArray((c as CandidateStored).files) ? (c as CandidateStored).files : [],
        analytics: (c as CandidateStored).analytics ?? null,
      }));
    }
    return this.cache;
  }

  private write(next: CandidateStored[]): void {
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  invalidateCache(): void {
    this.cache = null;
  }

  list(): CandidateStored[] {
    return [...this.all()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  findById(candidateId: string): CandidateStored | undefined {
    return this.all().find((c) => c.candidateId === candidateId);
  }

  deleteById(candidateId: string): boolean {
    const all = this.all();
    const next = all.filter((c) => c.candidateId !== candidateId);
    if (next.length === all.length) return false;
    this.write(next);
    return true;
  }

  createInvited(): { candidate: CandidateStored; candidateId: string } {
    const candidateId = randomUUID();
    const candidate: CandidateStored = {
      candidateId,
      status: "invited",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      submittedAt: null,
      application: null,
      files: [],
      analytics: null,
    };
    const next = [...this.all(), candidate];
    this.write(next);
    return { candidate, candidateId };
  }

  upsertApplication(args: {
    candidateId: string;
    application: CandidateApplication;
    submittedAt?: string;
    files: Array<Omit<CandidateFileMeta, "id" | "createdAt">> & { id?: never; createdAt?: never };
  }): CandidateStored | undefined {
    const all = this.all();
    const idx = all.findIndex((c) => c.candidateId === args.candidateId);
    if (idx < 0) return undefined;

    const existing = all[idx]!;
    const files: CandidateFileMeta[] = args.files.map((f) => ({
      id: randomUUID(),
      createdAt: nowIso(),
      candidateId: args.candidateId,
      category: f.category as CandidateFileCategory,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      storageRelPath: f.storageRelPath,
    }));

    const nextCandidate: CandidateStored = {
      ...existing,
      status: "submitted",
      application: args.application,
      submittedAt: args.submittedAt ?? nowIso(),
      files,
      analytics: existing.analytics ?? null,
      updatedAt: nowIso(),
    };

    const next = [...all];
    next[idx] = nextCandidate;
    this.write(next);
    return nextCandidate;
  }

  updateById(candidateId: string, patch: Partial<Omit<CandidateStored, "candidateId" | "createdAt">>): CandidateStored | undefined {
    const all = this.all();
    const idx = all.findIndex((c) => c.candidateId === candidateId);
    if (idx < 0) return undefined;
    const nextCandidate: CandidateStored = {
      ...all[idx]!,
      ...patch,
      candidateId,
      createdAt: all[idx]!.createdAt,
      updatedAt: nowIso(),
    };
    const next = [...all];
    next[idx] = nextCandidate;
    this.write(next);
    return nextCandidate;
  }
}

export const candidatesStore = new CandidatesStore();

