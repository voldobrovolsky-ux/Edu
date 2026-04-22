import { documentFolderTreeStore } from "../store/documentFolderTreeStore.js";
import { documentSectionStore } from "../store/documentSectionStore.js";
import { documentStore } from "../store/documentStore.js";
import { userStore } from "../store/userStore.js";
import {
  uploadDocumentRoutesStore,
  type StoredUploadRoute,
  type UploadSourceId,
  type UploadTargetRef,
} from "../store/uploadDocumentRoutesStore.js";

function placementKey(sectionId: string | null, folderId: string | null): string {
  return `${sectionId ?? "∅"}|${folderId ?? "∅"}`;
}

function resolveTarget(t: UploadTargetRef): { sectionId: string | null; folderId: string | null } {
  if (t.type === "panel_loose") return { sectionId: null, folderId: null };
  if (t.type === "section_loose") {
    if (!documentSectionStore.findById(t.sectionId)) throw new Error("SECTION_NOT_FOUND");
    return { sectionId: t.sectionId, folderId: null };
  }
  const folder = documentFolderTreeStore.findById(t.folderId);
  if (!folder) throw new Error("FOLDER_NOT_FOUND");
  return { sectionId: folder.sectionId, folderId: folder.id };
}

export function validateUploadRoutes(routes: StoredUploadRoute[]): void {
  const seen = new Set<string>();
  for (const r of routes) {
    if (seen.has(r.source)) throw new Error("DUPLICATE_SOURCE");
    seen.add(r.source);
    for (const t of r.targets) resolveTarget(t);
  }
}

/**
 * После успешной загрузки основного документа — дубли в целевые места по настройкам маршрутов.
 */
export function applyUploadDocumentFanout(args: {
  source: UploadSourceId;
  primaryDocumentId: string;
  createdByUserId: string;
}): string[] {
  const primary = documentStore.findById(args.primaryDocumentId);
  if (!primary || primary.inTrash) return [];

  const viewer = userStore.findById(args.createdByUserId);
  const role = viewer?.primaryRole ?? null;
  const baseRoutes = uploadDocumentRoutesStore.loadBase();
  const personalRoutes = uploadDocumentRoutesStore.loadUser(args.createdByUserId, role, args.createdByUserId);
  const roleRoutes = uploadDocumentRoutesStore.loadUser(args.createdByUserId, role, null);
  const mergedRows = [...baseRoutes, ...roleRoutes, ...personalRoutes];
  const mergedTargetsRaw = mergedRows
    .filter((x) => x.source === args.source)
    .flatMap((x) => x.targets);
  const mergedTargets: UploadTargetRef[] = [];
  const seenTargetKeys = new Set<string>();
  for (const t of mergedTargetsRaw) {
    const k = JSON.stringify(t);
    if (seenTargetKeys.has(k)) continue;
    seenTargetKeys.add(k);
    mergedTargets.push(t);
  }
  if (!mergedTargets.length) return [];

  const primaryKey = placementKey(primary.sectionId ?? null, primary.folderId ?? null);
  const createdIds: string[] = [];

  for (const t of mergedTargets) {
    let placement: { sectionId: string | null; folderId: string | null };
    try {
      placement = resolveTarget(t);
    } catch {
      continue;
    }
    if (placementKey(placement.sectionId, placement.folderId) === primaryKey) continue;

    const dup = documentStore.duplicateDocument(args.primaryDocumentId, {
      sectionId: placement.sectionId,
      folderId: placement.folderId,
      createdByUserId: args.createdByUserId,
      folder: {
        schoolId: primary.folder.schoolId ?? "school-1",
        officeSection: primary.folder.officeSection,
        disciplineCode: primary.folder.disciplineCode,
        grade: primary.folder.grade,
      },
    });
    createdIds.push(dup.id);
  }

  return createdIds;
}
