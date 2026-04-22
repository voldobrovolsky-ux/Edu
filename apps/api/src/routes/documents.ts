import { Router } from "express";
import multer from "multer";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { documentStore } from "../store/documentStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { documentSectionStore } from "../store/documentSectionStore.js";
import { documentFolderTreeStore, type DocumentTreeFolder } from "../store/documentFolderTreeStore.js";
import { deleteVersionsByDocumentId, listVersionsByDocumentId, createDocumentVersion, findVersionById, setCurrentVersionForDocument } from "../store/documentVersionsStore.js";
import { addComment, listCommentsByDocumentId, deleteCommentsByDocumentId } from "../store/documentCommentsStore.js";
import { addBinding, deleteBinding, deleteBindingsByDocumentId, listBindingsByDocumentId } from "../store/documentBindingsStore.js";
import { ensureDisciplineFolder, ensureDisciplinesSection, getDisciplineRootFolderIdForDocument, isFolderInsideRoot } from "../services/disciplineDocuments.js";
import { applyUploadDocumentFanout, validateUploadRoutes } from "../services/documentUploadFanout.js";
import { parseUploadRoutesPayload, uploadDocumentRoutesStore } from "../store/uploadDocumentRoutesStore.js";
import { canAccessSchoolUserManagement, isSysAdminUser } from "../auth/viewerRoles.js";
import bcrypt from "bcryptjs";
import type { StoredDocument } from "../types/documents.js";

export const documentsRouter = Router();

function normalizeOriginalFileName(raw: string): string {
  const name = String(raw ?? "").trim();
  if (!name) return "file";
  try {
    const maybeUtf8 = Buffer.from(name, "latin1").toString("utf8");
    if (maybeUtf8.includes("�")) return name;
    return maybeUtf8;
  } catch {
    return name;
  }
}

function requireStaff(req: AuthedRequest): { userId: string; role: string } | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const user = userStore.findById(userId);
  if (!user) return null;
  if (
    user.primaryRole === "head_teacher" ||
    user.primaryRole === "teacher" ||
    user.primaryRole === "director" ||
    user.primaryRole === "sysadmin"
  ) {
    return { userId, role: user.primaryRole };
  }
  return null;
}

function requireUploader(req: AuthedRequest): { userId: string; role: string } | null {
  const staff = requireStaff(req);
  if (!staff) return null;
  if (staff.role === "teacher" || staff.role === "head_teacher" || staff.role === "director" || staff.role === "sysadmin")
    return staff;
  return null;
}

function canManageAnyDocument(staff: { role: string }): boolean {
  return staff.role === "head_teacher" || staff.role === "director" || staff.role === "sysadmin";
}

function getDocumentViewerContext(staff: { userId: string; role: string }) {
  const viewer = userStore.findById(staff.userId) ?? null;
  const sysAdmin = Boolean(viewer && isSysAdminUser(viewer));
  const foldersById = new Map(documentFolderTreeStore.list().map((f) => [f.id, f] as const));
  const viewerRoleSet = new Set<string>([
    viewer?.primaryRole ?? staff.role,
    ...(viewer?.secondaryRoles ?? []),
  ]);
  return { viewer, sysAdmin, foldersById, viewerRoleSet };
}

function canViewFolderWithContext(args: {
  folder: DocumentTreeFolder;
  staff: { userId: string; role: string };
  sysAdmin: boolean;
  foldersById: Map<string, DocumentTreeFolder>;
  viewerRoleSet: Set<string>;
}): boolean {
  const { folder, staff, sysAdmin, foldersById, viewerRoleSet } = args;
  if (sysAdmin) return true;
  if (folder.ownerUserId && folder.ownerUserId === staff.userId) return true;
  const access = deriveEffectiveAccessType({ folder, foldersById });
  if (access === "org") return true;
  if (access === "selected") {
    if ((folder.sharedWithUserIds ?? []).includes(staff.userId)) return true;
    if ((folder.sharedWithRoleIds ?? []).some((r) => viewerRoleSet.has(r))) return true;
  }
  return false;
}

function canViewDocumentWithContext(args: {
  document: StoredDocument;
  staff: { userId: string; role: string };
  sysAdmin: boolean;
  foldersById: Map<string, DocumentTreeFolder>;
  viewerRoleSet: Set<string>;
}): boolean {
  const { document, staff, sysAdmin, foldersById, viewerRoleSet } = args;
  if (sysAdmin) return true;
  if (document.createdByUserId === staff.userId) return true;
  if (document.folderId) {
    const folder = foldersById.get(document.folderId);
    if (!folder) return false;
    return canViewFolderWithContext({
      folder,
      staff,
      sysAdmin,
      foldersById,
      viewerRoleSet,
    });
  }
  if (document.sectionId) {
    const section = documentSectionStore.findById(document.sectionId);
    if (!section) return false;
    if (section.ownerUserId && section.ownerUserId === staff.userId) return true;
    return false;
  }
  return true;
}

function canManageDocumentWithContext(args: {
  document: StoredDocument;
  staff: { userId: string; role: string };
  sysAdmin: boolean;
}): boolean {
  const { document, staff, sysAdmin } = args;
  if (sysAdmin) return true;
  if (canManageAnyDocument(staff)) return true;
  return document.createdByUserId === staff.userId;
}

function canUseTargetDocumentLocation(args: {
  staff: { userId: string; role: string };
  sysAdmin: boolean;
  foldersById: Map<string, DocumentTreeFolder>;
  viewerRoleSet: Set<string>;
  targetFolderId: string | null;
  targetSectionId: string | null;
}): boolean {
  const { staff, sysAdmin, foldersById, viewerRoleSet, targetFolderId, targetSectionId } = args;
  if (sysAdmin || canManageAnyDocument(staff)) return true;
  if (targetFolderId) {
    const folder = foldersById.get(targetFolderId);
    if (!folder) return false;
    if (folder.ownerUserId && folder.ownerUserId === staff.userId) return true;
    return canViewFolderWithContext({
      folder,
      staff,
      sysAdmin,
      foldersById,
      viewerRoleSet,
    });
  }
  if (targetSectionId) {
    const section = documentSectionStore.findById(targetSectionId);
    if (!section) return false;
    return Boolean(section.ownerUserId && section.ownerUserId === staff.userId);
  }
  return true;
}

