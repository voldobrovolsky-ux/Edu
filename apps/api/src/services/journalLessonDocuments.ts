import { extname } from "node:path";
import type { DocumentTagSet } from "../types/documents.js";
import type { Discipline } from "../types/school.js";
import type { TimetableLesson } from "../types/timetable.js";
import { emptyTagSet } from "../types/documents.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { documentFolderTreeStore, type DocumentTreeFolder } from "../store/documentFolderTreeStore.js";
import { documentStore } from "../store/documentStore.js";
import { journalDocumentTypeStore } from "../store/journalDocumentTypeStore.js";
import { journalStore } from "../store/journalStore.js";
import { ensureDisciplineFolder, ensureDisciplinesSection } from "./disciplineDocuments.js";
import { applyUploadDocumentFanout } from "./documentUploadFanout.js";

const MONTHS_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export function formatRuLessonDateFolder(iso: string): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  if (m < 1 || m > 12) return iso;
  return `${d} ${MONTHS_RU[m - 1]!} ${y}`;
}

export function buildJournalLessonLinkToken(args: {
  timetableLessonId: string;
  journalDocumentTypeId: string;
  groupNumber: number | null;
}): string {
  const g = args.groupNumber == null ? "all" : String(args.groupNumber);
  return `jl:${args.timetableLessonId}:${args.journalDocumentTypeId}:g${g}`;
}

export function buildJournalFileDisplayBaseName(args: {
  typeName: string;
  dateIso: string;
  groupNumber: number | null;
}): string {
  const [y, m, d] = args.dateIso.split("-").map(Number);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const datePart = `${dd}.${mm}`;
  const groupPart = args.groupNumber != null ? ` ${args.groupNumber} группа` : "";
  return `${args.typeName.trim()}${groupPart} за ${datePart}`;
}

export function ensureLessonDateFolder(args: {
  classFolderId: string;
  dateIso: string;
  disciplineId: string;
}): DocumentTreeFolder {
  const classFolder = documentFolderTreeStore.findById(args.classFolderId);
  if (!classFolder) throw new Error("CLASS_FOLDER_NOT_FOUND");

  const name = formatRuLessonDateFolder(args.dateIso);
  const siblings = documentFolderTreeStore
    .list()
    .filter((f) => f.parentFolderId === args.classFolderId && f.name === name);
  const existing =
    siblings.find((f) => (f.disciplineId ?? null) === args.disciplineId) ?? siblings[0] ?? undefined;
  if (existing) return existing;

  return documentFolderTreeStore.create({
    name,
    sectionId: classFolder.sectionId,
    parentFolderId: args.classFolderId,
    disciplineId: args.disciplineId,
    ownerUserId: classFolder.ownerUserId ?? "system",
  });
}

function findExistingJournalDoc(linkToken: string) {
  for (const doc of documentStore.listAll()) {
    if (doc.tags.periods.includes(linkToken)) return doc;
  }
  return undefined;
}

export function uploadOrReplaceJournalLessonDocument(args: {
  discipline: Discipline;
  lesson: TimetableLesson;
  journalDocumentTypeId: string;
  createdByUserId: string;
  tempPath: string;
  uploadedOriginalName: string;
  mimeType: string;
  sizeBytes: number;
}): { documentId: string; meta: ReturnType<typeof journalStore.upsertLessonMeta> } {
  const jt = journalDocumentTypeStore.findById(args.journalDocumentTypeId);
  if (!jt) throw new Error("JOURNAL_DOC_TYPE_NOT_FOUND");

  ensureDisciplineFolder(args.discipline);
  const discipline = disciplineStore.findByCode(args.discipline.code);
  if (!discipline) throw new Error("DISCIPLINE_NOT_FOUND");
  if (!discipline.classFolderId) throw new Error("DISCIPLINE_CLASS_FOLDER_MISSING");

  const dateFolder = ensureLessonDateFolder({
    classFolderId: discipline.classFolderId,
    dateIso: args.lesson.date,
    disciplineId: discipline.id,
  });

  const groupNumber = args.lesson.groupNumber ?? null;
  const linkToken = buildJournalLessonLinkToken({
    timetableLessonId: args.lesson.id,
    journalDocumentTypeId: args.journalDocumentTypeId,
    groupNumber,
  });

  const ext = extname(args.uploadedOriginalName);
  const baseDisplayName = buildJournalFileDisplayBaseName({
    typeName: jt.name,
    dateIso: args.lesson.date,
    groupNumber,
  });
  const originalName = ext ? `${baseDisplayName}${ext}` : baseDisplayName;

  const section = ensureDisciplinesSection();
  const tags: DocumentTagSet = {
    ...emptyTagSet(),
    disciplineCodes: [discipline.code],
    grades: [discipline.grade],
    periods: [args.journalDocumentTypeId, linkToken],
    journalTrace: {
      disciplineCode: discipline.code,
      timetableLessonId: args.lesson.id,
      lessonDateIso: args.lesson.date,
      journalDocumentTypeId: args.journalDocumentTypeId,
    },
  };

  const folderMeta = {
    schoolId: "school-1",
    officeSection: "document_archive",
    disciplineCode: discipline.code,
    grade: discipline.grade,
  };

  const existing = findExistingJournalDoc(linkToken);
  let docId: string;

  if (existing) {
    documentStore.replaceStoredFileFromUpload(existing.id, {
      tempPath: args.tempPath,
      originalName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
    });
    documentStore.updateMeta(existing.id, {
      tags,
      sectionId: section.id,
      folder: folderMeta,
      folderId: dateFolder.id,
      disciplineId: discipline.id,
    });
    docId = existing.id;
  } else {
    const created = documentStore.createFromUpload({
      tempPath: args.tempPath,
      originalName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      createdByUserId: args.createdByUserId,
      tags,
      sectionId: section.id,
      folderId: dateFolder.id,
      disciplineId: discipline.id,
      folder: folderMeta,
    });
    docId = created.id;
  }

  const metaRow = journalStore.getMetaByLessonIds([args.lesson.id])[0];
  const prevIds = metaRow?.attachedDocumentIds ?? [];
  const nextIds = prevIds.includes(docId) ? prevIds : [...prevIds, docId];
  const meta = journalStore.upsertLessonMeta({
    timetableLessonId: args.lesson.id,
    attachedDocumentIds: nextIds,
  });

  applyUploadDocumentFanout({
    source: "journal_lesson",
    primaryDocumentId: docId,
    createdByUserId: args.createdByUserId,
  });

  return { documentId: docId, meta };
}

export function isDocumentAllowedForJournalLesson(args: {
  docId: string;
  discipline: Discipline;
}): boolean {
  if (args.discipline.documents.some((d) => d.id === args.docId)) return true;
  const doc = documentStore.findById(args.docId);
  if (!doc || !args.discipline.classFolderId) return false;
  const subtree = documentFolderTreeStore.collectDescendants([args.discipline.classFolderId]);
  return doc.folderId ? subtree.has(doc.folderId) : false;
}
