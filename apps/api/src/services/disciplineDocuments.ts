import type { StoredDocument } from "../types/documents.js";
import type { Discipline } from "../types/school.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { documentSectionStore } from "../store/documentSectionStore.js";
import { documentFolderTreeStore, type DocumentTreeFolder } from "../store/documentFolderTreeStore.js";

export const DISCIPLINES_SECTION_NAME = "Дисциплины";

export function ensureDisciplinesSection() {
  return documentSectionStore.findByName(DISCIPLINES_SECTION_NAME) ?? documentSectionStore.create(DISCIPLINES_SECTION_NAME, "system");
}

/** Для всех сущностей MATEM1/MATEM3/… одной линейки — корень «Дисциплины / Название» и подпапки «Название N класс». */
export function ensureAllDisciplineFoldersForBase(baseCode: string): void {
  for (const d of disciplineStore.list().filter((x) => x.baseCode === baseCode)) {
    ensureDisciplineFolder(d);
  }
}

export function ensureDisciplineFolder(discipline: Discipline): DocumentTreeFolder {
  const section = ensureDisciplinesSection();
  const rootName = discipline.name;
  const className = `${discipline.name} ${discipline.grade} класс`;

  const rootExistingById = discipline.rootFolderId ? documentFolderTreeStore.findById(discipline.rootFolderId) : undefined;
  const rootExistingByLegacyDocumentFolder =
    discipline.documentFolderId != null ? documentFolderTreeStore.findById(discipline.documentFolderId) : undefined;

  function isValidRootFolder(folder: DocumentTreeFolder | undefined | null): boolean {
    if (!folder) return false;
    if (folder.sectionId !== section.id) return false;
    if (folder.parentFolderId !== null) return false;
    if (folder.name !== rootName) return false;
    return true;
  }

  let rootFolder: DocumentTreeFolder | undefined = undefined;
  if (isValidRootFolder(rootExistingById)) rootFolder = rootExistingById!;
  if (!rootFolder && isValidRootFolder(rootExistingByLegacyDocumentFolder)) rootFolder = rootExistingByLegacyDocumentFolder!;

  if (!rootFolder) {
    const candidates = documentFolderTreeStore
      .list()
      .filter((f) => f.sectionId === section.id && f.parentFolderId === null && f.name === rootName && f.disciplineId);

    const disciplineIdsInBase = new Set(
      disciplineStore
        .list()
        .filter((d) => d.baseCode === discipline.baseCode)
        .map((d) => d.id),
    );

    rootFolder =
      candidates.find((f) => (f.disciplineId ? disciplineIdsInBase.has(f.disciplineId) : false)) ??
      candidates[0] ??
      undefined;
  }

  if (!rootFolder) {
    rootFolder = documentFolderTreeStore.create({
      name: rootName,
      sectionId: section.id,
      parentFolderId: null,
      disciplineId: discipline.id,
      ownerUserId: section.ownerUserId ?? "system",
    });
  }

  // class folder
  let classFolder: DocumentTreeFolder | undefined = undefined;
  const classExistingById = discipline.classFolderId ? documentFolderTreeStore.findById(discipline.classFolderId) : undefined;
  if (classExistingById && classExistingById.sectionId === section.id && classExistingById.parentFolderId === rootFolder.id) {
    classFolder = classExistingById;
  }

  if (!classFolder) {
    const candidates = documentFolderTreeStore
      .list()
      .filter((f) => f.sectionId === section.id && f.parentFolderId === rootFolder.id && f.name === className);
    classFolder =
      candidates.find((f) => (f.disciplineId ?? null) === discipline.id) ?? candidates[0] ?? undefined;
  }

  if (!classFolder) {
    classFolder = documentFolderTreeStore.create({
      name: className,
      sectionId: section.id,
      parentFolderId: rootFolder.id,
      disciplineId: discipline.id,
      ownerUserId: section.ownerUserId ?? "system",
    });
  }

  // Store links in discipline entities (MATEM1.. => same rootFolderId)
  disciplineStore.updateByCode(discipline.code, {
    rootFolderId: rootFolder.id,
    classFolderId: classFolder.id,
    // legacy alias: old UI used `documentFolderId` as root.
    documentFolderId: rootFolder.id,
  });

  return rootFolder;
}

export function getDisciplineFolder(disciplineCode: string): DocumentTreeFolder | null {
  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) return null;
  return ensureDisciplineFolder(discipline);
}

export function getDisciplineRootFolderIdForDocument(document: StoredDocument): string | null {
  if (!document.disciplineId) return null;
  const discipline = disciplineStore.list().find((item) => item.id === document.disciplineId);
  if (!discipline) return null;
  return ensureDisciplineFolder(discipline).id;
}

export function isFolderInsideRoot(args: { folderId: string | null; rootFolderId: string }): boolean {
  if (!args.folderId) return false;
  const subtree = documentFolderTreeStore.collectDescendants([args.rootFolderId]);
  return subtree.has(args.folderId);
}