/** Настройка маршрутов выгрузки документов — только системный администратор. */
function requireUploadRoutesManager(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  if (!user) return false;
  // директор / завуч / системный администратор
  return canAccessSchoolUserManagement(user);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = join(__dirname, "..", "..", "data", "tmp");
if (!existsSync(TMP_ROOT)) mkdirSync(TMP_ROOT, { recursive: true });

const upload = multer({ dest: TMP_ROOT, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

function getDisciplinePlacement(disciplineCode: string) {
  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) throw new Error("DISCIPLINE_NOT_FOUND");
  const folder = ensureDisciplineFolder(discipline);
  const section = ensureDisciplinesSection();
  return {
    discipline,
    section,
    folder,
    folderMeta: {
      schoolId: "school-1",
      officeSection: "methospace",
      disciplineCode: discipline.code,
      grade: discipline.grade,
    },
    tags: {
      disciplineCodes: [discipline.code],
      grades: [discipline.grade],
      roles: [],
      periods: [],
    },
  };
}

function assertCanKeepDisciplineDocumentInFolder(documentId: string, targetFolderId: string | null): void {
  const existing = documentStore.findByIdIncludingTrash(documentId);
  if (!existing) throw new Error("NOT_FOUND");
  const rootFolderId = getDisciplineRootFolderIdForDocument(existing);
  if (!rootFolderId) return;
  if (!isFolderInsideRoot({ folderId: targetFolderId, rootFolderId })) {
    throw new Error("DISCIPLINE_DOCUMENT_MUST_STAY_IN_FOLDER");
  }
}

documentsRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const disciplineCode = typeof req.query.disciplineCode === "string" ? req.query.disciplineCode : undefined;
  const officeSection = typeof req.query.officeSection === "string" ? req.query.officeSection : undefined;
  const grade = req.query.grade != null ? Number(req.query.grade) : undefined;
  if (req.query.grade != null && !Number.isFinite(grade)) return res.status(400).json({ error: "INVALID_GRADE" });
  const rolesRaw = typeof req.query.roles === "string" ? req.query.roles : undefined;
  const periodsRaw = typeof req.query.periods === "string" ? req.query.periods : undefined;
  const iomTeacherUserIdRaw = typeof req.query.iomTeacherUserId === "string" ? req.query.iomTeacherUserId.trim() : "";
  if (iomTeacherUserIdRaw) {
    const viewerId = req.auth?.userId;
    const viewer = viewerId ? userStore.findById(viewerId) : null;
    if (!viewer || (viewer.id !== iomTeacherUserIdRaw && !canAccessSchoolUserManagement(viewer))) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
  }
  const roles = rolesRaw ? rolesRaw.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
  const periods = periodsRaw ? periodsRaw.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
  const { sysAdmin, foldersById, viewerRoleSet } = getDocumentViewerContext(staff);
  const documents = documentStore
    .list({
      disciplineCode,
      officeSection,
      grade,
      roles,
      periods,
      iomTeacherUserId: iomTeacherUserIdRaw || undefined,
    })
    .filter((document) =>
      canViewDocumentWithContext({
        document,
        staff,
        sysAdmin,
        foldersById,
        viewerRoleSet,
      }),
    );
  return res.json({
    documents,
  });
});

documentsRouter.get("/tree", requireAuth, (req: AuthedRequest, res) => {
  if (!requireStaff(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const staff = requireStaff(req)!;
  const viewer = userStore.findById(staff.userId) ?? null;
  const sysAdmin = Boolean(viewer && isSysAdminUser(viewer));

  const foldersAll = documentFolderTreeStore.list();
  const foldersById = new Map(foldersAll.map((f) => [f.id, f] as const));
  const viewerRoleSet = new Set<string>([
    viewer?.primaryRole ?? "",
    ...(viewer?.secondaryRoles ?? []),
  ]);

  function deriveAccessTypeForUi(folder: DocumentTreeFolder): "private" | "org" | "selected" {
    if (folder.accessType) return folder.accessType;
    // Исторические данные: если у записи нет owner'а, не ломаем существующую видимость.
    if (!folder.ownerUserId) return "org";
    if (folder.shared === true) return "org";
    if ((folder.sharedWithUserIds?.length ?? 0) > 0) return "selected";
    if ((folder.sharedWithRoleIds?.length ?? 0) > 0) return "selected";
    return "private";
  }

  function canViewFolder(folder: DocumentTreeFolder): boolean {
    if (sysAdmin) return true;
    if (folder.ownerUserId && folder.ownerUserId === staff.userId) return true;
    const access = deriveEffectiveAccessType({ folder, foldersById });
    if (access === "org") return true;
    if (access === "selected") {
      if ((folder.sharedWithUserIds ?? []).includes(staff.userId)) return true;
      if ((folder.sharedWithRoleIds ?? []).some((r) => viewerRoleSet.has(r))) return true;
      return false;
    }
    return false;
  }

  const allowedFolderIds = new Set<string>(foldersAll.filter((f) => canViewFolder(f)).map((f) => f.id));

  const sectionsAll = documentSectionStore.list();
  const allowedSectionIds = new Set<string>();
  for (const f of foldersAll) {
    if (!allowedFolderIds.has(f.id)) continue;
    if (f.sectionId) allowedSectionIds.add(f.sectionId);
  }
  const sections = sectionsAll
    .filter((s) => allowedSectionIds.has(s.id))
    .map((s) => {
      const { passwordHash: _pw, ...rest } = s;
      return { ...rest, passwordProtected: Boolean(s.passwordHash) };
    });

  const folders = foldersAll
    .filter((f) => allowedFolderIds.has(f.id))
    .map((f) => {
      const { passwordHash: _pw, ...rest } = f;
      return {
        ...rest,
        accessType: deriveAccessTypeForUi(f),
        passwordProtected: Boolean(f.passwordHash),
      };
    });

  const documents = documentStore.listAll().filter((d) => {
    if (!d.folderId) return true;
    return allowedFolderIds.has(d.folderId);
  });

  return res.json({
    sections,
    folders,
    documents,
  });
});

documentsRouter.post("/sections", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  const section = documentSectionStore.create(name, staff.userId);
  const { passwordHash: _pw, ...rest } = section;
  const out = { ...rest, passwordProtected: Boolean(section.passwordHash) };
  return res.status(201).json({ section: out });
});

documentsRouter.post("/sections/:sectionId/unlock", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const sectionId = String(req.params.sectionId ?? "");
  const section = documentSectionStore.findById(sectionId);
  if (!section) return res.status(404).json({ error: "NOT_FOUND" });
  // TODO: server-side unlock state.
  // Сейчас unlock лишь проверяет пароль и не создает отдельного access state на сервере.
  // Не расширяем доступ за пределы существующей ACL-модели, пока не будет отдельного review.
  if (!section.passwordHash) return res.json({ ok: true });
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password.trim()) return res.status(400).json({ error: "PASSWORD_REQUIRED" });
  const ok = bcrypt.compareSync(password.trim(), section.passwordHash);
  if (!ok) return res.status(403).json({ error: "PASSWORD_INCORRECT" });
  return res.json({ ok: true });
});

