import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "uploadDocumentRoutes.json");

/** Источники загрузки — согласованы с UI маршрутов и вызовами fanout на сервере */
export const UPLOAD_SOURCE_IDS = [
  "journal_lesson",
  "methospace_discipline",
  "documents_panel",
] as const;
export type UploadSourceId = (typeof UPLOAD_SOURCE_IDS)[number];

export type UploadTargetRef =
  | { type: "folder"; folderId: string }
  | { type: "section_loose"; sectionId: string }
  | { type: "panel_loose" };

export type StoredUploadRoute = {
  source: UploadSourceId;
  targets: UploadTargetRef[];
};

export type StoredUserUploadRoutes = {
  ownerUserId: string;
  role: string | null;
  userId: string | null;
  routes: StoredUploadRoute[];
};

type FileShape = { baseRoutes: StoredUploadRoute[]; userRoutes: StoredUserUploadRoutes[] };

const defaultFile: FileShape = { baseRoutes: [], userRoutes: [] };

function isUploadSourceId(s: string): s is UploadSourceId {
  return (UPLOAD_SOURCE_IDS as readonly string[]).includes(s);
}

function normalizeTarget(x: unknown): UploadTargetRef | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.type === "panel_loose") return { type: "panel_loose" };
  if (o.type === "folder" && typeof o.folderId === "string" && o.folderId.trim()) {
    return { type: "folder", folderId: o.folderId.trim() };
  }
  if (o.type === "section_loose" && typeof o.sectionId === "string" && o.sectionId.trim()) {
    return { type: "section_loose", sectionId: o.sectionId.trim() };
  }
  return null;
}

function normalizeRoute(x: unknown): StoredUploadRoute | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const src = typeof o.source === "string" ? o.source : "";
  if (!isUploadSourceId(src)) return null;
  const rawTargets = Array.isArray(o.targets) ? o.targets : [];
  const targets = rawTargets.map(normalizeTarget).filter((t): t is UploadTargetRef => Boolean(t));
  return { source: src, targets };
}

export function parseUploadRoutesPayload(raw: unknown): StoredUploadRoute[] {
  if (!Array.isArray(raw)) throw new Error("ROUTES_REQUIRED");
  return raw.map(normalizeRoute).filter((r): r is StoredUploadRoute => Boolean(r));
}

class UploadDocumentRoutesStore {
  private loadFile(): FileShape {
    const data = readJsonFile<FileShape>(DATA_PATH, defaultFile);
    const baseRoutes = Array.isArray((data as any)?.baseRoutes)
      ? ((data as any).baseRoutes.map(normalizeRoute).filter(Boolean) as StoredUploadRoute[])
      : Array.isArray((data as any)?.routes)
        ? ((data as any).routes.map(normalizeRoute).filter(Boolean) as StoredUploadRoute[])
        : [];
    const userRoutesRaw = Array.isArray((data as any)?.userRoutes) ? (data as any).userRoutes : [];
    const userRoutes: StoredUserUploadRoutes[] = userRoutesRaw
      .map((row: any) => {
        if (!row || typeof row !== "object") return null;
        const ownerUserId = typeof row.ownerUserId === "string" ? row.ownerUserId.trim() : "";
        if (!ownerUserId) return null;
        const role = typeof row.role === "string" && row.role.trim() ? row.role.trim() : null;
        const userId = typeof row.userId === "string" && row.userId.trim() ? row.userId.trim() : null;
        const routes = Array.isArray(row.routes)
          ? (row.routes.map(normalizeRoute).filter(Boolean) as StoredUploadRoute[])
          : [];
        return { ownerUserId, role, userId, routes };
      })
      .filter((x: StoredUserUploadRoutes | null): x is StoredUserUploadRoutes => Boolean(x));
    return { baseRoutes, userRoutes };
  }

  loadBase(): StoredUploadRoute[] {
    return this.loadFile().baseRoutes;
  }

  loadUser(ownerUserId: string, role: string | null, userId: string | null): StoredUploadRoute[] {
    const row = this.loadFile().userRoutes.find(
      (x) => x.ownerUserId === ownerUserId && (x.role ?? null) === (role ?? null) && (x.userId ?? null) === (userId ?? null),
    );
    return row?.routes ?? [];
  }

  listUserRows(): StoredUserUploadRoutes[] {
    return this.loadFile().userRoutes;
  }

  saveBase(routes: StoredUploadRoute[]): void {
    const file = this.loadFile();
    writeJsonFile(DATA_PATH, { ...file, baseRoutes: routes });
  }

  saveUser(ownerUserId: string, role: string | null, userId: string | null, routes: StoredUploadRoute[]): void {
    const file = this.loadFile();
    const nextRows = file.userRoutes.filter(
      (x) => !(x.ownerUserId === ownerUserId && (x.role ?? null) === (role ?? null) && (x.userId ?? null) === (userId ?? null)),
    );
    nextRows.push({ ownerUserId, role, userId, routes });
    writeJsonFile(DATA_PATH, { ...file, userRoutes: nextRows });
  }

  clearUserRows(args: { requesterUserId: string; isAdmin: boolean; role: string | null; userId: string | null }): void {
    const file = this.loadFile();
    const nextRows = file.userRoutes.filter((x) => {
      const contextMatch = (x.role ?? null) === (args.role ?? null) && (x.userId ?? null) === (args.userId ?? null);
      if (!contextMatch) return true;
      if (args.isAdmin) return false;
      return x.ownerUserId !== args.requesterUserId;
    });
    writeJsonFile(DATA_PATH, { ...file, userRoutes: nextRows });
  }
}

export const uploadDocumentRoutesStore = new UploadDocumentRoutesStore();
