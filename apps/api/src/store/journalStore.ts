import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JournalLessonMeta, JournalLessonStudentMark } from "../types/journal.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const META_PATH = join(__dirname, "..", "..", "data", "journalLessonMeta.json");
const MARKS_PATH = join(__dirname, "..", "..", "data", "journalLessonMarks.json");

class JournalStore {
  private metaCache: JournalLessonMeta[] | null = null;
  private marksCache: JournalLessonStudentMark[] | null = null;

  private metaAll(): JournalLessonMeta[] {
    if (!this.metaCache) this.metaCache = readJsonArrayFile<JournalLessonMeta>(META_PATH);
    return this.metaCache;
  }

  private marksAll(): JournalLessonStudentMark[] {
    if (!this.marksCache) this.marksCache = readJsonArrayFile<JournalLessonStudentMark>(MARKS_PATH);
    return this.marksCache;
  }

  getMetaByLessonIds(lessonIds: string[]): JournalLessonMeta[] {
    const set = new Set(lessonIds);
    return this.metaAll().filter((m) => set.has(m.timetableLessonId));
  }

  upsertLessonMeta(args: {
    timetableLessonId: string;
    topic?: string;
    attachedDocumentIds?: string[];
    journalLessonTypeId?: string | null;
  }): JournalLessonMeta {
    const current = this.metaAll();
    const idx = current.findIndex((m) => m.timetableLessonId === args.timetableLessonId);
    const now = new Date().toISOString();
    const existing = idx >= 0 ? current[idx]! : null;

    const journalLessonTypeId =
      args.journalLessonTypeId !== undefined
        ? args.journalLessonTypeId == null || args.journalLessonTypeId === ""
          ? null
          : String(args.journalLessonTypeId)
        : (existing?.journalLessonTypeId ?? null);

    const next: JournalLessonMeta = {
      id: existing?.id ?? randomUUID(),
      timetableLessonId: args.timetableLessonId,
      topic: args.topic != null ? String(args.topic) : existing?.topic ?? "",
      attachedDocumentIds:
        args.attachedDocumentIds != null ? [...args.attachedDocumentIds] : existing?.attachedDocumentIds ?? [],
      journalLessonTypeId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const updated = idx >= 0 ? current.map((m, i) => (i === idx ? next : m)) : [...current, next];
    this.metaCache = updated;
    writeJsonArrayFile(META_PATH, updated);
    return next;
  }

  getMarksByLessonIds(lessonIds: string[]): JournalLessonStudentMark[] {
    const set = new Set(lessonIds);
    return this.marksAll().filter((m) => set.has(m.timetableLessonId));
  }

  upsertStudentMark(args: {
    timetableLessonId: string;
    studentUserId: string;
    mark?: number | null;
    absent?: boolean;
  }): JournalLessonStudentMark {
    const current = this.marksAll();
    const idx = current.findIndex(
      (m) => m.timetableLessonId === args.timetableLessonId && m.studentUserId === args.studentUserId,
    );
    const now = new Date().toISOString();
    const existing = idx >= 0 ? current[idx]! : null;

    const absent = args.absent != null ? Boolean(args.absent) : existing?.absent ?? false;
    const mark = absent ? null : args.mark !== undefined ? args.mark : existing?.mark ?? null;

    const next: JournalLessonStudentMark = {
      id: existing?.id ?? randomUUID(),
      timetableLessonId: args.timetableLessonId,
      studentUserId: args.studentUserId,
      mark,
      absent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const updated = idx >= 0 ? current.map((m, i) => (i === idx ? next : m)) : [...current, next];
    this.marksCache = updated;
    writeJsonArrayFile(MARKS_PATH, updated);
    return next;
  }

  invalidateCache(): void {
    this.metaCache = null;
    this.marksCache = null;
  }
}

export const journalStore = new JournalStore();