documentsRouter.patch("/sections/:sectionId", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const sectionId = String(req.params.sectionId ?? "");
  const existing = documentSectionStore.findById(sectionId);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  const name = req.body?.name != null ? String(req.body.name) : undefined;

  const wantsPasswordPatch = req.body?.hasPassword !== undefined || req.body?.password !== undefined;
  const viewer = userStore.findById(staff.userId) ?? null;
  const sysAdmin = Boolean(viewer && isSysAdminUser(viewer));
  const isOwner = Boolean(existing.ownerUserId && existing.ownerUserId === staff.userId);
  if (wantsPasswordPatch && !sysAdmin && !isOwner) return res.status(403).json({ error: "FORBIDDEN" });

  try {
    const patch: { name?: string; passwordHash?: string } = {};
    if (name !== undefined) patch.name = name;
    if (req.body?.hasPassword !== undefined) {
      const hasPassword = Boolean(req.body.hasPassword);
      if (!hasPassword) {
        patch.passwordHash = "";
      } else {
        const nextPw = typeof req.body?.password === "string" ? req.body.password.trim() : "";
        if (nextPw) patch.passwordHash = bcrypt.hashSync(nextPw, 10);
        else if (!existing.passwordHash) return res.status(400).json({ error: "PASSWORD_REQUIRED" });
      }
    }
    const section = documentSectionStore.updateById(sectionId, patch);
    const { passwordHash: _pw, ...rest } = section;
    return res.json({ section: { ...rest, passwordProtected: Boolean(section.passwordHash) } });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.delete("/sections/:sectionId", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const sectionId = String(req.params.sectionId ?? "");
  if (!documentSectionStore.findById(sectionId)) return res.status(404).json({ error: "NOT_FOUND" });
  const disciplineFolders = documentFolderTreeStore.list().filter((f) => f.sectionId === sectionId && f.disciplineId);
  if (disciplineFolders.length > 0) return res.status(400).json({ error: "DISCIPLINE_SECTION_LOCKED" });
  const folders = documentFolderTreeStore.list().filter((f) => f.sectionId === sectionId);
  const folderIds = new Set(folders.map((f) => f.id));
  const docs = documentStore.listAll({ includeTrashed: true }).filter((d) => d.sectionId === sectionId || (d.folderId && folderIds.has(d.folderId)));
  for (const d of docs) {
    try {
      disciplineStore.removeDocumentEverywhere(d.id);
      documentStore.delete(d.id);
    } catch {
      // ignore
    }
  }
  documentFolderTreeStore.removeByIds(folderIds);
  documentSectionStore.removeById(sectionId);
  return res.json({ ok: true });
});

documentsRouter.patch("/folders/:folderId", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const folderId = String(req.params.folderId ?? "");
  const existing = documentFolderTreeStore.findById(folderId);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (existing.disciplineId) return res.status(400).json({ error: "DISCIPLINE_FOLDER_LOCKED" });
  try {
    const raw = req.body ?? {};

    const wantsAccessPatch =
      raw.accessType !== undefined ||
      raw.shared !== undefined ||
      raw.sharedWithUserIds !== undefined ||
      raw.sharedWithRoleIds !== undefined ||
      raw.hasPassword !== undefined ||
      raw.password !== undefined;

    const viewer = userStore.findById(staff.userId) ?? null;
    const sysAdmin = Boolean(viewer && isSysAdminUser(viewer));
    const isOwner = Boolean(existing.ownerUserId && existing.ownerUserId === staff.userId);
    if (wantsAccessPatch && !sysAdmin && !isOwner) return res.status(403).json({ error: "FORBIDDEN" });

    const patch: {
      name?: string;
      sectionId?: string | null;
      parentFolderId?: string | null;
      accessType?: "private" | "org" | "selected";
      shared?: boolean;
      sharedWithUserIds?: string[];
      sharedWithRoleIds?: string[];
      passwordHash?: string;
    } = {};

    if (raw?.name != null) patch.name = String(raw.name);
    if (raw?.sectionId !== undefined) patch.sectionId = raw.sectionId == null ? null : String(raw.sectionId);
    if (raw?.parentFolderId !== undefined) {
      patch.parentFolderId = raw.parentFolderId == null ? null : String(raw.parentFolderId);
    }

    const accessTypeParsed: "private" | "org" | "selected" | null =
      raw.accessType === "private" || raw.accessType === "org" || raw.accessType === "selected" ? raw.accessType : null;

    const sharedWithUserIds = Array.isArray(raw.sharedWithUserIds)
      ? (raw.sharedWithUserIds as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined;

    const sharedWithRoleIds = Array.isArray(raw.sharedWithRoleIds)
      ? (raw.sharedWithRoleIds as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined;

    const legacyShared = raw.shared !== undefined ? Boolean(raw.shared) : undefined;

    if (accessTypeParsed) {
      patch.accessType = accessTypeParsed;
    } else if (legacyShared !== undefined) {
      if (legacyShared) patch.accessType = "org";
      else if ((sharedWithUserIds?.length ?? 0) > 0 || (sharedWithRoleIds?.length ?? 0) > 0) patch.accessType = "selected";
      else patch.accessType = "private";
    }

    // Приводим legacy shared/sharedWithUserIds к новым полям (и наоборот) для совместимости.
    if (patch.accessType === "org") {
      patch.shared = true;
      if (sharedWithUserIds !== undefined) patch.sharedWithUserIds = sharedWithUserIds;
      if (sharedWithRoleIds !== undefined) patch.sharedWithRoleIds = sharedWithRoleIds;
    } else if (patch.accessType === "selected") {
      patch.shared = false;
      if (sharedWithUserIds !== undefined) patch.sharedWithUserIds = sharedWithUserIds;
      if (sharedWithRoleIds !== undefined) patch.sharedWithRoleIds = sharedWithRoleIds;
    } else if (patch.accessType === "private") {
      patch.shared = false;
      patch.sharedWithUserIds = [];
      patch.sharedWithRoleIds = [];
    }

    // Пароль: UI присылает `hasPassword` + опционально новый `password`.
    if (raw.hasPassword !== undefined) {
      const hasPassword = Boolean(raw.hasPassword);
      if (!hasPassword) {
        patch.passwordHash = "";
      } else {
        const nextPw = typeof raw.password === "string" ? raw.password.trim() : "";
        if (nextPw) {
          patch.passwordHash = bcrypt.hashSync(nextPw, 10);
        } else if (!existing.passwordHash) {
          return res.status(400).json({ error: "PASSWORD_REQUIRED" });
        }
      }
    }

    if (patch.sectionId !== undefined && patch.sectionId !== null) {
      documentFolderTreeStore.updateSectionForSubtree(folderId, patch.sectionId);
    }
    const folder = documentFolderTreeStore.updateById(folderId, patch);
    const { passwordHash: _pw, ...rest } = folder;
    return res.json({
      folder: {
        ...rest,
        passwordProtected: Boolean(folder.passwordHash),
        accessType: folder.accessType ?? patch.accessType,
      },
    });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.post("/folders/:folderId/unlock", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });

  const folderId = String(req.params.folderId ?? "");
  const folder = documentFolderTreeStore.findById(folderId);
  if (!folder) return res.status(404).json({ error: "NOT_FOUND" });
  if (folder.disciplineId) return res.status(400).json({ error: "DISCIPLINE_FOLDER_LOCKED" });

  const viewer = userStore.findById(staff.userId) ?? null;
  const sysAdmin = Boolean(viewer && isSysAdminUser(viewer));
  const viewerRoleSet = new Set<string>([
    viewer?.primaryRole ?? "",
    ...(viewer?.secondaryRoles ?? []),
  ]);

  const foldersById = new Map(documentFolderTreeStore.list().map((f) => [f.id, f] as const));

  const canView =
    sysAdmin ||
    (folder.ownerUserId && folder.ownerUserId === staff.userId) ||
    (() => {
      const access = deriveEffectiveAccessType({ folder, foldersById });
      if (access === "org") return true;
      if (access === "selected") {
        if ((folder.sharedWithUserIds ?? []).includes(staff.userId)) return true;
        if ((folder.sharedWithRoleIds ?? []).some((r) => viewerRoleSet.has(r))) return true;
        return false;
      }
      return false;
    })();

  if (!canView) return res.status(403).json({ error: "FORBIDDEN" });
  // TODO: server-side unlock state.
  // Сейчас unlock лишь подтверждает пароль для уже видимой папки и не создает отдельного server-side access state.
  // Не используем unlock как источник дополнительных прав за пределами ACL папки.
  if (!folder.passwordHash) return res.json({ ok: true });

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password.trim()) return res.status(400).json({ error: "PASSWORD_REQUIRED" });

  const ok = bcrypt.compareSync(password.trim(), folder.passwordHash);
  if (!ok) return res.status(403).json({ error: "PASSWORD_INCORRECT" });

  return res.json({ ok: true });
});

documentsRouter.delete("/folders/:folderId", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const folderId = String(req.params.folderId ?? "");
  const existing = documentFolderTreeStore.findById(folderId);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (existing.disciplineId) return res.status(400).json({ error: "DISCIPLINE_FOLDER_LOCKED" });
  const subtree = documentFolderTreeStore.collectDescendants([folderId]);
  const docs = documentStore.listAll({ includeTrashed: true }).filter((d) => d.folderId && subtree.has(d.folderId));
  for (const d of docs) {
    try {
      disciplineStore.removeDocumentEverywhere(d.id);
      documentStore.delete(d.id);
    } catch {
      // ignore
    }
  }
  documentFolderTreeStore.removeByIds(subtree);
  return res.json({ ok: true });
});

documentsRouter.post("/merge-folders-to-section", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const rawIds: string[] = Array.isArray(req.body?.folderIds)
    ? (req.body.folderIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const name = String(req.body?.name ?? "").trim();
  if (rawIds.length < 2) return res.status(400).json({ error: "AT_LEAST_TWO_FOLDERS" });
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  const folderIds: string[] = [...new Set(rawIds)];
  const folders: DocumentTreeFolder[] = folderIds.map((id) => documentFolderTreeStore.findById(id)).filter((x): x is DocumentTreeFolder => Boolean(x));
  if (folders.length !== folderIds.length) return res.status(400).json({ error: "FOLDER_NOT_FOUND" });
  const first = folders[0]!;
  const sameLevel = folders.every(
    (f) => f.sectionId === first.sectionId && f.parentFolderId === first.parentFolderId,
  );
  if (!sameLevel) return res.status(400).json({ error: "FOLDERS_NOT_SAME_LEVEL" });
  const section = documentSectionStore.create(name, staff.userId);
  for (const fid of folderIds) {
    documentFolderTreeStore.updateSectionForSubtree(fid, section.id);
    documentFolderTreeStore.updateById(fid, { parentFolderId: null, sectionId: section.id });
  }
  return res.status(201).json({ section, folderIds });
});

documentsRouter.post("/folders", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const name = String(req.body?.name ?? "").trim();
  const sectionId = req.body?.sectionId != null ? String(req.body.sectionId) : null;
  const parentFolderId = req.body?.parentFolderId != null ? String(req.body.parentFolderId) : null;
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  if (sectionId && !documentSectionStore.findById(sectionId)) return res.status(400).json({ error: "SECTION_NOT_FOUND" });
  if (parentFolderId && !documentFolderTreeStore.findById(parentFolderId)) return res.status(400).json({ error: "PARENT_FOLDER_NOT_FOUND" });
  const folder = documentFolderTreeStore.create({ name, sectionId, parentFolderId, ownerUserId: staff.userId });
  return res.status(201).json({ folder });
});

documentsRouter.post("/move-documents", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const body = req.body as Record<string, unknown> | undefined;
  const rawIds = body?.documentIds;
  const ids: string[] = Array.isArray(rawIds)
    ? rawIds.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const documentIds: string[] = [...new Set(ids)];
  const targetFolderId = req.body?.targetFolderId != null ? String(req.body.targetFolderId) : null;
  if (documentIds.length === 0) return res.status(400).json({ error: "DOCUMENTS_REQUIRED" });
  if (targetFolderId && !documentFolderTreeStore.findById(targetFolderId)) return res.status(400).json({ error: "FOLDER_NOT_FOUND" });
  const targetFolder = targetFolderId ? documentFolderTreeStore.findById(targetFolderId) : null;
  const { sysAdmin, foldersById, viewerRoleSet } = getDocumentViewerContext(staff);
  if (
    !canUseTargetDocumentLocation({
      staff,
      sysAdmin,
      foldersById,
      viewerRoleSet,
      targetFolderId,
      targetSectionId: targetFolder?.sectionId ?? null,
    })
  ) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    for (const id of documentIds) {
      const document = documentStore.findById(id);
      if (!document) return res.status(404).json({ error: "NOT_FOUND" });
      if (!canManageDocumentWithContext({ document, staff, sysAdmin })) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
      assertCanKeepDisciplineDocumentInFolder(id, targetFolderId);
    }
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
  const moved = documentStore.moveDocuments(documentIds, {
    folderId: targetFolderId,
    sectionId: targetFolder?.sectionId ?? null,
  });
  return res.json({ documents: moved });
});

documentsRouter.get("/upload-routes", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const viewer = userStore.findById(staff.userId);
  const isAdminLike = Boolean(viewer && canAccessSchoolUserManagement(viewer));
  const roleQ = typeof req.query.role === "string" && req.query.role.trim() ? req.query.role.trim() : null;
  const userIdQ = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : null;
  const role = roleQ ?? staff.role;
  const userId = userIdQ;
  if (!isAdminLike && userId && userId !== staff.userId) return res.status(403).json({ error: "FORBIDDEN" });

  const baseRoutes = uploadDocumentRoutesStore.loadBase();
  const rows = uploadDocumentRoutesStore.listUserRows();
  const contextRows = rows.filter((x) => (x.role ?? null) === (role ?? null) && (x.userId ?? null) === (userId ?? null));
  const visibleUserRows = isAdminLike ? contextRows : contextRows.filter((x) => x.ownerUserId === staff.userId);
  const merged = [...baseRoutes, ...visibleUserRows.flatMap((x) => x.routes)];
  const sourceMap = new Map<string, any>();
  for (const row of merged) {
    const prev = sourceMap.get(row.source) ?? { source: row.source, targets: [] as any[] };
    const seen = new Set(prev.targets.map((t: any) => JSON.stringify(t)));
    for (const t of row.targets) {
      const k = JSON.stringify(t);
      if (seen.has(k)) continue;
      seen.add(k);
      prev.targets.push(t);
    }
    sourceMap.set(row.source, prev);
  }
  return res.json({
    baseRoutes,
    userRoutes: visibleUserRows,
    effectiveRoutes: Array.from(sourceMap.values()),
    role,
    userId,
    canEditBase: isAdminLike,
    isAdminLike,
  });
});

documentsRouter.put("/upload-routes", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const viewer = userStore.findById(staff.userId);
  const isAdminLike = Boolean(viewer && canAccessSchoolUserManagement(viewer));
  try {
    const routes = parseUploadRoutesPayload(req.body?.routes);
    validateUploadRoutes(routes);
    const scope = req.body?.scope === "base" ? "base" : "user";
    if (scope === "base") {
      if (!isAdminLike) return res.status(403).json({ error: "FORBIDDEN" });
      uploadDocumentRoutesStore.saveBase(routes);
      return res.json({ ok: true, scope: "base" });
    }
    const roleRaw = typeof req.body?.role === "string" && req.body.role.trim() ? req.body.role.trim() : null;
    const userIdRaw = typeof req.body?.userId === "string" && req.body.userId.trim() ? req.body.userId.trim() : null;
    const role = isAdminLike ? roleRaw : staff.role;
    const userId = isAdminLike ? userIdRaw : staff.userId;
    uploadDocumentRoutesStore.saveUser(staff.userId, role, userId, routes);
    return res.json({ ok: true, scope: "user", role, userId, ownerUserId: staff.userId });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.delete("/upload-routes/clear", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const viewer = userStore.findById(staff.userId);
  const isAdminLike = Boolean(viewer && canAccessSchoolUserManagement(viewer));
  const role = typeof req.query.role === "string" && req.query.role.trim() ? req.query.role.trim() : staff.role;
  const userId = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : null;
  if (!isAdminLike && userId && userId !== staff.userId) return res.status(403).json({ error: "FORBIDDEN" });
  uploadDocumentRoutesStore.clearUserRows({
    requesterUserId: staff.userId,
    isAdmin: isAdminLike,
    role: role ?? null,
    userId: userId ?? null,
  });
  return res.json({ ok: true });
});

documentsRouter.get("/trash", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const { sysAdmin, foldersById, viewerRoleSet } = getDocumentViewerContext(staff);
  const documents = documentStore.listTrashed().filter((document) =>
    canViewDocumentWithContext({
      document,
      staff,
      sysAdmin,
      foldersById,
      viewerRoleSet,
    }),
  );
  return res.json({ documents });
});

documentsRouter.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  (req: AuthedRequest, res) => {
    const staff = requireUploader(req);
    if (!staff) return res.status(403).json({ error: "FORBIDDEN" });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "FILE_REQUIRED" });

    const tagsRaw = (req.body && (req.body.tags as any)) ?? undefined;
    const folderRaw = (req.body && (req.body.folder as any)) ?? undefined;
    const sectionIdRaw = (req.body && (req.body.sectionId as any)) ?? undefined;
    const folderIdRaw = (req.body && (req.body.folderId as any)) ?? undefined;
    const tags = typeof tagsRaw === "string" ? safeJsonParse(tagsRaw) : tagsRaw;
    const folder = typeof folderRaw === "string" ? safeJsonParse(folderRaw) : folderRaw;
    const sectionId = typeof sectionIdRaw === "string" ? sectionIdRaw : null;
    const folderId = typeof folderIdRaw === "string" ? folderIdRaw : null;
    const disciplineCodeRaw = (req.body && (req.body.disciplineCode as any)) ?? undefined;
    const isStandardizingRaw = (req.body && (req.body.isStandardizing as any)) ?? undefined;
    const disciplineCode = typeof disciplineCodeRaw === "string" ? disciplineCodeRaw.trim() : "";
    const isStandardizing =
      isStandardizingRaw === true ||
      isStandardizingRaw === "true" ||
      isStandardizingRaw === "1" ||
      isStandardizingRaw === 1;

    const folderProbe = folder && typeof folder === "object" ? (folder as Record<string, unknown>) : null;
    const iomUploadTeacherId =
      typeof folderProbe?.iomTeacherUserId === "string" ? folderProbe.iomTeacherUserId.trim() : "";
    if (iomUploadTeacherId) {
      const me = userStore.findById(staff.userId);
      if (!me || (me.id !== iomUploadTeacherId && !canAccessSchoolUserManagement(me))) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }
    }

    try {
      const placement = disciplineCode ? getDisciplinePlacement(disciplineCode) : null;
      const doc = documentStore.createFromUpload({
        tempPath: file.path,
        originalName: normalizeOriginalFileName(file.originalname),
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        createdByUserId: staff.userId,
        tags: placement ? placement.tags : tags,
        folder: placement ? placement.folderMeta : folder,
        sectionId: placement ? placement.section.id : sectionId,
        folderId: placement ? placement.folder.id : folderId,
        disciplineId: placement?.discipline.id ?? null,
        isStandardizing: placement ? isStandardizing || true : isStandardizing,
      });
      if (placement) {
      const ref = { id: doc.id, name: doc.originalFileName ?? doc.originalName, url: `/files/${doc.storageRelPath}` };
        const nextDocs = placement.discipline.documents.some((item) => item.id === doc.id)
          ? placement.discipline.documents
          : [...placement.discipline.documents, ref];
        disciplineStore.updateByCode(placement.discipline.code, { documents: nextDocs });
      }
      const routeSource = placement ? "methospace_discipline" : "documents_panel";
      applyUploadDocumentFanout({
        source: routeSource,
        primaryDocumentId: doc.id,
        createdByUserId: staff.userId,
      });
      return res.status(201).json({ document: doc, url: `/files/${doc.storageRelPath}` });
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  },
);

documentsRouter.post("/:id/restore", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findByIdIncludingTrash(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (!existing.inTrash) return res.status(400).json({ error: "NOT_IN_TRASH" });
  if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    const updated = documentStore.restoreFromTrash(id);
    return res.json({ document: updated });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.post("/:id/copy", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findById(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const rawTf = req.body?.targetFolderId;
  const targetFolderId =
    rawTf === undefined ? (existing.folderId ?? null) : rawTf === null ? null : String(rawTf);
  const targetFolder = targetFolderId ? documentFolderTreeStore.findById(targetFolderId) : null;
  try {
    assertCanKeepDisciplineDocumentInFolder(id, targetFolderId);
    const dup = documentStore.duplicateDocument(id, {
      sectionId: targetFolder?.sectionId ?? existing.sectionId ?? null,
      folderId: targetFolderId,
      createdByUserId: staff.userId,
    });
    return res.status(201).json({ document: dup });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.patch("/:id", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findByIdIncludingTrash(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    if (req.body?.originalName != null) {
      const updated = documentStore.renameOriginal(id, String(req.body.originalName));
      return res.json({ document: updated });
    }
    const nextFolderId = req.body?.folderId !== undefined ? (req.body.folderId == null ? null : String(req.body.folderId)) : existing.folderId ?? null;
    assertCanKeepDisciplineDocumentInFolder(id, nextFolderId);
    const updated = documentStore.updateMeta(id, {
      tags: req.body?.tags,
      folder: req.body?.folder,
      sectionId: req.body?.sectionId,
      folderId: req.body?.folderId,
      disciplineId: req.body?.disciplineId,
      isStandardizing: req.body?.isStandardizing,
      inTrash: req.body?.inTrash,
      trashedAt: req.body?.trashedAt === null ? null : undefined,
    });
    return res.json({ document: updated });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

function deriveAccessTypeForUi(folder: DocumentTreeFolder): "private" | "org" | "selected" {
  if (folder.accessType) return folder.accessType;
  // Исторические данные: если у записи нет owner'а, не ломаем существующую видимость.
  if (!folder.ownerUserId) return "org";
  if (folder.shared === true) return "org";
  if ((folder.sharedWithUserIds?.length ?? 0) > 0) return "selected";
  if ((folder.sharedWithRoleIds?.length ?? 0) > 0) return "selected";
  return "private";
}

function deriveEffectiveAccessType(args: {
  folder: DocumentTreeFolder;
  foldersById: Map<string, DocumentTreeFolder>;
}): "private" | "org" | "selected" {
  const visited = new Set<string>();
  let cur: DocumentTreeFolder | undefined = args.folder;
  while (cur) {
    if (visited.has(cur.id)) break;
    visited.add(cur.id);
    const own = deriveAccessTypeForUi(cur);
    if (own !== "private") return own;
    const parentId: string | null = cur.parentFolderId ?? null;
    cur = parentId ? args.foldersById.get(parentId) : undefined;
  }
  return "private";
}

function canViewFolderForViewer(args: {
  folder: DocumentTreeFolder;
  viewer: { userId: string; role: string } | null;
  sysAdmin: boolean;
  foldersById: Map<string, DocumentTreeFolder>;
}): boolean {
  const { folder, viewer, sysAdmin, foldersById } = args;
  if (sysAdmin) return true;
  if (!viewer) return false;
  const staffUserId = viewer.userId;
  const fullViewer = userStore.findById(staffUserId);
  const viewerRoleSet = new Set<string>([
    viewer.role ?? "",
    ...(fullViewer?.secondaryRoles ?? []),
  ]);
  if (folder.ownerUserId && folder.ownerUserId === staffUserId) return true;
  const access = deriveEffectiveAccessType({ folder, foldersById });
  if (access === "org") return true;
  if (access === "selected") {
    if ((folder.sharedWithUserIds ?? []).includes(staffUserId)) return true;
    if ((folder.sharedWithRoleIds ?? []).some((r) => viewerRoleSet.has(r))) return true;
    return false;
  }
  return false;
}

documentsRouter.get("/:id/versions", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const doc = documentStore.findByIdIncludingTrash(id);
  if (!doc) return res.status(404).json({ error: "NOT_FOUND" });

  if (doc.inTrash) {
    if (!canManageAnyDocument(staff) && doc.createdByUserId !== staff.userId) return res.status(403).json({ error: "FORBIDDEN" });
  }

  if (doc.folderId) {
    const folder = documentFolderTreeStore.findById(doc.folderId);
    if (!folder) return res.status(403).json({ error: "FORBIDDEN" });
    const viewer = { userId: staff.userId, role: staff.role };
    const sysAdmin = staff.role === "sysadmin";
    const foldersById = new Map(documentFolderTreeStore.list().map((f) => [f.id, f] as const));
    if (!canViewFolderForViewer({ folder, viewer, sysAdmin, foldersById })) return res.status(403).json({ error: "FORBIDDEN" });
  }

  const stored = listVersionsByDocumentId(doc.id);

  if (stored.length === 0) {
    const init = {
      id: doc.id,
      documentId: doc.id,
      createdAt: doc.createdAt,
      createdByUserId: doc.createdByUserId,
      comment: undefined as string | undefined,
      sizeBytes: doc.sizeBytes,
      mimeType: doc.mimeType,
      originalFileName: doc.originalFileName ?? doc.originalName,
      originalName: doc.originalName,
      downloadUrl: `/files/${doc.storageRelPath}`,
      isCurrent: true,
    };
    return res.json({ versions: [init] });
  }

  return res.json({
    versions: stored.map((v) => ({
      ...v,
      downloadUrl: `/files/${v.storageRelPath}`,
    })),
  });
});

documentsRouter.post(
  "/:id/versions",
  requireAuth,
  upload.single("file"),
  (req: AuthedRequest, res) => {
    const staff = requireUploader(req);
    if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
    const id = String(req.params.id ?? "");
    const existing = documentStore.findByIdIncludingTrash(id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) return res.status(403).json({ error: "FORBIDDEN" });
    if (existing.disciplineId) {
      // дисциплинарные документы обычно обновляются через отдельные пайплайны; пока блокируем ручное версионирование.
      // (Можно снять ограничение позже по требованиям.)
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "FILE_REQUIRED" });

    const comment = typeof req.body?.comment === "string" ? req.body.comment : undefined;

    try {
      const FILES_ROOT = join(__dirname, "..", "..", "data", "files");
      // Snapshot initial version when the first replacement happens.
      const storedBefore = listVersionsByDocumentId(existing.id);
      if (storedBefore.length === 0) {
        const absCurrent = join(FILES_ROOT, existing.storageRelPath);
        const bufInit = readFileSync(absCurrent);
        createDocumentVersion({
          documentId: existing.id,
          createdByUserId: existing.createdByUserId,
          comment: undefined,
          buffer: bufInit,
          originalName: existing.originalName,
          mimeType: existing.mimeType,
          sizeBytes: existing.sizeBytes,
          createdAt: existing.createdAt,
        });
      }

      const bufNew = readFileSync(file.path);
      const version = createDocumentVersion({
        documentId: existing.id,
        createdByUserId: staff.userId,
        comment,
        buffer: bufNew,
        originalName: normalizeOriginalFileName(file.originalname),
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
      });

      // Replace current document file (doc's storageRelPath remains doc.id-based).
      const updated = documentStore.replaceStoredFileFromUpload(existing.id, {
        tempPath: file.path,
        originalName: normalizeOriginalFileName(file.originalname),
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
      });

      documentStore.setCurrentVersionId(updated.id, version.id);
      documentStore.updateAuditFields(updated.id, { createdByUserId: staff.userId, createdAt: version.createdAt });

      return res.status(201).json({ document: updated, version });
    } catch (e) {
      // best-effort cleanup of temp upload is handled by multer; keep message safe.
      return res.status(400).json({ error: (e as Error).message });
    }
  },
);

documentsRouter.post("/:id/versions/:versionId/make-current", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const versionId = String(req.params.versionId ?? "");
  const doc = documentStore.findByIdIncludingTrash(id);
  if (!doc) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageAnyDocument(staff) && doc.createdByUserId !== staff.userId) return res.status(403).json({ error: "FORBIDDEN" });

  // Synthetic init (when versions were never created)
  if (versionId === doc.id) {
    documentStore.setCurrentVersionId(doc.id, doc.id);
    return res.json({ ok: true });
  }

  const version = findVersionById(versionId);
  if (!version || version.documentId !== doc.id) return res.status(404).json({ error: "VERSION_NOT_FOUND" });

  try {
    const FILES_ROOT = join(__dirname, "..", "..", "data", "files");
    const abs = join(FILES_ROOT, version.storageRelPath);
    const buf = readFileSync(abs);

    const updated = documentStore.replaceStoredFileFromBuffer(doc.id, {
      buffer: buf,
      originalName: version.originalName,
      mimeType: version.mimeType,
      sizeBytes: version.sizeBytes,
      createdByUserId: version.createdByUserId,
      createdAt: version.createdAt,
    });

    documentStore.setCurrentVersionId(updated.id, version.id);
    setCurrentVersionForDocument(updated.id, version.id);
    documentStore.updateAuditFields(updated.id, { createdByUserId: version.createdByUserId, createdAt: version.createdAt });

    return res.json({ ok: true, document: updated });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.get("/:id/comments", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const doc = documentStore.findByIdIncludingTrash(id);
  if (!doc) return res.status(404).json({ error: "NOT_FOUND" });
  if (doc.folderId) {
    const folder = documentFolderTreeStore.findById(doc.folderId);
    if (!folder) return res.status(403).json({ error: "FORBIDDEN" });
    const viewer = { userId: staff.userId, role: staff.role };
    const sysAdmin = staff.role === "sysadmin";
    const foldersById = new Map(documentFolderTreeStore.list().map((f) => [f.id, f] as const));
    if (!canViewFolderForViewer({ folder, viewer, sysAdmin, foldersById })) return res.status(403).json({ error: "FORBIDDEN" });
  }
  const comments = listCommentsByDocumentId(doc.id);
  return res.json({ comments });
});

documentsRouter.post("/:id/comments", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findByIdIncludingTrash(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const body = typeof req.body?.body === "string" ? req.body.body : "";
  try {
    const comment = addComment({ documentId: existing.id, authorId: staff.userId, body });
    return res.status(201).json({ comment });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.get("/:id/bindings", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const doc = documentStore.findByIdIncludingTrash(id);
  if (!doc) return res.status(404).json({ error: "NOT_FOUND" });
  if (doc.folderId) {
    const folder = documentFolderTreeStore.findById(doc.folderId);
    if (!folder) return res.status(403).json({ error: "FORBIDDEN" });
    const viewer = { userId: staff.userId, role: staff.role };
    const sysAdmin = staff.role === "sysadmin";
    const foldersById = new Map(documentFolderTreeStore.list().map((f) => [f.id, f] as const));
    if (!canViewFolderForViewer({ folder, viewer, sysAdmin, foldersById })) return res.status(403).json({ error: "FORBIDDEN" });
  }
  const bindings = listBindingsByDocumentId(doc.id);
  return res.json({ bindings });
});

documentsRouter.post("/:id/bindings", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findByIdIncludingTrash(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const binding = req.body?.binding;
  if (!binding || typeof binding !== "object") return res.status(400).json({ error: "BINDING_REQUIRED" });
  try {
    const created = addBinding({ documentId: existing.id, binding: binding as any, createdByUserId: staff.userId });
    return res.status(201).json({ binding: created });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.delete("/:id", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findByIdIncludingTrash(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (!canManageAnyDocument(staff) && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    if (existing.inTrash) {
      documentStore.delete(id);
      deleteVersionsByDocumentId(id);
      deleteCommentsByDocumentId(id);
      deleteBindingsByDocumentId(id);
    } else {
      documentStore.moveToTrash(id);
      disciplineStore.removeDocumentEverywhere(id);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

documentsRouter.post("/:id/link", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireUploader(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const existing = documentStore.findById(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  const { sysAdmin } = getDocumentViewerContext(staff);
  if (!canManageDocumentWithContext({ document: existing, staff, sysAdmin })) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const { disciplineCode } = req.body ?? {};
  if (typeof disciplineCode !== "string" || !disciplineCode.trim()) {
    return res.status(400).json({ error: "DISCIPLINE_CODE_REQUIRED" });
  }
  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });

  const placement = getDisciplinePlacement(disciplineCode);
  documentStore.updateMeta(existing.id, {
    sectionId: placement.section.id,
    folderId: placement.folder.id,
    disciplineId: placement.discipline.id,
    isStandardizing: true,
    folder: placement.folderMeta,
    tags: placement.tags,
  });
  const ref = { id: existing.id, name: existing.originalFileName ?? existing.originalName, url: `/files/${existing.storageRelPath}` };
  const already = discipline.documents.some((d) => d.id === existing.id);
  const nextDocs = already ? discipline.documents : [...discipline.documents, ref];
  const updated = disciplineStore.updateByCode(disciplineCode, { documents: nextDocs });
  return res.status(201).json({ discipline: updated });
});

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

