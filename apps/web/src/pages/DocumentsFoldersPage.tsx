import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { canManageDocumentUploadRoutes } from "../lib/documentUploadRoutesUi";
import { formatFileName } from "../lib/formatFileName";
import { ED_Z_TRACKER_POPOVER } from "../lib/zLayers";
import { playServiceSound } from "../audio/systemSounds";
import { useAuth } from "../state/auth";
import { addDocumentObjectToRiviSpace, loadRiviState } from "../florium/riviStorage";

type Doc = {
  id: string;
  originalFileName?: string;
  originalName: string;
  storageRelPath: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  sectionId?: string | null;
  folderId?: string | null;
  createdByUserId?: string;
  disciplineId?: string | null;
  isStandardizing?: boolean;
  inTrash?: boolean;
  tags?: {
    periods?: string[];
    journalTrace?: { journalDocumentTypeId?: string; lessonDateIso?: string };
  };
};
type Section = { id: string; name: string; ownerUserId?: string; passwordProtected?: boolean };
type Folder = {
  id: string;
  name: string;
  sectionId: string | null;
  parentFolderId: string | null;
  createdAt?: string;
  disciplineId?: string | null;
  ownerUserId?: string;
  accessType?: "private" | "org" | "selected";
  shared?: boolean;
  sharedWithUserIds?: string[];
  sharedWithRoleIds?: string[];
  passwordProtected?: boolean;
};
type FolderMeta = { purpose?: string };
type FolderViewMode = "date" | "docType";
type FolderPeriodMode = "academicYear" | "currentQuarter" | "custom";

const ROOT_TREE = "__root__";

function sectionLink(id: string) {
  return `${window.location.origin}/documents/section/${encodeURIComponent(id)}`;
}
function folderLink(folder: Folder) {
  if (folder.sectionId) return `${window.location.origin}/documents/section/${encodeURIComponent(folder.sectionId)}/folder/${encodeURIComponent(folder.id)}`;
  return `${window.location.origin}/documents/folder/${encodeURIComponent(folder.id)}`;
}
function docLink(doc: Doc, foldersById: Map<string, Folder>) {
  if (doc.folderId) {
    const folder = foldersById.get(doc.folderId);
    if (folder) return folderLink(folder);
  }
  if (doc.sectionId) return sectionLink(doc.sectionId);
  return `${window.location.origin}/documents`;
}

function fileUrl(doc: Doc) {
  return `/api/files/${doc.storageRelPath}`;
}

function docName(doc: Pick<Doc, "originalName" | "originalFileName">): string {
  return formatFileName(doc.originalFileName ?? doc.originalName);
}

function loadFolderMeta(): Record<string, FolderMeta> {
  try {
    const raw = localStorage.getItem("documents.folderMeta");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FolderMeta>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function loadTreeCollapsed(): boolean {
  try {
    return localStorage.getItem("documents.treeCollapsed") === "1";
  } catch {
    return false;
  }
}

function BackButton({ onClick, label = "Назад" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-2.5 py-1 text-xs font-medium" onClick={onClick}>
      ← {label}
    </button>
  );
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isFolderDescendantOf(folders: Folder[], descendantId: string, ancestorId: string): boolean {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const seen = new Set<string>();
  let cur: string | null = descendantId;
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = byId.get(cur)?.parentFolderId ?? null;
  }
  return false;
}

function fileFormatLabel(ext: string): string {
  const m: Record<string, string> = {
    pdf: "PDF",
    doc: "DOC",
    docx: "DOCX",
    xls: "TAB",
    xlsx: "TAB",
    csv: "TAB",
    ppt: "PPT",
    pptx: "PPT",
    zip: "ZIP",
    rar: "ZIP",
    "7z": "ZIP",
    tar: "ZIP",
    png: "IMG",
    jpg: "IMG",
    jpeg: "IMG",
    gif: "IMG",
    webp: "IMG",
    svg: "IMG",
    txt: "TXT",
  };
  return m[ext] ?? (ext ? ext.toUpperCase().slice(0, 5) : "FILE");
}

function formatBytes(bytes?: number): string {
  if (!Number.isFinite(bytes as number) || (bytes as number) < 0) return "—";
  const b = bytes as number;
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\\.0$/, "")} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1).replace(/\\.0$/, "")} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace(/\\.0$/, "")} GB`;
}

type DocKind = "image" | "pdf" | "doc" | "other";

function detectDocKind(doc: Pick<Doc, "mimeType" | "originalName" | "originalFileName">): { kind: DocKind; ext: string } {
  const ext = extFromName(docName(doc));
  const mt = (doc.mimeType ?? "").toLowerCase();
  if (mt.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return { kind: "image", ext };
  if (mt === "application/pdf" || ext === "pdf") return { kind: "pdf", ext };
  if (mt.includes("word") || ["doc", "docx"].includes(ext)) return { kind: "doc", ext };
  return { kind: "other", ext };
}

function formatRuDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function inferDocTypeIdFromTags(doc: Doc, knownTypeIds: Set<string>): string | null {
  const direct = doc.tags?.journalTrace?.journalDocumentTypeId;
  if (direct && knownTypeIds.has(direct)) return direct;
  for (const token of doc.tags?.periods ?? []) {
    if (knownTypeIds.has(token)) return token;
  }
  return null;
}

function inCurrentAcademicYear(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const from = new Date(startYear, 8, 1);
  const to = new Date(startYear + 1, 7, 31, 23, 59, 59, 999);
  return d >= from && d <= to;
}

function SectionStackGlyph() {
  return (
    <svg className="ed-doc-section-icon" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="8" y="12" width="24" height="20" rx="2" fill="rgba(251,191,36,0.28)" stroke="#f59e0b" strokeWidth="1" />
      <rect x="10" y="8" width="20" height="14" rx="1.5" fill="white" fillOpacity="0.92" stroke="#e5e7eb" strokeWidth="0.75" />
      <path d="M13 12h14M13 15h9" stroke="#9ca3af" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function FolderGlyph({ label, compact }: { label: string; compact?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const gid = `ed-doc-fg-${uid}`;
  const ch = label.trim().charAt(0).toUpperCase() || "•";
  return (
    <div className={compact ? "ed-doc-folder-glyph ed-doc-folder-glyph--compact" : "ed-doc-folder-glyph"} aria-hidden>
      <svg className="ed-doc-folder-glyph__svg" viewBox="0 0 56 44" fill="none">
        <path d="M6 10c0-1.1.9-2 2-2h14l4 4h26c1.1 0 2 .9 2 2v24c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V10z" fill={`url(#${gid})`} opacity="0.95" />
        <path
          d="M6 14h44v22a2 2 0 01-2 2H8a2 2 0 01-2-2V14z"
          fill="#f9fafb"
          stroke="#d1d5db"
          strokeWidth="0.75"
        />
        <defs>
          <linearGradient id={gid} x1="6" y1="8" x2="44" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef3c7" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>
      <span className="ed-doc-folder-glyph__letter">{ch}</span>
    </div>
  );
}

function DocumentsFileCard({
  doc,
  highlighted,
  selected,
  onToggleSelect,
  onOpen,
  onMenu,
}: {
  doc: Doc;
  highlighted: boolean;
  selected: boolean;
  onToggleSelect: (next: boolean) => void;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const { kind, ext } = detectDocKind(doc);
  const displayName = docName(doc);
  const updated = formatRuDate(doc.createdAt);
  const sizeLabel = formatBytes(doc.sizeBytes);

  const author = doc.createdByUserId ?? null;
  const fmt = fileFormatLabel(ext);

  const otherSub =
    kind !== "other"
      ? null
      : ["xls", "xlsx", "csv"].includes(ext)
        ? "table"
        : ["zip", "rar", "7z", "tar", "gz", "tgz"].includes(ext)
          ? "archive"
          : ["ppt", "pptx"].includes(ext)
            ? "presentation"
            : "other";

  const tagClass =
    kind === "pdf"
      ? "ed-doc-formatTag ed-doc-formatTag--pdf"
      : kind === "doc"
        ? "ed-doc-formatTag ed-doc-formatTag--doc"
        : kind === "image"
          ? "ed-doc-formatTag ed-doc-formatTag--img"
          : otherSub === "table"
            ? "ed-doc-formatTag ed-doc-formatTag--table"
            : otherSub === "archive"
              ? "ed-doc-formatTag ed-doc-formatTag--archive"
              : otherSub === "presentation"
                ? "ed-doc-formatTag ed-doc-formatTag--presentation"
                : "ed-doc-formatTag ed-doc-formatTag--other";

  const standardizingPill = doc.isStandardizing ? (
    <span className="ed-doc-meta-pill ed-doc-meta-pill--warn">на ревизии</span>
  ) : null;

  const preview = (() => {
    if (kind === "image") {
      return (
        <img
          src={fileUrl(doc)}
          alt={displayName}
          className="ed-doc-card-previewImg"
          loading="lazy"
          onError={(e) => {
            // If the image can't load, keep a stable layout (hide img on error).
            e.currentTarget.style.display = "none";
          }}
        />
      );
    }

    if (kind === "pdf") {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-rose-50 to-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-white shadow-sm">
            <span className="text-lg" aria-hidden>
              📄
            </span>
          </div>
        </div>
      );
    }

    if (kind === "doc") {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-sky-50 to-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200 bg-white shadow-sm">
            <span className="font-black text-sky-700" aria-hidden>
              W
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-slate-50 to-white">
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-lg" aria-hidden>
            📎
          </span>
          <span className="text-[11px] font-bold tracking-wide text-slate-600" aria-hidden>
            {fmt}
          </span>
        </div>
      </div>
    );
  })();

  return (
    <div
      className={["ed-doc-file-tile ed-card ed-card-interactive relative", highlighted ? "ed-doc-file-tile--focused" : ""].filter(Boolean).join(" ").trim()}
      role="button"
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e);
      }}
      onClick={() => void onOpen()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onOpen();
        }
      }}
    >
      <div className="absolute left-3 top-3 z-[2]">
        <label
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-[0.65rem] text-[#6b7280] shadow-sm ring-1 ring-white/50"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
          выбор
        </label>
      </div>

      <div className="ed-doc-card-previewArea px-3 pt-3 pb-2" aria-label={displayName}>
        <div className={tagClass}>
          <span className="min-w-0 truncate" title={displayName}>
            {fmt}
          </span>
        </div>
        <div className="relative mt-2 h-28 w-full overflow-hidden rounded-[0.9rem] bg-white/60">
          {preview}

          <div className="ed-doc-card-actions" aria-hidden={false}>
            <button
              type="button"
              className="ed-doc-btn-ghost flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-800 hover:bg-white"
              onClick={(e) => {
                e.stopPropagation();
                void onOpen();
              }}
              title="Просмотреть"
            >
              👁 Просмотреть
            </button>
            <a
              href={fileUrl(doc)}
              download={displayName}
              className="ed-doc-btn-ghost flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-800 hover:bg-white"
              onClick={(e) => e.stopPropagation()}
              title="Скачать"
            >
              ⬇ Скачать
            </a>
            <button
              type="button"
              className="ed-doc-btn-ghost flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-800 hover:bg-white"
              onClick={(e) => {
                e.stopPropagation();
                const url = fileUrl(doc);
                const popup = window.open(url, "_blank", "noopener,noreferrer");
                if (!popup) window.location.assign(url);
              }}
              title="Открыть в новой вкладке"
            >
              ↗ Новая вкладка
            </button>
          </div>

          <div className="absolute left-2 top-2 z-[5]">{standardizingPill}</div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="line-clamp-2 text-sm font-semibold leading-snug text-[#1f2933]" title={displayName}>
          {displayName}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          {kind === "doc" ? (
            <>
              {author ? (
                <span className="inline-flex items-center rounded-full bg-white/55 px-2 py-0.5 ring-1 ring-white/40" title={author}>
                  Автор: {doc.createdByUserId}
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full bg-white/55 px-2 py-0.5 ring-1 ring-white/40">{updated}</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center rounded-full bg-white/55 px-2 py-0.5 ring-1 ring-white/40">{sizeLabel}</span>
              <span className="inline-flex items-center rounded-full bg-white/55 px-2 py-0.5 ring-1 ring-white/40">{updated}</span>
            </>
          )}
        </div>
      </div>

      <div className="absolute right-2 bottom-2 z-[2]">
        <button
          type="button"
          className="ed-doc-btn-ghost px-2 py-1 text-xs"
          title="Меню"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e);
          }}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}

export function DocumentsFoldersPage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const user = auth.user;
  const canUploadRoutes = canManageDocumentUploadRoutes(user ?? undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ sectionId?: string; folderId?: string }>();
  const routeSectionId = params.sectionId ?? null;
  const routeFolderId = params.folderId ?? null;
  const isDocumentsRoot =
    location.pathname === "/documents" || location.pathname === "/documents/";
  const focusedDocumentId = useMemo(() => new URLSearchParams(location.search).get("documentId"), [location.search]);

  const [sections, setSections] = useState<Section[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [journalDocTypes, setJournalDocTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [quarters, setQuarters] = useState<Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>>([]);
  const [chatUsers, setChatUsers] = useState<Array<{ id: string; fio: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [sectionsPanelCollapsed, setSectionsPanelCollapsed] = useState(false);
  const [foldersPanelCollapsed, setFoldersPanelCollapsed] = useState(false);
  const [shareTarget, setShareTarget] = useState<null | { title: string; link: string }>(null);
  const [shareUsers, setShareUsers] = useState<string[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({ [ROOT_TREE]: true });
  const [treeCollapsed, setTreeCollapsed] = useState<boolean>(() => loadTreeCollapsed());

  const [unlockedFolderIds, setUnlockedFolderIds] = useState<Set<string>>(() => new Set());
  const [unlockedSectionIds, setUnlockedSectionIds] = useState<Set<string>>(() => new Set());

  const isFolderUnlocked = useCallback((folderId: string) => unlockedFolderIds.has(folderId), [unlockedFolderIds]);
  const isSectionUnlocked = useCallback((sectionId: string) => unlockedSectionIds.has(sectionId), [unlockedSectionIds]);
  useEffect(() => {
    // При смене пользователя сбрасываем разблокировки.
    setUnlockedFolderIds(new Set());
    setUnlockedSectionIds(new Set());
  }, [user?.id]);

  // Чтобы модалка пароля, открытая по роуту, не перезапускалась сразу после ручного “Отмена”.
  const [dismissedRouteUnlockFolderIds, setDismissedRouteUnlockFolderIds] = useState<Set<string>>(() => new Set());
  const [dismissedRouteUnlockSectionIds, setDismissedRouteUnlockSectionIds] = useState<Set<string>>(() => new Set());

  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; kind: "root" | "section" | "folder"; id?: string }>(null);
  const [renameTarget, setRenameTarget] = useState<null | { kind: "section" | "folder"; id: string; name: string }>(null);
  const [infoFolderId, setInfoFolderId] = useState<string | null>(null);
  const [folderMeta, setFolderMeta] = useState<Record<string, FolderMeta>>(() => loadFolderMeta());
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionSlideDir, setSectionSlideDir] = useState<-1 | 0 | 1>(0);
  const [sectionSliding, setSectionSliding] = useState(false);
  /** На главном /documents: открытое ниже содержимое раздела */
  const [openedSectionId, setOpenedSectionId] = useState<string | null>(null);
  const [addToSectionModal, setAddToSectionModal] = useState<
    null | { mode: "confirm"; sectionId: string; folderIds: string[] } | { mode: "pick"; folderIds: string[] }
  >(null);
  const [addDocsToFolderModal, setAddDocsToFolderModal] = useState<null | { documentIds: string[] }>(null);
  const [fileErrorTarget, setFileErrorTarget] = useState<null | { title: string; url: string }>(null);
  const [docPreview, setDocPreview] = useState<
    null | { doc: Doc; busy: boolean; objectUrl: string | null; mimeType: string; canDownloadFallback: boolean }
  >(null);
  const [docPreviewTab, setDocPreviewTab] = useState<"preview" | "comments" | "bindings">("preview");
  const [docComments, setDocComments] = useState<Array<{ id: string; authorId: string; createdAt: string; body: string }>>([]);
  const [docCommentsBusy, setDocCommentsBusy] = useState(false);
  const [docCommentsDraft, setDocCommentsDraft] = useState("");
  const [docBindings, setDocBindings] = useState<Array<{ id: string; type: string; refId: string; createdAt: string }>>([]);
  const [docBindingsBusy, setDocBindingsBusy] = useState(false);
  const [docBindingTypeDraft, setDocBindingTypeDraft] = useState<string>("lesson");
  const [docBindingRefIdDraft, setDocBindingRefIdDraft] = useState<string>("");
  const [hoveredFolder, setHoveredFolder] = useState<null | { folderId: string; x: number; y: number }>(null);
  const [trashDocs, setTrashDocs] = useState<Doc[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const [docMenu, setDocMenu] = useState<null | { x: number; y: number; doc: Doc }>(null);
  const [riviDocModal, setRiviDocModal] = useState<null | { doc: Doc; selectedSpaceIds: string[] }>(null);
  const [docRename, setDocRename] = useState<null | { id: string; name: string }>(null);
  const [moveDocModal, setMoveDocModal] = useState<null | { doc: Doc }>(null);
  const [copyDocModal, setCopyDocModal] = useState<null | { doc: Doc }>(null);
  const [moveFolderModal, setMoveFolderModal] = useState<null | { folder: Folder }>(null);
  const [shareDocModal, setShareDocModal] = useState<null | { title: string; link: string; docId: string }>(null);
  const [accessFolderModal, setAccessFolderModal] = useState<
    null | {
      folder: Folder;
      draft: {
        accessType: "private" | "org" | "selected";
        selectedUserIds: string[];
        selectedRoleIds: string[];
        hasPassword: boolean;
        passwordInput: string;
      };
    }
  >(null);
  const [accessUserSearch, setAccessUserSearch] = useState("");
  const [folderUnlockModal, setFolderUnlockModal] = useState<
    null | { folder: Folder; password: string; busy: boolean; error: string | null; origin: "route" | "click" }
  >(null);
  const [sectionUnlockModal, setSectionUnlockModal] = useState<
    null | {
      section: Section;
      password: string;
      busy: boolean;
      error: string | null;
      origin: "route" | "click";
      nextFolderId?: string;
    }
  >(null);
  const [accessSectionModal, setAccessSectionModal] = useState<
    null | { section: Section; draft: { hasPassword: boolean; passwordInput: string } }
  >(null);
  const [versionsModal, setVersionsModal] = useState<null | { title: string; docId: string }>(null);
  const [docVersions, setDocVersions] = useState<Array<any>>([]);
  const [docVersionsBusy, setDocVersionsBusy] = useState(false);
  const [docVersionsError, setDocVersionsError] = useState<string | null>(null);
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const [newVersionComment, setNewVersionComment] = useState("");
  const [newVersionUploading, setNewVersionUploading] = useState(false);
  const [pendingLinkAccess, setPendingLinkAccess] = useState<"view" | "full">("view");
  const [publicLinks, setPublicLinks] = useState<Array<{ id: string; mode: "view" | "full"; createdAt: string }>>([]);
  const [folderViewMode, setFolderViewMode] = useState<FolderViewMode>("date");
  const [folderPeriodMode, setFolderPeriodMode] = useState<FolderPeriodMode>("academicYear");
  const [folderPeriodFrom, setFolderPeriodFrom] = useState("");
  const [folderPeriodTo, setFolderPeriodTo] = useState("");
  const [isFolderModeTransitioning, setIsFolderModeTransitioning] = useState(false);

  const rootUploadRef = useRef<HTMLInputElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const r = await api.documentsTree(token);
    setSections(r.sections as Section[]);
    setFolders(r.folders as Folder[]);
    setDocuments(r.documents as Doc[]);
  }, [token]);

  const refreshTrash = useCallback(async () => {
    try {
      const r = await api.documentsTrash(token);
      setTrashDocs((r.documents ?? []) as Doc[]);
    } catch {
      setTrashDocs([]);
    }
  }, [token]);

  useEffect(() => {
    void refresh().catch((e) => setError((e as Error).message));
    void api.chatsUsers(token).then((r) => setChatUsers((r.users ?? []).map((u) => ({ id: u.id, fio: u.fio }))));
    void api
      .methospaceJournalDocumentTypes(token)
      .then((r) => setJournalDocTypes((r.types ?? []).map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setJournalDocTypes([]));
    void api
      .methospaceQuarters(token)
      .then((r) => setQuarters((r.quarters ?? []) as Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>))
      .catch(() => setQuarters([]));
    void refreshTrash();
  }, [refresh, refreshTrash, token]);

  useEffect(() => {
    setIsFolderModeTransitioning(true);
    const t = window.setTimeout(() => setIsFolderModeTransitioning(false), 180);
    return () => window.clearTimeout(t);
  }, [folderViewMode]);

  useEffect(() => {
    const st = location.state as { openSectionId?: string } | null | undefined;
    if (st && typeof st === "object" && st.openSectionId) {
      setOpenedSectionId(st.openSectionId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.key, location.pathname, navigate]);

  useEffect(() => {
    localStorage.setItem("documents.folderMeta", JSON.stringify(folderMeta));
  }, [folderMeta]);

  useEffect(() => {
    localStorage.setItem("documents.treeCollapsed", treeCollapsed ? "1" : "0");
  }, [treeCollapsed]);

  useEffect(() => {
    const close = () => {
      setCtxMenu(null);
      setDocMenu(null);
    };
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("click", close);
      if (hoverOpenTimerRef.current) window.clearTimeout(hoverOpenTimerRef.current);
      if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!docPreview) return;
    setDocPreviewTab("preview");
    setDocComments([]);
    setDocCommentsDraft("");
    setDocBindings([]);
    setDocBindingTypeDraft("lesson");
    setDocBindingRefIdDraft("");
  }, [docPreview?.doc.id]);

  useEffect(() => {
    if (!versionsModal) {
      setDocVersions([]);
      setDocVersionsBusy(false);
      setDocVersionsError(null);
      setNewVersionFile(null);
      setNewVersionComment("");
      setNewVersionUploading(false);
      return;
    }

    let cancelled = false;
    setDocVersionsBusy(true);
    setDocVersionsError(null);
    void (async () => {
      try {
        const r = await api.documentVersions.list(token, versionsModal.docId);
        if (cancelled) return;
        setDocVersions(r.versions ?? []);
      } catch (e) {
        if (cancelled) return;
        setDocVersionsError(e instanceof Error ? e.message : "VERSIONS_LOAD_FAILED");
      } finally {
        if (cancelled) return;
        setDocVersionsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [versionsModal?.docId, token]);

  useEffect(() => {
    if (!docPreview || docPreviewTab !== "comments") return;
    setDocCommentsBusy(true);
    setDocComments([]);
    void (async () => {
      try {
        const r = await api.documentComments.list(token, docPreview.doc.id);
        setDocComments(r.comments ?? []);
      } catch {
        // keep empty list on error (UI can be enhanced later)
      } finally {
        setDocCommentsBusy(false);
      }
    })();
  }, [docPreview?.doc.id, docPreviewTab, token]);

  useEffect(() => {
    if (!docPreview || docPreviewTab !== "bindings") return;
    setDocBindingsBusy(true);
    setDocBindings([]);
    void (async () => {
      try {
        const r = await api.documentBindings.list(token, docPreview.doc.id);
        setDocBindings(r.bindings ?? []);
      } catch {
        // keep empty list on error (UI can be enhanced later)
      } finally {
        setDocBindingsBusy(false);
      }
    })();
  }, [docPreview?.doc.id, docPreviewTab, token]);

  useEffect(() => {
    if (!trashOpen) return;
    void refreshTrash();
  }, [trashOpen, refreshTrash]);

  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f] as const)), [folders]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s] as const)), [sections]);
  const docsByFolder = useMemo(() => {
    const m = new Map<string, Doc[]>();
    for (const d of documents) {
      if (!d.folderId) continue;
      const arr = m.get(d.folderId) ?? [];
      arr.push(d);
      m.set(d.folderId, arr);
    }
    return m;
  }, [documents]);
  const foldersByParent = useMemo(() => {
    const m = new Map<string | null, Folder[]>();
    for (const f of folders) {
      const key = f.parentFolderId ?? null;
      const arr = m.get(key) ?? [];
      arr.push(f);
      m.set(key, arr);
    }
    return m;
  }, [folders]);

  const currentFolder = routeFolderId ? foldersById.get(routeFolderId) ?? null : null;
  /** Дочерние папки (в т.ч. «Название N класс» внутри корня дисциплины). */
  const currentFolderChildren = useMemo(() => {
    if (!currentFolder) return [];
    const list = foldersByParent.get(currentFolder.id) ?? [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [currentFolder, foldersByParent]);
  const isLockedFolder = useCallback((folder: Folder | null | undefined) => Boolean(folder?.disciplineId), []);
  const canUseDocTypeMode = Boolean(currentFolder?.disciplineId);
  const knownDocTypeIds = useMemo(() => new Set(journalDocTypes.map((x) => x.id)), [journalDocTypes]);
  const docTypeNameById = useMemo(() => new Map(journalDocTypes.map((x) => [x.id, x.name] as const)), [journalDocTypes]);
  const currentQuarter = useMemo(() => {
    const now = new Date();
    return quarters.find((q) => {
      const from = new Date(q.startDate);
      const to = new Date(q.endDate);
      return !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && now >= from && now <= to;
    }) ?? null;
  }, [quarters]);

  useEffect(() => {
    if (!routeFolderId) return;
    const f = foldersById.get(routeFolderId);
    if (!f) return;
    if (f.sectionId && f.sectionId !== routeSectionId) {
      navigate(`/documents/section/${encodeURIComponent(f.sectionId)}/folder/${encodeURIComponent(f.id)}`, { replace: true });
    }
    if (!f.sectionId && routeSectionId) {
      navigate(`/documents/folder/${encodeURIComponent(f.id)}`, { replace: true });
    }
  }, [foldersById, navigate, routeFolderId, routeSectionId]);

  // Если папка требует пароль — показываем модалку при входе на её роут.
  useEffect(() => {
    if (!currentFolder) return;
    // Не просим 2 пароля подряд: если у папки есть свой пароль, приоритет у него.
    if (currentFolder.passwordProtected) {
      if (isFolderUnlocked(currentFolder.id)) return;
      if (dismissedRouteUnlockFolderIds.has(currentFolder.id)) return;
      if (folderUnlockModal?.folder.id === currentFolder.id) return;
      setFolderUnlockModal({ folder: currentFolder, password: "", busy: false, error: null, origin: "route" });
      return;
    }
    if (currentFolder.sectionId) {
      const parentSection = sectionById.get(currentFolder.sectionId);
      if (
        parentSection?.passwordProtected &&
        !isSectionUnlocked(parentSection.id) &&
        !dismissedRouteUnlockSectionIds.has(parentSection.id) &&
        sectionUnlockModal?.section.id !== parentSection.id
      ) {
        setSectionUnlockModal({ section: parentSection, password: "", busy: false, error: null, origin: "route", nextFolderId: currentFolder.id });
        return;
      }
    }
    if (!currentFolder.passwordProtected) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentFolder?.id,
    currentFolder?.passwordProtected,
    currentFolder?.sectionId,
    isFolderUnlocked,
    isSectionUnlocked,
    dismissedRouteUnlockFolderIds,
    dismissedRouteUnlockSectionIds,
    sectionById,
  ]);

  useEffect(() => {
    if (!routeSectionId) return;
    const section = sectionById.get(routeSectionId);
    if (!section?.passwordProtected) return;
    if (isSectionUnlocked(section.id)) return;
    if (dismissedRouteUnlockSectionIds.has(section.id)) return;
    if (sectionUnlockModal?.section.id === section.id) return;
    setSectionUnlockModal({ section, password: "", busy: false, error: null, origin: "route" });
  }, [routeSectionId, sectionById, isSectionUnlocked, dismissedRouteUnlockSectionIds, sectionUnlockModal?.section.id]);

  const rootDocs = useMemo(
    () => documents.filter((d) => !d.sectionId && !d.folderId),
    [documents],
  );
  const looseFolders = useMemo(
    () => folders.filter((f) => !f.sectionId && !f.parentFolderId),
    [folders],
  );
  const sectionFoldersTop = useCallback((sectionId: string) => folders.filter((f) => f.sectionId === sectionId && !f.parentFolderId), [folders]);
  const folderDocs = useCallback((folderId: string) => docsByFolder.get(folderId) ?? [], [docsByFolder]);
  const sectionLooseDocs = useCallback((sectionId: string) => documents.filter((d) => d.sectionId === sectionId && !d.folderId), [documents]);
  const folderTreeDocs = useCallback((folderId: string) => {
    const ids = new Set<string>();
    const stack = [folderId];
    while (stack.length) {
      const id = stack.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      for (const child of foldersByParent.get(id) ?? []) stack.push(child.id);
    }
    return documents.filter((d) => d.folderId && ids.has(d.folderId));
  }, [documents, foldersByParent]);
  const currentFolderTypeGroups = useMemo(() => {
    if (!currentFolder || !canUseDocTypeMode) return [];
    const docs = folderTreeDocs(currentFolder.id);
    const filtered = docs.filter((doc) => {
      if (folderViewMode !== "docType") return true;
      const when = doc.tags?.journalTrace?.lessonDateIso ?? doc.createdAt;
      if (folderPeriodMode === "academicYear") return inCurrentAcademicYear(when);
      if (folderPeriodMode === "currentQuarter") {
        if (!currentQuarter) return true;
        const d = new Date(when);
        const from = new Date(currentQuarter.startDate);
        const to = new Date(currentQuarter.endDate);
        return !Number.isNaN(d.getTime()) && d >= from && d <= to;
      }
      if (!folderPeriodFrom || !folderPeriodTo) return true;
      const d = new Date(when);
      const from = new Date(folderPeriodFrom);
      const to = new Date(folderPeriodTo);
      return !Number.isNaN(d.getTime()) && d >= from && d <= to;
    });
    const map = new Map<string, Doc[]>();
    for (const doc of filtered) {
      const docTypeId = inferDocTypeIdFromTags(doc, knownDocTypeIds);
      const key = docTypeId ? (docTypeNameById.get(docTypeId) ?? "Неизвестный тип") : "Без типа";
      const arr = map.get(key) ?? [];
      arr.push(doc);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([name, docsByType]) => ({
        name,
        docs: docsByType.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [
    currentFolder,
    canUseDocTypeMode,
    folderTreeDocs,
    folderViewMode,
    folderPeriodMode,
    folderPeriodFrom,
    folderPeriodTo,
    currentQuarter,
    knownDocTypeIds,
    docTypeNameById,
  ]);

  const goRoot = () => navigate("/documents");
  const goSection = (id: string, origin: "click" | "route" = "click") => {
    const section = sectionById.get(id);
    if (section?.passwordProtected && !isSectionUnlocked(id)) {
      setDismissedRouteUnlockSectionIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSectionUnlockModal({ section, password: "", busy: false, error: null, origin });
      return;
    }
    if (origin === "click") navigate(`/documents/section/${encodeURIComponent(id)}`);
  };
  const navigateToFolder = (f: Folder) => {
    if (f.sectionId) navigate(`/documents/section/${encodeURIComponent(f.sectionId)}/folder/${encodeURIComponent(f.id)}`);
    else navigate(`/documents/folder/${encodeURIComponent(f.id)}`);
  };

  const openFolder = (f: Folder, origin: "click" | "route" = "click") => {
    if (f.passwordProtected && !isFolderUnlocked(f.id)) {
      // Если пользователь ранее отменял ввод пароля на этом роуте — сбрасываем.
      setDismissedRouteUnlockFolderIds((prev) => {
        const next = new Set(prev);
        next.delete(f.id);
        return next;
      });
      setFolderUnlockModal({ folder: f, password: "", busy: false, error: null, origin });
      return;
    }
    if (f.sectionId) {
      const section = sectionById.get(f.sectionId);
      if (section?.passwordProtected && !isSectionUnlocked(section.id)) {
        setDismissedRouteUnlockSectionIds((prev) => {
          const next = new Set(prev);
          next.delete(section.id);
          return next;
        });
        setSectionUnlockModal({ section, password: "", busy: false, error: null, origin, nextFolderId: f.id });
        return;
      }
    }
    if (origin === "click") navigateToFolder(f);
  };

  const toggleExpand = (id: string) => setTreeExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  const openShare = (title: string, link: string) => {
    setShareUsers([]);
    setShareTarget({ title, link });
  };
  const openDocument = async (doc: Doc) => {
    const url = fileUrl(doc);
    setDocPreview((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { doc, busy: true, objectUrl: null, mimeType: doc.mimeType ?? "application/octet-stream", canDownloadFallback: false };
    });
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("FILE_NOT_AVAILABLE");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const mimeType = blob.type || doc.mimeType || "application/octet-stream";
      setDocPreview({ doc, busy: false, objectUrl, mimeType, canDownloadFallback: true });
    } catch {
      setDocPreview(null);
      setFileErrorTarget({ title: docName(doc), url });
    }
  };
  const scheduleFolderPopover = (folderId: string, el: HTMLElement) => {
    if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
    if (hoverOpenTimerRef.current) window.clearTimeout(hoverOpenTimerRef.current);
    const rect = el.getBoundingClientRect();
    hoverOpenTimerRef.current = window.setTimeout(() => {
      setHoveredFolder({
        folderId,
        x: Math.min(rect.right + 12, window.innerWidth - 360),
        y: Math.max(90, Math.min(rect.top, window.innerHeight - 260)),
      });
    }, 240);
  };
  const scheduleHideFolderPopover = () => {
    if (hoverOpenTimerRef.current) window.clearTimeout(hoverOpenTimerRef.current);
    if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = window.setTimeout(() => setHoveredFolder(null), 120);
  };

  useEffect(() => {
    if (!hoveredFolder) return;
    const onFirstMove = () => setHoveredFolder(null);
    window.addEventListener("mousemove", onFirstMove, { once: true });
    return () => window.removeEventListener("mousemove", onFirstMove);
  }, [hoveredFolder]);

  useEffect(() => {
    if (!hoveredFolder) return;
    const onAnyClick = () => setHoveredFolder(null);
    window.addEventListener("click", onAnyClick, true);
    return () => window.removeEventListener("click", onAnyClick, true);
  }, [hoveredFolder]);

  useEffect(() => {
    if (!docPreview?.objectUrl) return;
    return () => {
      URL.revokeObjectURL(docPreview.objectUrl!);
    };
  }, [docPreview?.objectUrl]);

  const createFolder = async (args: { sectionId?: string | null; parentFolderId?: string | null }) => {
    const name = window.prompt("Название папки");
    if (!name?.trim()) return null;
    const purpose = window.prompt("Назначение папки (опционально)");
    const created = await api.createDocumentFolder(token, { name: name.trim(), sectionId: args.sectionId ?? null, parentFolderId: args.parentFolderId ?? null });
    if (purpose?.trim()) {
      setFolderMeta((prev) => ({ ...prev, [created.folder.id]: { purpose: purpose.trim() } }));
    }
    await refresh();
    return created.folder as Folder;
  };

  const createSection = async () => {
    const name = window.prompt("Название раздела");
    if (!name?.trim()) return;
    await api.createDocumentSection(token, name.trim());
    await refresh();
  };

  const uploadDocument = async (file: File, args: { sectionId?: string | null; folderId?: string | null }) => {
    await api.uploadDocument(token, { file, sectionId: args.sectionId ?? null, folderId: args.folderId ?? null });
    await refresh();
  };

  const mergeSelectedDocuments = async (sectionId: string | null, parentFolderId: string | null) => {
    const ids = [...selectedDocIds];
    if (ids.length < 2) return;
    const created = await createFolder({ sectionId, parentFolderId });
    if (!created) return;
    await api.moveDocumentsToFolder(token, { documentIds: ids, targetFolderId: created.id });
    setSelectedDocIds(new Set());
    await refresh();
    openFolder(created);
  };

  const mergeSelectedFolders = async () => {
    const ids = [...selectedFolderIds];
    if (ids.length < 2) return;
    const list = ids.map((id) => foldersById.get(id)).filter(Boolean) as Folder[];
    const first = list[0];
    const sameLevel = list.every((f) => f.sectionId === first.sectionId && f.parentFolderId === first.parentFolderId);
    if (!sameLevel) {
      setError("Выберите папки одного уровня.");
      return;
    }
    const name = window.prompt("Название нового раздела");
    if (!name?.trim()) return;
    await api.mergeFoldersToSection(token, { folderIds: ids, name: name.trim() });
    setSelectedFolderIds(new Set());
    await refresh();
  };

  const deleteFolder = async (f: Folder) => {
    if (!window.confirm(`Вы действительно хотите удалить «${f.name}»? Это действие нельзя отменить.`)) return;
    setSelectedFolderIds(new Set());
    await api.deleteDocumentFolder(token, f.id);
    await refresh();
    if (routeFolderId === f.id) {
      if (f.parentFolderId && foldersById.get(f.parentFolderId)) {
        openFolder(foldersById.get(f.parentFolderId)!);
      } else if (f.sectionId) {
        goSection(f.sectionId);
      } else {
        goRoot();
      }
    }
  };

  const deleteSection = async (id: string) => {
    const sectionName = sectionById.get(id)?.name ?? "раздел";
    if (!window.confirm(`Вы действительно хотите удалить «${sectionName}»? Это действие нельзя отменить.`)) return;
    await api.deleteDocumentSection(token, id);
    await refresh();
    if (routeSectionId === id) goRoot();
  };

  const commitRename = async () => {
    if (!renameTarget) return;
    const name = renameTarget.name.trim();
    if (!name) return;
    if (renameTarget.kind === "section") await api.patchDocumentSection(token, renameTarget.id, { name });
    else await api.patchDocumentFolder(token, renameTarget.id, { name });
    setRenameTarget(null);
    await refresh();
  };

  const renderTreeFolders = (sectionId: string | null, parentId: string | null, depth: number): ReactNode[] => {
    const list = folders.filter((f) => (f.sectionId ?? null) === sectionId && (f.parentFolderId ?? null) === parentId);
    return list.map((f) => {
      const key = `f:${f.id}`;
      const expanded = treeExpanded[key] ?? true;
      return (
        <div key={f.id}>
          <div
            className="ed-doc-tree-row flex items-center gap-1 px-1 py-0.5"
            style={{ paddingLeft: 8 + depth * 10 }}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, kind: "folder", id: f.id });
            }}
          >
            <button type="button" className="w-4 text-slate-500" onClick={() => toggleExpand(key)}>
              {expanded ? "▼" : "▶"}
            </button>
            <button type="button" className="truncate text-left text-sm" onClick={() => openFolder(f)}>
              📁 {f.name}
            </button>
            <button type="button" className="ml-auto text-slate-400" onClick={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, kind: "folder", id: f.id })}>
              ⋯
            </button>
          </div>
          {expanded ? <div>{renderTreeFolders(sectionId, f.id, depth + 1)}</div> : null}
        </div>
      );
    });
  };

  const folderInfo = currentFolder
    ? {
        createdAt: currentFolder.createdAt ? new Date(currentFolder.createdAt).toLocaleString("ru-RU") : "н/д",
        author: "н/д",
        count: folderDocs(currentFolder.id).length,
        subfolderCount: currentFolderChildren.length,
        purpose: folderMeta[currentFolder.id]?.purpose ?? "не указано",
      }
    : null;

  useEffect(() => {
    if (routeSectionId) {
      const idx = sections.findIndex((s) => s.id === routeSectionId);
      if (idx >= 0) setSectionIndex(idx);
    }
  }, [routeSectionId, sections]);

  const sectionsCount = sections.length;
  const normalizedIndex = sectionsCount ? ((sectionIndex % sectionsCount) + sectionsCount) % sectionsCount : 0;
  const currentSection = sectionsCount ? sections[normalizedIndex]! : null;
  const prevSection = sectionsCount ? sections[(normalizedIndex - 1 + sectionsCount) % sectionsCount]! : null;
  const nextSection = sectionsCount ? sections[(normalizedIndex + 1) % sectionsCount]! : null;

  const slideSection = (dir: -1 | 1) => {
    if (sectionsCount < 2 || sectionSliding) return;
    setSectionSlideDir(dir);
    setSectionSliding(true);
    setOpenedSectionId(null);
    window.setTimeout(() => {
      setSectionIndex((v) => (v + dir + sectionsCount) % sectionsCount);
      setSectionSlideDir(0);
      setSectionSliding(false);
    }, 240);
  };

  const moveLooseFoldersToSection = async (folderIds: string[], sectionId: string) => {
    for (const id of folderIds) {
      await api.patchDocumentFolder(token, id, { sectionId, parentFolderId: null });
    }
    setSelectedFolderIds(new Set());
    await refresh();
  };

  const openAddToSectionFlow = () => {
    const ids = [...selectedFolderIds];
    if (ids.length === 0) return;
    if (currentSection) {
      setAddToSectionModal({ mode: "confirm", sectionId: currentSection.id, folderIds: ids });
    } else if (sectionsCount > 0) {
      setAddToSectionModal({ mode: "pick", folderIds: ids });
    } else {
      setError("Сначала создайте раздел.");
    }
  };

  const dashboardView = !routeFolderId && !routeSectionId ? (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        {!foldersPanelCollapsed ? (
        <section className={["ed-panel ed-panel-hover p-4", sectionsPanelCollapsed ? "xl:col-span-2" : ""].join(" ")}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="ed-doc-zone-badge">Отдельные папки</div>
            <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setFoldersPanelCollapsed(true)}>
              Свернуть панель
            </button>
          </div>
          {selectedFolderIds.size >= 1 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <button type="button" className="ed-doc-btn-accent" onClick={() => openAddToSectionFlow()}>
                Добавить в раздел
              </button>
            </div>
          ) : null}
          {selectedFolderIds.size >= 2 ? (
            <div className="mb-3">
              <button type="button" className="ed-doc-btn-accent" onClick={() => void mergeSelectedFolders()}>
                Объединить в раздел
              </button>
            </div>
          ) : null}
          <div
            className={[
              "grid sm:grid-cols-2 lg:grid-cols-3",
              sectionsPanelCollapsed ? "gap-2 xl:grid-cols-5" : "gap-3",
            ].join(" ")}
          >
            {looseFolders.map((f) => (
              <div
                key={f.id}
                className={["relative cursor-pointer", sectionsPanelCollapsed ? "w-full" : ""].join(" ")}
                onClick={() => openFolder(f)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, kind: "folder", id: f.id });
                }}
                onMouseEnter={(e) => scheduleFolderPopover(f.id, e.currentTarget)}
                onMouseLeave={scheduleHideFolderPopover}
              >
                <label className="absolute left-3 top-3 z-10">
                  <input
                    type="checkbox"
                    checked={selectedFolderIds.has(f.id)}
                    onChange={(e) =>
                      setSelectedFolderIds((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(f.id);
                        else n.delete(f.id);
                        return n;
                      })
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <div
                  className={[
                    "ed-doc-folder-tile relative",
                    sectionsPanelCollapsed ? "ed-doc-folder-tile--compact aspect-square px-2 pb-2 pt-7" : "px-4 pb-4 pt-10",
                  ].join(" ")}
                >
                  <div className="flex gap-3">
                    <FolderGlyph label={f.name} />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-base font-semibold leading-snug text-[#1f2933]">
                        {f.passwordProtected ? <span title="Папка с паролем">🔒 </span> : null}
                        {f.accessType && f.accessType !== "private" ? <span title="Доступ выдан">👥 </span> : null}
                        {f.name}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!isLockedFolder(f) ? (
                          <button type="button" className="ed-doc-btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); setRenameTarget({ kind: "folder", id: f.id, name: f.name }); }}>
                            ✎
                          </button>
                        ) : null}
                        <button type="button" className="ed-doc-btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); openShare(f.name, folderLink(f)); }}>
                          🔗
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={[
                "ed-doc-folder-tile ed-doc-folder-tile--dashed flex w-full flex-col items-center justify-center gap-1",
                sectionsPanelCollapsed ? "ed-doc-folder-tile--compact aspect-square px-2 pb-2 pt-7" : "min-h-[150px]",
              ].join(" ")}
              onClick={async () => { await createFolder({ sectionId: null, parentFolderId: null }); }}
            >
              <span className="text-4xl font-light">+</span>
              <span className="text-xs font-semibold text-[#6b7280]">Новая папка</span>
            </button>
          </div>
        </section>
        ) : null}

        {!sectionsPanelCollapsed ? (
        <section className={["ed-panel ed-panel-hover p-4", foldersPanelCollapsed ? "xl:col-span-2" : ""].join(" ")}>
          <div className="mb-3 flex items-center justify-between">
            <div className="ed-doc-zone-badge">Разделы</div>
            <div className="flex items-center gap-2">
              <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setSectionsPanelCollapsed(true)}>
                Свернуть панель
              </button>
              <button type="button" className="ed-doc-btn-accent" onClick={() => void createSection()}>
                + Раздел
              </button>
            </div>
          </div>
          {sectionsCount === 0 ? (
            <button type="button" className="ed-doc-folder-tile ed-doc-folder-tile--dashed flex h-[280px] w-full items-center justify-center text-6xl" onClick={() => void createSection()}>
              +
            </button>
          ) : (
            <div className="relative h-[400px] overflow-hidden">
              <button
                type="button"
                className="absolute left-2 top-1/2 z-40 -translate-y-1/2 text-2xl text-slate-700"
                onClick={() => slideSection(-1)}
              >
                ◀
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 z-40 -translate-y-1/2 text-2xl text-slate-700"
                onClick={() => slideSection(1)}
              >
                ▶
              </button>

              {[
                { section: prevSection, slot: -1 as const },
                { section: currentSection, slot: 0 as const },
                { section: nextSection, slot: 1 as const },
              ].map((item) => {
                if (!item.section) return null;
                const section = item.section;
                const animatedSlot = item.slot + (sectionSlideDir === 0 ? 0 : -sectionSlideDir);
                const isCenter = animatedSlot === 0;
                const allTop = sectionFoldersTop(section.id);
                const foldersPreview = isCenter ? allTop : allTop.slice(0, 5);
                const moreFolders = !isCenter && allTop.length > 5 ? allTop.length - 5 : 0;

                let transform = "translate(-50%, -50%) translateX(0%) scale(1)";
                let opacity = 1;
                let zIndex = 30;
                if (animatedSlot === -1) {
                  transform = "translate(-50%, -50%) translateX(-62%) scale(0.88)";
                  opacity = 0.78;
                  zIndex = 20;
                } else if (animatedSlot === 1) {
                  transform = "translate(-50%, -50%) translateX(62%) scale(0.88)";
                  opacity = 0.78;
                  zIndex = 20;
                } else if (Math.abs(animatedSlot) > 1) {
                  transform = `translate(-50%, -50%) translateX(${animatedSlot < 0 ? "-82%" : "82%"}) scale(0.8)`;
                  opacity = 0;
                  zIndex = 10;
                }

                const sectionDocTotal = documents.filter((d) => d.sectionId === section.id).length;
                return (
                  <div
                    key={`${section.id}-${item.slot}`}
                    className="ed-doc-section-kinetic-card absolute left-1/2 top-1/2 h-[360px] w-[360px] p-3"
                    style={{
                      transform,
                      opacity,
                      zIndex,
                      transition: "transform 240ms ease-out, opacity 240ms ease-out, box-shadow 240ms ease-out",
                      boxShadow: isCenter ? "0 18px 48px rgba(31,41,51,0.1), 0 0 0 1px rgba(251,191,36,0.2)" : "0 8px 24px rgba(31,41,51,0.06)",
                    }}
                    onContextMenu={(e) => {
                      if (!isCenter) return;
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, kind: "section", id: section.id });
                    }}
                    onClick={(e) => {
                      if (!isCenter) return;
                      if ((e.target as HTMLElement).closest("button")) return;
                      setOpenedSectionId(section.id);
                    }}
                  >
                    <SectionStackGlyph />
                    <div className="mb-1 text-center text-xl font-bold leading-tight text-[#1f2933]">
                      {section.passwordProtected ? "🔒 " : null}
                      {section.name}
                    </div>
                    <div className="ed-doc-section-desc">
                      {sectionFoldersTop(section.id).length} папок · {sectionDocTotal} документов
                    </div>
                    <div className={["grid overflow-y-auto pr-0.5 [scrollbar-width:thin]", isCenter ? "max-h-[200px] grid-cols-2 gap-2" : "max-h-[180px] grid-cols-3 gap-1.5"].join(" ")}>
                      {foldersPreview.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={[
                            "ed-doc-folder-tile ed-doc-folder-tile--compact font-semibold leading-tight text-[#1f2933]",
                            isCenter ? "min-h-[5.5rem] px-2 py-3 text-sm" : "min-h-[4.5rem] px-1 py-2 text-[0.65rem]",
                          ].join(" ")}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCenter) openFolder(f);
                          }}
                          onMouseEnter={(e) => scheduleFolderPopover(f.id, e.currentTarget)}
                          onMouseLeave={scheduleHideFolderPopover}
                        >
                          <FolderGlyph label={f.name} compact />
                          <span className="line-clamp-2 w-full">{f.name}</span>
                        </button>
                      ))}
                      {isCenter ? (
                        <button
                          type="button"
                          className="ed-doc-folder-tile ed-doc-folder-tile--compact min-h-[5.5rem] justify-center text-2xl font-light text-[#6b7280]"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await createFolder({ sectionId: section.id, parentFolderId: null });
                          }}
                        >
                          +
                        </button>
                      ) : (
                        <div className="ed-doc-folder-tile ed-doc-folder-tile--compact min-h-[4.5rem] justify-center text-xl text-[#9ca3af]">+</div>
                      )}
                    </div>
                    {!isCenter && moreFolders > 0 ? (
                      <div className="mt-1 text-center text-[11px] font-medium text-[#6b7280]">+ ещё {moreFolders}</div>
                    ) : null}
                    {isCenter ? (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex rounded-lg border border-white/60 bg-white/35 px-2 py-1 text-xs font-semibold text-[#374151] backdrop-blur-sm">
                          Всего: {sectionFoldersTop(section.id).length} папок
                        </div>
                        <div className="flex gap-1">
                          <button type="button" className="ed-doc-btn-ghost px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); setRenameTarget({ kind: "section", id: section.id, name: section.name }); }}>
                            ✎
                          </button>
                          <button
                            type="button"
                            className="ed-doc-btn-ghost px-2 py-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAccessSectionModal({
                                section,
                                draft: { hasPassword: Boolean(section.passwordProtected), passwordInput: "" },
                              });
                            }}
                          >
                            🔐
                          </button>
                          <button type="button" className="ed-doc-btn-ghost px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); openShare(section.name, sectionLink(section.id)); }}>
                            🔗
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        ) : null}
      </div>
      {foldersPanelCollapsed || sectionsPanelCollapsed ? (
        <div className="flex flex-wrap gap-2">
          {foldersPanelCollapsed ? (
            <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setFoldersPanelCollapsed(false)}>
              Показать панель папок
            </button>
          ) : null}
          {sectionsPanelCollapsed ? (
            <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setSectionsPanelCollapsed(false)}>
              Показать панель разделов
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="ed-panel ed-panel-hover p-4">
        <div className="ed-doc-zone-badge mb-3">Отдельные документы</div>
        {selectedDocIds.size >= 2 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className="ed-doc-btn-accent" onClick={() => void mergeSelectedDocuments(null, null)}>
              Создать папку из выбранных
            </button>
            <button type="button" className="ed-doc-btn-accent" onClick={() => setAddDocsToFolderModal({ documentIds: [...selectedDocIds] })}>
              Добавить в папку
            </button>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {rootDocs.map((d) => (
            <DocumentsFileCard
              key={d.id}
              doc={d}
              highlighted={focusedDocumentId === d.id}
              selected={selectedDocIds.has(d.id)}
              onToggleSelect={(next) =>
                setSelectedDocIds((prev) => {
                  const n = new Set(prev);
                  if (next) n.add(d.id);
                  else n.delete(d.id);
                  return n;
                })
              }
              onOpen={() => void openDocument(d)}
              onMenu={(e) => setDocMenu({ x: e.clientX, y: e.clientY, doc: d })}
            />
          ))}
          <button
            type="button"
            className="ed-doc-folder-tile ed-doc-folder-tile--dashed min-h-[180px] text-6xl"
            onClick={() => rootUploadRef.current?.click()}
          >
            +
          </button>
          <input
            ref={rootUploadRef}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              await uploadDocument(file, {});
            }}
          />
        </div>
      </section>

      {openedSectionId && sectionById.get(openedSectionId) ? (
        <section className="ed-panel ed-panel-hover p-4">
          <div className="mb-3 flex items-center gap-2">
            <BackButton onClick={() => setOpenedSectionId(null)} />
            <h3 className="text-lg font-bold text-[#1f2933]">{sectionById.get(openedSectionId)!.name}</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sectionFoldersTop(openedSectionId).map((f) => (
              <button
                key={f.id}
                type="button"
                className="ed-doc-folder-tile w-full px-4 py-5 text-left text-base font-semibold"
                onClick={() => openFolder(f)}
                onMouseEnter={(e) => scheduleFolderPopover(f.id, e.currentTarget)}
                onMouseLeave={scheduleHideFolderPopover}
              >
                <div className="flex items-start gap-3">
                  <FolderGlyph label={f.name} />
                  <span className="line-clamp-3 min-w-0 leading-snug">{f.name}</span>
                </div>
              </button>
            ))}
            <button
              type="button"
              className="ed-doc-folder-tile ed-doc-folder-tile--dashed flex min-h-[120px] flex-col items-center justify-center gap-1"
              onClick={async () => {
                await createFolder({ sectionId: openedSectionId, parentFolderId: null });
              }}
            >
              <span className="text-5xl font-light">+</span>
              <span className="text-xs font-semibold text-[#6b7280]">Новая папка</span>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  ) : null;

  const goBackFromFolder = () => {
    if (currentFolder?.sectionId) {
      navigate("/documents", { state: { openSectionId: currentFolder.sectionId } });
    } else {
      navigate("/documents");
    }
  };

  const isCurrentFolderPasswordLocked = Boolean(currentFolder?.passwordProtected && !isFolderUnlocked(currentFolder.id));

  const folderView = currentFolder && !isCurrentFolderPasswordLocked ? (
    <section className="ed-panel ed-panel-hover space-y-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <BackButton onClick={() => void goBackFromFolder()} />
      </div>
      <div className="ed-doc-folder-toolbar flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <FolderGlyph label={currentFolder.name} />
          <button
            type="button"
            className="truncate text-left text-xl font-bold uppercase tracking-wide text-[#1f2933] md:text-2xl"
            onDoubleClick={() => {
              if (!isLockedFolder(currentFolder)) setRenameTarget({ kind: "folder", id: currentFolder.id, name: currentFolder.name });
            }}
          >
            {currentFolder.name}
          </button>
        </div>
        <div className="relative shrink-0">
          <button type="button" className="ed-doc-btn-accent px-3 py-1.5 text-sm font-bold" onClick={() => setInfoFolderId((v) => (v ? null : currentFolder.id))}>
            i
          </button>
          {infoFolderId === currentFolder.id && folderInfo ? (
            <div className="ed-doc-info-popover absolute right-0 top-12 z-20 w-80 p-4 shadow-xl">
              <div className="text-base font-bold uppercase tracking-wide">Информация о папке</div>
              <div className="mt-3 text-sm text-slate-200">создана: {folderInfo.createdAt}</div>
              <div className="text-sm text-slate-200">пользователь: {folderInfo.author}</div>
              <div className="mt-3 text-sm text-slate-200">документов: {folderInfo.count}</div>
              <div className="text-sm text-slate-200">подпапок: {folderInfo.subfolderCount}</div>
              <div className="text-sm text-slate-200">назначение: {folderInfo.purpose}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => openShare(currentFolder.name, folderLink(currentFolder))}>
          🔗
        </button>
        {!isLockedFolder(currentFolder) ? (
          <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setRenameTarget({ kind: "folder", id: currentFolder.id, name: currentFolder.name })}>
            ✎
          </button>
        ) : null}
        {!isLockedFolder(currentFolder) ? (
          <button type="button" className="rounded-lg border border-rose-200 bg-rose-50/90 px-2 py-1 text-xs text-rose-700" onClick={() => void deleteFolder(currentFolder)}>
            🗑
          </button>
        ) : null}
        {selectedDocIds.size >= 2 ? (
          <button type="button" className="ed-doc-btn-accent text-xs" onClick={() => void mergeSelectedDocuments(currentFolder.sectionId ?? null, currentFolder.id)}>
            Объединить в папку
          </button>
        ) : null}
      </div>
      {canUseDocTypeMode ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">Просмотр:</span>
            <button
              type="button"
              className={["rounded-full px-3 py-1 text-xs", folderViewMode === "date" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"].join(" ")}
              onClick={() => setFolderViewMode("date")}
            >
              по дате
            </button>
            <button
              type="button"
              className={["rounded-full px-3 py-1 text-xs", folderViewMode === "docType" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"].join(" ")}
              onClick={() => setFolderViewMode("docType")}
            >
              по типу документов
            </button>
            <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">Режим: {folderViewMode === "date" ? "по дате" : "по типу документов"}</span>
          </div>
          {folderViewMode === "docType" ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600">
                Период
                <select
                  value={folderPeriodMode}
                  onChange={(e) => setFolderPeriodMode(e.target.value as FolderPeriodMode)}
                  className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="academicYear">весь учебный год</option>
                  <option value="currentQuarter">текущая четверть</option>
                  <option value="custom">задать даты</option>
                </select>
              </label>
              {folderPeriodMode === "custom" ? (
                <>
                  <label className="text-xs text-slate-600">
                    c
                    <input type="date" value={folderPeriodFrom} onChange={(e) => setFolderPeriodFrom(e.target.value)} className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
                  </label>
                  <label className="text-xs text-slate-600">
                    по
                    <input type="date" value={folderPeriodTo} onChange={(e) => setFolderPeriodTo(e.target.value)} className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={["transition-opacity duration-200", isFolderModeTransitioning ? "opacity-70" : "opacity-100"].join(" ")}>
      {folderViewMode === "date" && currentFolderChildren.length > 0 ? (
        <div>
          <div className="mb-2 text-sm font-semibold text-[#374151]">Подпапки</div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currentFolderChildren.map((f) => (
              <button
                key={f.id}
                type="button"
                className="ed-doc-folder-tile w-full px-4 py-5 text-left text-base font-semibold leading-snug"
                onClick={() => openFolder(f)}
                onMouseEnter={(e) => scheduleFolderPopover(f.id, e.currentTarget)}
                onMouseLeave={scheduleHideFolderPopover}
              >
                <div className="flex items-start gap-3">
                  <FolderGlyph label={f.name} />
                  <span className="line-clamp-3 min-w-0">
                    {f.passwordProtected ? <span title="Папка с паролем">🔒 </span> : null}
                    {f.accessType && f.accessType !== "private" ? <span title="Доступ выдан">👥 </span> : null}
                    {f.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {folderViewMode === "docType" ? (
        <div className="mb-4">
          <div className="mb-2 text-sm font-semibold text-[#374151]">Папки по типам документов</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {currentFolderTypeGroups.map((group) => (
              <div key={group.name} className="flex min-h-56 flex-col rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm" aria-hidden>
                      📁
                    </div>
                    <div className="line-clamp-2 text-xs font-semibold text-slate-800">{group.name}</div>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{group.docs.length}</span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">документов</div>
                <div className="mt-3 space-y-2">
                  {group.docs.map((d) => (
                    <button key={d.id} type="button" onClick={() => void openDocument(d)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50">
                      <div className="line-clamp-1 font-medium text-slate-900">{docName(d)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{new Date(d.createdAt).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {currentFolderTypeGroups.length === 0 ? <div className="text-sm text-slate-500">В выбранном периоде нет документов по типам.</div> : null}
          </div>
        </div>
      ) : null}
      </div>

      {folderViewMode === "date" ? (
        <>
          <div className="mb-2 text-sm font-semibold text-[#374151]">Документы в этой папке</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {folderDocs(currentFolder.id).map((d) => (
              <DocumentsFileCard
                key={d.id}
                doc={d}
                highlighted={focusedDocumentId === d.id}
                selected={selectedDocIds.has(d.id)}
                onToggleSelect={(next) =>
                  setSelectedDocIds((prev) => {
                    const n = new Set(prev);
                    if (next) n.add(d.id);
                    else n.delete(d.id);
                    return n;
                  })
                }
                onOpen={() => void openDocument(d)}
                onMenu={(e) => setDocMenu({ x: e.clientX, y: e.clientY, doc: d })}
              />
            ))}
            <button type="button" className="ed-doc-folder-tile ed-doc-folder-tile--dashed min-h-[160px] text-6xl" onClick={() => folderUploadRef.current?.click()}>
              +
            </button>
            <input
              ref={folderUploadRef}
              type="file"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                await uploadDocument(file, { sectionId: currentFolder.sectionId, folderId: currentFolder.id });
              }}
            />
          </div>
        </>
      ) : null}
    </section>
  ) : null;

  const sectionDetail = routeSectionId && !routeFolderId ? (
    <section className="ed-panel ed-panel-hover space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <BackButton onClick={() => navigate("/documents")} />
          <h3 className="truncate text-xl font-bold text-[#1f2933]">
            {sectionById.get(routeSectionId)?.passwordProtected ? "🔒 " : null}
            {sectionById.get(routeSectionId)?.name ?? "Раздел"}
          </h3>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => openShare(sectionById.get(routeSectionId)?.name ?? "Раздел", sectionLink(routeSectionId))}>
            🔗
          </button>
          <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setRenameTarget({ kind: "section", id: routeSectionId, name: sectionById.get(routeSectionId)?.name ?? "" })}>
            ✎
          </button>
          <button
            type="button"
            className="ed-doc-btn-ghost text-xs"
            onClick={() => {
              const section = sectionById.get(routeSectionId);
              if (!section) return;
              setAccessSectionModal({
                section,
                draft: { hasPassword: Boolean(section.passwordProtected), passwordInput: "" },
              });
            }}
          >
            🔐
          </button>
          <button type="button" className="rounded-lg border border-rose-200 bg-rose-50/90 px-2 py-1 text-xs text-rose-700" onClick={() => void deleteSection(routeSectionId)}>
            🗑
          </button>
        </div>
      </div>
      {selectedFolderIds.size >= 2 ? (
        <button type="button" className="ed-doc-btn-accent text-sm" onClick={() => void mergeSelectedFolders()}>
          Объединить выбранные папки в раздел
        </button>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sectionFoldersTop(routeSectionId).map((f) => (
          <div key={f.id} className="ed-doc-folder-tile relative p-3 pl-3 pt-10" onMouseEnter={(e) => scheduleFolderPopover(f.id, e.currentTarget)} onMouseLeave={scheduleHideFolderPopover}>
            <label className="absolute left-3 top-3 z-10">
              <input
                type="checkbox"
                checked={selectedFolderIds.has(f.id)}
                onChange={(e) =>
                  setSelectedFolderIds((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(f.id);
                    else n.delete(f.id);
                    return n;
                  })
                }
              />
            </label>
            <div className="flex gap-3">
              <FolderGlyph label={f.name} />
              <div className="min-w-0 flex-1">
                <button type="button" className="line-clamp-2 text-left text-base font-semibold text-[#1f2933]" onClick={() => openFolder(f)}>
                  {f.passwordProtected ? <span title="Папка с паролем">🔒 </span> : null}
                  {f.accessType && f.accessType !== "private" ? <span title="Доступ выдан">👥 </span> : null}
                  {f.name}
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!isLockedFolder(f) ? (
                    <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => setRenameTarget({ kind: "folder", id: f.id, name: f.name })}>
                      ✎
                    </button>
                  ) : null}
                  <button type="button" className="ed-doc-btn-ghost text-xs" onClick={() => openShare(f.name, folderLink(f))}>
                    🔗
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="ed-doc-folder-tile ed-doc-folder-tile--dashed flex min-h-[140px] flex-col items-center justify-center gap-1"
          onClick={async () => {
            await createFolder({ sectionId: routeSectionId, parentFolderId: null });
          }}
        >
          <span className="text-5xl font-light">+</span>
          <span className="text-xs font-semibold text-[#6b7280]">Новая папка</span>
        </button>
      </div>
      <div className="rounded-xl border border-white/60 bg-white/30 px-4 py-3 text-sm text-[#6b7280] backdrop-blur-sm">
        Документы без папки: {sectionLooseDocs(routeSectionId).length}
      </div>
    </section>
  ) : null;

  return (
    <div className="ed-documents-ui relative flex gap-4">
      {treeCollapsed ? (
        <button
          type="button"
          className="sticky left-0 top-3 z-30 h-10 w-10 shrink-0 rounded-xl border border-white/60 bg-white/35 text-lg shadow-sm backdrop-blur-md transition hover:border-amber-300/50"
          title="Развернуть дерево"
          onClick={() => setTreeCollapsed(false)}
        >
          🗂
        </button>
      ) : (
      <aside className="ed-documents-ui-tree w-60 shrink-0 rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Дерево</div>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs" onClick={() => setTreeCollapsed(true)}>
            Свернуть
          </button>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-1">
            <button type="button" className="w-4 text-slate-500" onClick={() => toggleExpand(ROOT_TREE)}>
              {(treeExpanded[ROOT_TREE] ?? true) ? "▼" : "▶"}
            </button>
            <button type="button" className="font-medium hover:underline" onClick={goRoot}>Документы</button>
            <button type="button" className="ml-auto text-slate-400" onClick={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, kind: "root" })}>⋯</button>
          </div>
          {(treeExpanded[ROOT_TREE] ?? true) ? (
            <div className="ml-3 space-y-1 border-l border-slate-100 pl-1">
              {renderTreeFolders(null, null, 0)}
              {rootDocs.map((d) => <div key={d.id} className="truncate text-xs text-slate-600">📄 {docName(d)}</div>)}
            </div>
          ) : null}
          {sections.map((s) => {
            const key = `s:${s.id}`;
            const expanded = treeExpanded[key] ?? true;
            return (
              <div key={s.id}>
                <div className="flex items-center gap-1" onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: "section", id: s.id }); }}>
                  <button type="button" className="w-4 text-slate-500" onClick={() => toggleExpand(key)}>{expanded ? "▼" : "▶"}</button>
                  <button type="button" className="truncate text-left font-medium hover:underline" onClick={() => goSection(s.id)}>
                    📂 {s.passwordProtected ? "🔒 " : null}{s.name}
                  </button>
                  <button type="button" className="ml-auto text-slate-400" onClick={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, kind: "section", id: s.id })}>⋯</button>
                </div>
                {expanded ? <div className="ml-3 border-l border-slate-100 pl-1">{renderTreeFolders(s.id, null, 0)}</div> : null}
              </div>
            );
          })}
        </div>
      </aside>
      )}

      <div className="min-w-0 flex-1 space-y-4">
        <div className="ed-documents-ui-hero p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm text-[#6b7280]">Документы</div>
              <h2 className="text-lg font-semibold text-[#1f2933]">Панельное хранилище</h2>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setTrashOpen(true);
                void refreshTrash();
              }}
            >
              Корзина{trashDocs.length > 0 ? ` (${trashDocs.length})` : ""}
            </button>
          </div>
          {error ? <div className="mt-2 text-sm text-rose-600">{error}</div> : null}
        </div>

        {canUploadRoutes && isDocumentsRoot ? (
          <>
            <button
              type="button"
              data-dedus-id="documents.uploadRoutes"
              title="Связи выгрузки документов"
              aria-label="Связи выгрузки документов"
              className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/90 bg-gradient-to-br from-amber-100 to-amber-200 text-xl shadow-lg ring-2 ring-white/90 transition hover:scale-105 hover:shadow-xl active:scale-95"
              style={{ zIndex: ED_Z_TRACKER_POPOVER }}
              onClick={() => navigate("/documents/routes-map")}
            >
              🔗
            </button>
          </>
        ) : null}

        {dashboardView}
        {sectionDetail}
        {folderView}
      </div>

      {shareTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="font-medium">{shareTarget.title}</div>
              <button type="button" onClick={() => setShareTarget(null)} className="ed-btn ed-btn-close ed-interactive px-2 py-1 text-sm">Закрыть</button>
            </div>
            <div className="mt-4 flex justify-center">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareTarget.link)}`} alt="QR" className="h-44 w-44 border" />
            </div>
            <div className="mt-3 flex gap-2">
              <input value={shareTarget.link} readOnly className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
              <button type="button" onClick={() => navigator.clipboard.writeText(shareTarget.link)} className="rounded border border-slate-200 px-2 py-1 text-sm">Копировать</button>
            </div>
            <div className="mt-3 grid max-h-40 grid-cols-2 gap-2 overflow-auto">
              {chatUsers.map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs">
                  <input type="checkbox" checked={shareUsers.includes(u.id)} onChange={(e) => setShareUsers((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)))} />
                  <span className="truncate">{u.fio}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  await Promise.all(shareUsers.map((id) => api.sendChatMessage(token, { toUserId: id, text: `Ссылка: ${shareTarget.link}` })));
                  setShareTarget(null);
                }}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addToSectionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            {addToSectionModal.mode === "confirm" ? (
              <>
                <div className="text-sm font-medium text-slate-900">
                  Добавить выбранные папки в раздел «{sectionById.get(addToSectionModal.sectionId)?.name ?? ""}»?
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAddToSectionModal(null)}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="ed-doc-btn-accent px-3 py-1.5 text-sm"
                    onClick={async () => {
                      const { sectionId, folderIds } = addToSectionModal;
                      setAddToSectionModal(null);
                      await moveLooseFoldersToSection(folderIds, sectionId);
                      const idx = sections.findIndex((s) => s.id === sectionId);
                      if (idx >= 0) setSectionIndex(idx);
                      setOpenedSectionId(sectionId);
                    }}
                  >
                    Добавить
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium text-slate-900">Выберите раздел</div>
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={async () => {
                        const folderIds = addToSectionModal.folderIds;
                        setAddToSectionModal(null);
                        await moveLooseFoldersToSection(folderIds, s.id);
                        setOpenedSectionId(s.id);
                        const idx = sections.findIndex((x) => x.id === s.id);
                        if (idx >= 0) setSectionIndex(idx);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAddToSectionModal(null)}>
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {addDocsToFolderModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-900">Выберите папку для документов</div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={async () => {
                    const ids = addDocsToFolderModal.documentIds;
                    setAddDocsToFolderModal(null);
                    await api.moveDocumentsToFolder(token, { documentIds: ids, targetFolderId: f.id });
                    setSelectedDocIds(new Set());
                    await refresh();
                  }}
                >
                  <span>{f.name}</span>
                  <span className="text-xs text-slate-500">{f.sectionId ? sectionById.get(f.sectionId)?.name ?? "Раздел" : "Отдельная"}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAddDocsToFolderModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fileErrorTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-900">Не удалось открыть документ</div>
            <div className="mt-2 text-sm text-slate-600">Сохраните файл и откройте его в подходящей программе.</div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ed-btn ed-btn-close ed-interactive px-3 py-1.5 text-sm" onClick={() => setFileErrorTarget(null)}>
                Закрыть
              </button>
              <a href={fileErrorTarget.url} download className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
                Скачать
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {docPreview ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/45 p-2 sm:p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDocPreview(null);
          }}
        >
          {(() => {
            const url = docPreview.objectUrl ?? fileUrl(docPreview.doc);
            const { kind } = detectDocKind(docPreview.doc);
            const sizeLabel = formatBytes(docPreview.doc.sizeBytes);
            const dateLabel = formatRuDate(docPreview.doc.createdAt);
            const previewFileName = docName(docPreview.doc);
            const ext = extFromName(previewFileName);
            const mime = (docPreview.mimeType || "").toLowerCase();
            const canInlineMedia = kind === "image" || kind === "pdf" || mime.startsWith("video/") || mime.startsWith("audio/");
            const canTryIframe = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);

            return (
              <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900" title={previewFileName}>
                      {previewFileName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
                      <span>{sizeLabel}</span>
                      <span className="text-slate-300">•</span>
                      <span>{dateLabel}</span>
                      <span className="text-slate-300">•</span>
                      <span className="capitalize">{kind}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {(["preview", "comments", "bindings"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={[
                            "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                            docPreviewTab === t
                              ? "bg-sky-600 text-white"
                              : "bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                          onClick={() => setDocPreviewTab(t)}
                        >
                          {t === "preview" ? "Просмотр" : t === "comments" ? `Комментарии (${docComments.length})` : `Связи (${docBindings.length})`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={url}
                      download={previewFileName}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Скачать
                    </a>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        const popup = window.open(url, "_blank", "noopener,noreferrer");
                        if (!popup) window.location.assign(url);
                      }}
                    >
                      В новой вкладке
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => setDocPreview(null)}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
                  {docPreview.busy ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-slate-600">
                      Загрузка предпросмотра…
                    </div>
                  ) : docPreviewTab === "preview" ? (
                    kind === "image" ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
                        <img src={url} alt={previewFileName} className="max-h-full w-full object-contain" />
                      </div>
                    ) : kind === "pdf" ? (
                      <iframe title="PDF preview" src={url} className="h-full w-full border-0 bg-white" />
                    ) : mime.startsWith("video/") ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
                        <video src={url} controls className="max-h-full w-full" />
                      </div>
                    ) : mime.startsWith("audio/") ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                        <audio src={url} controls className="w-full max-w-3xl" />
                      </div>
                    ) : canTryIframe ? (
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <iframe title="Document preview" src={url} className="h-full w-full border-0 bg-white" />
                        <div className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                          Если документ не отображается в браузере, используйте скачивание.
                        </div>
                      </div>
                    ) : !canInlineMedia ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          Этот тип файла пока можно только скачать.
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <iframe title="Document preview" src={url} className="h-full w-full border-0 bg-white" />
                      </div>
                    )
                  ) : docPreviewTab === "comments" ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <div className="shrink-0 border-b border-slate-200 bg-white/70 p-3">
                        <div className="text-sm font-semibold text-slate-900">Комментарии</div>
                        <p className="mt-1 text-[11px] text-slate-600">Обсуждение документа внутри просмотрщика.</p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {docCommentsBusy ? (
                          <div className="text-sm text-slate-600">Загрузка…</div>
                        ) : docComments.length === 0 ? (
                          <div className="text-sm text-slate-500">Комментариев пока нет.</div>
                        ) : (
                          <div className="space-y-2">
                            {docComments.map((c) => (
                              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold text-slate-900">
                                      {chatUsers.find((u) => u.id === c.authorId)?.fio ?? c.authorId}
                                    </div>
                                    <div className="text-[11px] text-slate-500">{formatRuDate(c.createdAt)}</div>
                                  </div>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{c.body}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold text-slate-900">Оставить комментарий</div>
                        <textarea
                          value={docCommentsDraft}
                          onChange={(e) => setDocCommentsDraft(e.target.value)}
                          rows={3}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                          placeholder="Текст комментария…"
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => setDocCommentsDraft("")}
                            disabled={!docCommentsDraft.trim()}
                          >
                            Очистить
                          </button>
                          <button
                            type="button"
                            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                            disabled={!docCommentsDraft.trim() || docCommentsBusy}
                            onClick={async () => {
                              if (!docPreview) return;
                              const body = docCommentsDraft.trim();
                              if (!body) return;
                              setDocCommentsDraft("");
                              setDocCommentsBusy(true);
                              try {
                                const r = await api.documentComments.add(token, docPreview.doc.id, body);
                                setDocComments((prev) => [r.comment, ...prev]);
                              } catch {
                                // ignore for now
                              } finally {
                                setDocCommentsBusy(false);
                              }
                            }}
                          >
                            Отправить
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <div className="shrink-0 border-b border-slate-200 bg-white/70 p-3">
                        <div className="text-sm font-semibold text-slate-900">Связи</div>
                        <p className="mt-1 text-[11px] text-slate-600">Привязки документа к сущностям EDUMED.</p>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {docBindingsBusy ? (
                          <div className="text-sm text-slate-600">Загрузка…</div>
                        ) : docBindings.length === 0 ? (
                          <div className="text-sm text-slate-500">Связей пока нет.</div>
                        ) : (
                          <div className="space-y-2">
                            {docBindings.map((b) => (
                              <div key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">{b.type}</div>
                                  <div className="mt-1 text-sm text-slate-700 break-all">refId: {b.refId}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">{formatRuDate(b.createdAt)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold text-slate-900">Добавить связь</div>
                        <div className="mt-2 grid gap-2">
                          <select
                            value={docBindingTypeDraft}
                            onChange={(e) => setDocBindingTypeDraft(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="lesson">Урок</option>
                            <option value="class">Класс</option>
                            <option value="journalDecision">Решение по журналу</option>
                            <option value="studentPortfolio">Портфолио ученика</option>
                            <option value="iom">ИОМ</option>
                          </select>
                          <input
                            value={docBindingRefIdDraft}
                            onChange={(e) => setDocBindingRefIdDraft(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder="refId (id сущности) …"
                          />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                            disabled={!docBindingRefIdDraft.trim() || docBindingsBusy}
                            onClick={async () => {
                              if (!docPreview) return;
                              const refId = docBindingRefIdDraft.trim();
                              if (!refId) return;
                              setDocBindingRefIdDraft("");
                              setDocBindingsBusy(true);
                              try {
                                const r = await api.documentBindings.add(token, docPreview.doc.id, {
                                  type: docBindingTypeDraft,
                                  refId,
                                });
                                setDocBindings((prev) => [r.binding, ...prev]);
                              } catch {
                                // ignore for now
                              } finally {
                                setDocBindingsBusy(false);
                              }
                            }}
                          >
                            Добавить
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {hoveredFolder && foldersById.get(hoveredFolder.folderId) ? (
        (() => {
          const node = (
            <div
              className="fixed z-[70] w-[340px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
              style={{ left: hoveredFolder.x, top: hoveredFolder.y }}
              onMouseEnter={() => {
                if (hoverCloseTimerRef.current) window.clearTimeout(hoverCloseTimerRef.current);
              }}
              onMouseLeave={scheduleHideFolderPopover}
            >
              <div className="text-sm font-semibold text-slate-900">{foldersById.get(hoveredFolder.folderId)!.name}</div>
              <div className="mt-2 text-xs text-slate-600">Документов: {folderTreeDocs(hoveredFolder.folderId).length}</div>
              <div className="mt-1 text-xs text-slate-600">Описание: {folderMeta[hoveredFolder.folderId]?.purpose ?? "не указано"}</div>
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
                {folderTreeDocs(hoveredFolder.folderId).slice(0, 7).map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => void openDocument(doc)}
                  >
                    {docName(doc)}
                  </button>
                ))}
                {folderTreeDocs(hoveredFolder.folderId).length === 0 ? (
                  <div className="text-xs text-slate-400">Документов нет</div>
                ) : null}
              </div>
            </div>
          );
          return typeof document !== "undefined" ? createPortal(node, document.body) : node;
        })()
      ) : null}

      {trashOpen ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Корзина</div>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setTrashOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {trashDocs.length === 0 ? (
                <div className="text-sm text-slate-500">Корзина пуста.</div>
              ) : (
                trashDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{docName(d)}</span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        onClick={async () => {
                          await api.restoreDocument(token, d.id);
                          await refresh();
                          await refreshTrash();
                        }}
                      >
                        Восстановить
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700"
                        onClick={async () => {
                          if (!window.confirm("Удалить безвозвратно?")) return;
                          await api.deleteDocument(token, d.id);
                          await refreshTrash();
                        }}
                      >
                        Удалить навсегда
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {docMenu ? (
        <div
          className="fixed z-[62] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          style={{ left: docMenu.x, top: docMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              const d = docMenu.doc;
              setDocMenu(null);
              void openDocument(d);
            }}
          >
            Открыть / Просмотреть
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              setDocRename({ id: docMenu.doc.id, name: docName(docMenu.doc) });
              setDocMenu(null);
            }}
          >
            Переименовать
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              setMoveDocModal({ doc: docMenu.doc });
              setDocMenu(null);
            }}
          >
            Переместить…
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              setCopyDocModal({ doc: docMenu.doc });
              setDocMenu(null);
            }}
          >
            Скопировать…
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              const suggested = loadRiviState().lastOpenedSpaceId;
              setRiviDocModal({
                doc: docMenu.doc,
                selectedSpaceIds: suggested ? [suggested] : [],
              });
              setDocMenu(null);
            }}
          >
            Добавить в пространство Rivi…
          </button>
          <a
            href={fileUrl(docMenu.doc)}
            download={docName(docMenu.doc)}
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => setDocMenu(null)}
          >
            Скачать
          </a>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              const d = docMenu.doc;
              setDocMenu(null);
              const link = docLink(d, foldersById);
              try {
                const raw = localStorage.getItem(`edumed.doc.shareLinks.${d.id}`);
                setPublicLinks(raw ? (JSON.parse(raw) as Array<{ id: string; mode: "view" | "full"; createdAt: string }>) : []);
              } catch {
                setPublicLinks([]);
              }
              setPendingLinkAccess("view");
              setShareDocModal({ title: docName(d), link, docId: d.id });
            }}
          >
            Поделиться / доступ…
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left hover:bg-slate-50"
            onClick={() => {
              setVersionsModal({ title: docName(docMenu.doc), docId: docMenu.doc.id });
              setDocMenu(null);
            }}
          >
            История версий…
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
            onClick={async () => {
              const d = docMenu.doc;
              setDocMenu(null);
              if (!window.confirm(`Переместить «${docName(d)}» в корзину?`)) return;
              await api.deleteDocument(token, d.id);
              await refresh();
              await refreshTrash();
            }}
          >
            Удалить в корзину
          </button>
        </div>
      ) : null}

      {riviDocModal ? (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">Добавить документ в пространство Rivi</div>
            <p className="mt-1 text-sm text-slate-600">Выберите одно или несколько пространств для «{docName(riviDocModal.doc)}».</p>
            <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto">
              {loadRiviState().spaces.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  Пока нет пространств Rivi. Сначала создайте пространство в модуле `Rivi`.
                </div>
              ) : (
                loadRiviState().spaces.map((space) => (
                  <label
                    key={space.id}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={riviDocModal.selectedSpaceIds.includes(space.id)}
                      onChange={(e) =>
                        setRiviDocModal((prev) =>
                          prev
                            ? {
                                ...prev,
                                selectedSpaceIds: e.target.checked
                                  ? [...prev.selectedSpaceIds, space.id]
                                  : prev.selectedSpaceIds.filter((id) => id !== space.id),
                              }
                            : prev,
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">{space.title}</span>
                      <span className="mt-1 block text-xs text-slate-500">{space.description || "Без описания"}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
                onClick={() => setRiviDocModal(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={riviDocModal.selectedSpaceIds.length === 0}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                onClick={() => {
                  const target = riviDocModal;
                  target.selectedSpaceIds.forEach((spaceId) =>
                    addDocumentObjectToRiviSpace(spaceId, {
                      documentId: target.doc.id,
                      title: docName(target.doc),
                      href: docLink(target.doc, foldersById),
                      mimeType: target.doc.mimeType,
                      folderLabel: target.doc.folderId ? foldersById.get(target.doc.folderId)?.name ?? "Папка" : "Документы",
                      createdLabel: formatRuDate(target.doc.createdAt),
                    }),
                  );
                  setRiviDocModal(null);
                }}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {docRename ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-800">Переименовать файл</div>
            <input
              className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={docRename.name}
              onChange={(e) => setDocRename((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = docRename.name.trim();
                  if (!name) return;
                  void (async () => {
                    await api.patchDocument(token, docRename.id, { originalName: name });
                    setDocRename(null);
                    await refresh();
                  })();
                }
              }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setDocRename(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
                onClick={async () => {
                  const name = docRename.name.trim();
                  if (!name) return;
                  await api.patchDocument(token, docRename.id, { originalName: name });
                  setDocRename(null);
                  await refresh();
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {moveDocModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-900">Переместить в папку</div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={async () => {
                  const id = moveDocModal.doc.id;
                  setMoveDocModal(null);
                  await api.patchDocument(token, id, { sectionId: null, folderId: null });
                  await refresh();
                }}
              >
                В корень панели (без раздела)
              </button>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={async () => {
                    const id = moveDocModal.doc.id;
                    setMoveDocModal(null);
                    await api.patchDocument(token, id, { sectionId: s.id, folderId: null });
                    await refresh();
                  }}
                >
                  В раздел «{s.name}» (без папки)
                </button>
              ))}
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={async () => {
                    const id = moveDocModal.doc.id;
                    setMoveDocModal(null);
                    try {
                      await api.patchDocument(token, id, { sectionId: f.sectionId, folderId: f.id });
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <span>{f.name}</span>
                  <span className="text-xs text-slate-500">{f.sectionId ? sectionById.get(f.sectionId)?.name ?? "" : "Отдельная"}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setMoveDocModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {copyDocModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-900">Копировать — выберите папку</div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={async () => {
                  const id = copyDocModal.doc.id;
                  setCopyDocModal(null);
                  await api.copyDocument(token, id, { targetFolderId: null });
                  await refresh();
                }}
              >
                Туда же (дубликат рядом)
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={async () => {
                    const id = copyDocModal.doc.id;
                    setCopyDocModal(null);
                    try {
                      await api.copyDocument(token, id, { targetFolderId: f.id });
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setCopyDocModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {moveFolderModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-900">Переместить папку</div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={async () => {
                    const moving = moveFolderModal.folder;
                    setMoveFolderModal(null);
                    try {
                      await api.patchDocumentFolder(token, moving.id, { sectionId: s.id, parentFolderId: null });
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  В корень раздела «{s.name}»
                </button>
              ))}
              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={async () => {
                  const moving = moveFolderModal.folder;
                  setMoveFolderModal(null);
                  try {
                    await api.patchDocumentFolder(token, moving.id, { sectionId: null, parentFolderId: null });
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                В отдельные папки (корень панели)
              </button>
              {folders
                .filter((f) => {
                  const m = moveFolderModal.folder;
                  if (f.id === m.id) return false;
                  if (isFolderDescendantOf(folders, f.id, m.id)) return false;
                  return true;
                })
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={async () => {
                      const moving = moveFolderModal.folder;
                      setMoveFolderModal(null);
                      try {
                        await api.patchDocumentFolder(token, moving.id, {
                          sectionId: f.sectionId,
                          parentFolderId: f.id,
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Внутрь «{f.name}»
                  </button>
                ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setMoveFolderModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareDocModal ? (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">Поделиться: {shareDocModal.title}</div>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setShareDocModal(null)}>
                Закрыть
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="link-mode"
                  checked={pendingLinkAccess === "view"}
                  onChange={() => setPendingLinkAccess("view")}
                />
                Только просмотр
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="link-mode"
                  checked={pendingLinkAccess === "full"}
                  onChange={() => setPendingLinkAccess("full")}
                />
                Полный доступ
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white"
                onClick={() => {
                  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `lnk-${Date.now()}`;
                  const row = { id, mode: pendingLinkAccess, createdAt: new Date().toISOString() };
                  const next = [...publicLinks, row];
                  setPublicLinks(next);
                  try {
                    localStorage.setItem(`edumed.doc.shareLinks.${shareDocModal.docId}`, JSON.stringify(next));
                  } catch {
                    // ignore
                  }
                }}
              >
                Создать ссылку
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(shareDocModal.link);
                }}
              >
                Копировать ссылку (страница документа)
              </button>
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase text-slate-500">Публичные ссылки (заглушка)</div>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-700">
                {publicLinks.length === 0 ? <li className="text-slate-400">Пока нет</li> : null}
                {publicLinks.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2 rounded border border-slate-100 px-2 py-1">
                    <span className="font-mono truncate">{l.id}</span>
                    <span>{l.mode === "view" ? "просмотр" : "полный"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareDocModal.link)}`}
                alt=""
                className="h-40 w-40 border"
              />
            </div>
          </div>
        </div>
      ) : null}

      {folderUnlockModal ? (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Папка с паролем</div>
            <div className="mt-2 text-sm text-slate-700">
              Введите пароль для «{folderUnlockModal.folder.name}»
            </div>

            <label className="mt-4 block text-sm">
              <div className="text-slate-600">Пароль</div>
              <input
                type="password"
                value={folderUnlockModal.password}
                onChange={(e) => setFolderUnlockModal((prev) => (prev ? { ...prev, password: e.target.value, error: null } : prev))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                autoFocus
              />
            </label>

            {folderUnlockModal.error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {folderUnlockModal.error}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => {
                  const origin = folderUnlockModal.origin;
                  const folderId = folderUnlockModal.folder.id;
                  if (origin === "route") {
                    setDismissedRouteUnlockFolderIds((prev) => {
                      const next = new Set(prev);
                      next.add(folderId);
                      return next;
                    });
                  }
                  setFolderUnlockModal(null);
                }}
                disabled={folderUnlockModal.busy}
              >
                Отмена
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                disabled={folderUnlockModal.busy}
                onClick={() => {
                  if (!token) return;
                  const target = folderUnlockModal.folder;
                  const password = folderUnlockModal.password;
                  const origin = folderUnlockModal.origin;
                  setFolderUnlockModal((prev) => (prev ? { ...prev, busy: true, error: null } : prev));
                  void api
                    .unlockDocumentFolder(token, target.id, password)
                    .then((r) => {
                      if (!r.ok) throw new Error("UNLOCK_FAILED");
                      setUnlockedFolderIds((prev) => {
                        const next = new Set(prev);
                        next.add(target.id);
                        return next;
                      });
                      setDismissedRouteUnlockFolderIds((prev) => {
                        const next = new Set(prev);
                        next.delete(target.id);
                        return next;
                      });
                      setFolderUnlockModal(null);
                      if (origin === "click") navigateToFolder(target);
                    })
                    .catch((e) => {
                      playServiceSound("error");
                      setFolderUnlockModal((prev) => (prev ? { ...prev, busy: false, error: e instanceof Error ? e.message : "UNLOCK_FAILED" } : prev));
                    });
                }}
              >
                Открыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sectionUnlockModal ? (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Раздел с паролем</div>
            <div className="mt-2 text-sm text-slate-700">
              Введите пароль для раздела «{sectionUnlockModal.section.name}»
            </div>
            <label className="mt-4 block text-sm">
              <div className="text-slate-600">Пароль</div>
              <input
                type="password"
                value={sectionUnlockModal.password}
                onChange={(e) => setSectionUnlockModal((prev) => (prev ? { ...prev, password: e.target.value, error: null } : prev))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                autoFocus
              />
            </label>
            {sectionUnlockModal.error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {sectionUnlockModal.error}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-3 py-1.5 text-sm"
                onClick={() => {
                  const origin = sectionUnlockModal.origin;
                  const sectionId = sectionUnlockModal.section.id;
                  if (origin === "route") {
                    setDismissedRouteUnlockSectionIds((prev) => {
                      const next = new Set(prev);
                      next.add(sectionId);
                      return next;
                    });
                  }
                  setSectionUnlockModal(null);
                }}
                disabled={sectionUnlockModal.busy}
              >
                Отмена
              </button>
              <button
                type="button"
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                disabled={sectionUnlockModal.busy}
                onClick={() => {
                  if (!token) return;
                  const target = sectionUnlockModal.section;
                  const password = sectionUnlockModal.password;
                  const origin = sectionUnlockModal.origin;
                  const nextFolderId = sectionUnlockModal.nextFolderId;
                  setSectionUnlockModal((prev) => (prev ? { ...prev, busy: true, error: null } : prev));
                  void api
                    .unlockDocumentSection(token, target.id, password)
                    .then((r) => {
                      if (!r.ok) throw new Error("UNLOCK_FAILED");
                      setUnlockedSectionIds((prev) => {
                        const next = new Set(prev);
                        next.add(target.id);
                        return next;
                      });
                      setDismissedRouteUnlockSectionIds((prev) => {
                        const next = new Set(prev);
                        next.delete(target.id);
                        return next;
                      });
                      setSectionUnlockModal(null);
                      if (origin === "click") {
                        if (nextFolderId) {
                          navigate(`/documents/section/${encodeURIComponent(target.id)}/folder/${encodeURIComponent(nextFolderId)}`);
                        } else {
                          navigate(`/documents/section/${encodeURIComponent(target.id)}`);
                        }
                      }
                    })
                    .catch((e) => {
                      playServiceSound("error");
                      setSectionUnlockModal((prev) => (prev ? { ...prev, busy: false, error: e instanceof Error ? e.message : "UNLOCK_FAILED" } : prev));
                    });
                }}
              >
                Открыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accessSectionModal ? (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Настройки доступа к разделу</div>
                <div className="mt-1 text-xs text-slate-600">«{accessSectionModal.section.name}»</div>
              </div>
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAccessSectionModal(null)}>
                Закрыть
              </button>
            </div>
            {(() => {
              const canEditAccess = Boolean(
                (accessSectionModal.section.ownerUserId && accessSectionModal.section.ownerUserId === user?.id) ||
                  user?.primaryRole === "sysadmin" ||
                  user?.username.trim().toLowerCase() === "admin",
              );
              return (
                <>
                  {!canEditAccess ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Изменение пароля раздела доступно только создателю раздела или системному администратору.
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={accessSectionModal.draft.hasPassword}
                        disabled={!canEditAccess}
                        onChange={(e) =>
                          setAccessSectionModal((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  draft: {
                                    ...prev.draft,
                                    hasPassword: e.target.checked,
                                    passwordInput: e.target.checked ? prev.draft.passwordInput : "",
                                  },
                                }
                              : prev,
                          )
                        }
                      />
                      Требовать пароль для входа в раздел
                    </label>
                    {accessSectionModal.draft.hasPassword ? (
                      <label className="mt-3 block text-sm">
                        <div className="text-slate-600">Новый пароль (оставьте пустым, чтобы не менять)</div>
                        <input
                          type="password"
                          value={accessSectionModal.draft.passwordInput}
                          disabled={!canEditAccess}
                          onChange={(e) =>
                            setAccessSectionModal((prev) =>
                              prev ? { ...prev, draft: { ...prev.draft, passwordInput: e.target.value } } : prev,
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                          placeholder="Введите пароль"
                        />
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAccessSectionModal(null)}>
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                      disabled={!canEditAccess}
                      onClick={async () => {
                        const section = accessSectionModal.section;
                        const draft = accessSectionModal.draft;
                        try {
                          const payload: { hasPassword: boolean; password?: string } = { hasPassword: draft.hasPassword };
                          if (draft.hasPassword && draft.passwordInput.trim()) payload.password = draft.passwordInput.trim();
                          await api.patchDocumentSection(token, section.id, payload);
                          if (!draft.hasPassword) {
                            setUnlockedSectionIds((prev) => {
                              const next = new Set(prev);
                              next.add(section.id);
                              return next;
                            });
                          } else {
                            setUnlockedSectionIds((prev) => {
                              const next = new Set(prev);
                              next.delete(section.id);
                              return next;
                            });
                          }
                          await refresh();
                          setAccessSectionModal(null);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "SECTION_ACCESS_SAVE_FAILED");
                        }
                      }}
                    >
                      Сохранить
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {accessFolderModal ? (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Настройки доступа к папке</div>
                <div className="mt-1 text-xs text-slate-600">«{accessFolderModal.folder.name}»</div>
              </div>
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAccessFolderModal(null)}>
                Закрыть
              </button>
            </div>

            {(() => {
              const folder = accessFolderModal.folder;
              const draft = accessFolderModal.draft;
              const viewerIsSysAdmin = Boolean(user?.primaryRole === "sysadmin" || user?.username.trim().toLowerCase() === "admin");
              const canEditAccess = Boolean((folder.ownerUserId && folder.ownerUserId === user?.id) || viewerIsSysAdmin);
              const roleOptions: Array<"director" | "head_teacher" | "teacher" | "parent" | "student"> = [
                "director",
                "head_teacher",
                "teacher",
                "parent",
                "student",
              ];

              return (
                <div className="mt-4">
                  {!canEditAccess ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Доступ можно только просматривать. Изменения доступны автору папки (или системному администратору).
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Тип доступа</div>
                    <div className="mt-3 grid gap-2">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="folder-access-type"
                          checked={draft.accessType === "private"}
                          disabled={!canEditAccess}
                          onChange={() =>
                            setAccessFolderModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    draft: { ...prev.draft, accessType: "private", selectedUserIds: [], selectedRoleIds: [] },
                                  }
                                : prev,
                            )
                          }
                        />
                        Приватная (по умолчанию)
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="folder-access-type"
                          checked={draft.accessType === "org"}
                          disabled={!canEditAccess}
                          onChange={() =>
                            setAccessFolderModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    draft: { ...prev.draft, accessType: "org", selectedUserIds: [], selectedRoleIds: [] },
                                  }
                                : prev,
                            )
                          }
                        />
                        Общая для всех
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="folder-access-type"
                          checked={draft.accessType === "selected"}
                          disabled={!canEditAccess}
                          onChange={() =>
                            setAccessFolderModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    draft: { ...prev.draft, accessType: "selected" },
                                  }
                                : prev,
                            )
                          }
                        />
                        Выбрать пользователей / роли
                      </label>
                    </div>
                  </div>

                  {draft.accessType === "selected" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Пользователи</div>
                      <div className="mt-2">
                        <input
                          value={accessUserSearch}
                          onChange={(e) => setAccessUserSearch(e.target.value)}
                          placeholder="Поиск по ФИО или id…"
                          className="ed-input w-full max-w-md px-3 py-2 text-sm"
                          disabled={!canEditAccess}
                        />
                      </div>
                      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-2">
                        {(accessUserSearch
                          ? chatUsers.filter(
                              (u) =>
                                u.fio.toLowerCase().includes(accessUserSearch.toLowerCase()) ||
                                u.id.toLowerCase().includes(accessUserSearch.toLowerCase()),
                            )
                          : chatUsers
                        ).map((u) => {
                          const checked = draft.selectedUserIds.includes(u.id);
                          return (
                            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-100">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canEditAccess}
                                onChange={(e) =>
                                  setAccessFolderModal((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          draft: {
                                            ...prev.draft,
                                            selectedUserIds: e.target.checked
                                              ? [...prev.draft.selectedUserIds, u.id]
                                              : prev.draft.selectedUserIds.filter((x) => x !== u.id),
                                          },
                                        }
                                      : prev,
                                  )
                                }
                              />
                              <span className="truncate">{u.fio}</span>
                            </label>
                          );
                        })}
                        {chatUsers.length === 0 ? <div className="text-xs text-slate-500">Пользователи не загружены.</div> : null}
                      </div>
                    </div>
                  ) : null}

                  {draft.accessType === "selected" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Роли</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {roleOptions.map((r) => {
                          const checked = draft.selectedRoleIds.includes(r);
                          return (
                            <label key={r} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canEditAccess}
                                onChange={(e) =>
                                  setAccessFolderModal((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          draft: {
                                            ...prev.draft,
                                            selectedRoleIds: e.target.checked
                                              ? [...prev.draft.selectedRoleIds, r]
                                              : prev.draft.selectedRoleIds.filter((x) => x !== r),
                                          },
                                        }
                                      : prev,
                                  )
                                }
                              />
                              {r}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.hasPassword}
                        disabled={!canEditAccess}
                        onChange={(e) =>
                          setAccessFolderModal((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  draft: { ...prev.draft, hasPassword: e.target.checked, passwordInput: e.target.checked ? prev.draft.passwordInput : "" },
                                }
                              : prev,
                          )
                        }
                      />
                      Папка с паролем
                    </label>

                    {draft.hasPassword ? (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-slate-700">Пароль</div>
                        <input
                          type="password"
                          value={draft.passwordInput}
                          onChange={(e) =>
                            setAccessFolderModal((prev) =>
                              prev ? { ...prev, draft: { ...prev.draft, passwordInput: e.target.value } } : prev,
                            )
                          }
                          placeholder="Введите новый пароль…"
                          className="ed-input mt-1 w-full max-w-md px-3 py-2 text-sm"
                          disabled={!canEditAccess}
                        />
                        <div className="mt-1 text-xs text-slate-500">Если оставить пустым — пароль не изменится (если был задан).</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setAccessFolderModal(null)}>
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      disabled={!canEditAccess}
                      onClick={() => {
                        const folder = accessFolderModal.folder;
                        const draft = accessFolderModal.draft;
                        if (!token) return;
                        void (async () => {
                          try {
                            const payload: any = {
                              accessType: draft.accessType,
                              sharedWithUserIds: draft.accessType === "selected" ? draft.selectedUserIds : [],
                              sharedWithRoleIds: draft.accessType === "selected" ? draft.selectedRoleIds : [],
                              hasPassword: draft.hasPassword,
                            };
                            if (draft.hasPassword && draft.passwordInput.trim()) payload.password = draft.passwordInput.trim();
                            await api.patchDocumentFolder(token, folder.id, payload);
                            if (draft.hasPassword) {
                              setUnlockedFolderIds((prev) => {
                                const next = new Set(prev);
                                next.delete(folder.id);
                                return next;
                              });
                            } else {
                              setUnlockedFolderIds((prev) => {
                                const next = new Set(prev);
                                next.add(folder.id);
                                return next;
                              });
                            }
                            await refresh();
                            setAccessFolderModal(null);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "ACCESS_SAVE_FAILED");
                          }
                        })();
                      }}
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

      {versionsModal ? (
        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">История версий</div>
            <p className="mt-2 text-sm text-slate-600">«{versionsModal.title}»</p>

            <div className="mt-4 max-h-[52vh] overflow-y-auto space-y-3 pr-1">
              {docVersionsBusy ? <div className="text-sm text-slate-600">Загрузка…</div> : null}
              {docVersionsError ? <div className="text-sm text-rose-700">{docVersionsError}</div> : null}
              {docVersions.map((v) => {
                const isCurrent = Boolean(v.isCurrent);
                return (
                  <div key={v.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900" title={formatFileName(v.originalFileName ?? v.originalName)}>
                          {formatFileName(v.originalFileName ?? v.originalName)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
                          <span>{formatRuDate(v.createdAt)}</span>
                          <span className="text-slate-300">•</span>
                          <span>{chatUsers.find((u) => u.id === v.createdByUserId)?.fio ?? v.createdByUserId}</span>
                          <span className="text-slate-300">•</span>
                          <span>{formatBytes(v.sizeBytes)}</span>
                        </div>
                        {v.comment ? <div className="mt-2 text-xs text-slate-700">{v.comment}</div> : null}
                      </div>
                      {isCurrent ? (
                        <span className="shrink-0 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">Текущая</span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={v.downloadUrl ? v.downloadUrl.replace(/^\/files\//, "/api/files/") : `/api/files/${v.storageRelPath}`}
                        download={formatFileName(v.originalFileName ?? v.originalName)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Скачать
                      </a>
                      {isCurrent ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <button
                          type="button"
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                          disabled={newVersionUploading}
                          onClick={async () => {
                            try {
                              const r = await api.documentVersions.makeCurrent(token, versionsModal.docId, v.id);
                              if (r.document && docPreview?.doc.id === versionsModal.docId) {
                                void openDocument(r.document as Doc);
                              }
                              await refresh();
                            } catch {
                              // ignore; UI can be enhanced with error toast
                            } finally {
                              setVersionsModal(null);
                            }
                          }}
                        >
                          Сделать основной
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {docVersions.length === 0 && !docVersionsBusy ? (
                <div className="text-sm text-slate-500">История пока пуста. Новые загрузки начнут версионирование.</div>
              ) : null}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-sm font-semibold text-slate-900">Загрузить новую версию</div>
              <div className="mt-2 space-y-2">
                <input
                  type="file"
                  className="w-full text-sm text-slate-700"
                  onChange={(e) => setNewVersionFile(e.target.files?.[0] ?? null)}
                />
                <input
                  type="text"
                  placeholder="Комментарий (необязательно)"
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={newVersionComment}
                  onChange={(e) => setNewVersionComment(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-3 py-1.5 text-sm"
                    onClick={() => {
                      setVersionsModal(null);
                    }}
                    disabled={newVersionUploading}
                  >
                    Закрыть
                  </button>
                  <button
                    type="button"
                    className="rounded bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={!newVersionFile || newVersionUploading}
                    onClick={async () => {
                      if (!newVersionFile) return;
                      setNewVersionUploading(true);
                      try {
                        const r = await api.documentVersions.upload(token, versionsModal.docId, {
                          file: newVersionFile,
                          comment: newVersionComment,
                        });
                        if (r.document && docPreview?.doc.id === versionsModal.docId) {
                          void openDocument(r.document as Doc);
                        }
                        await refresh();
                        const r2 = await api.documentVersions.list(token, versionsModal.docId);
                        setDocVersions(r2.versions ?? []);
                        setNewVersionFile(null);
                        setNewVersionComment("");
                      } catch {
                        // ignore
                      } finally {
                        setNewVersionUploading(false);
                      }
                    }}
                  >
                    {newVersionUploading ? "Загрузка…" : "Загрузить"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {renameTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-medium text-slate-800">Переименовать</div>
            <input
              className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm"
              value={renameTarget.name}
              onChange={(e) => setRenameTarget((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
              }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              {renameTarget.kind === "section" ? (
                <button
                  type="button"
                  className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-sm"
                  onClick={async () => {
                    const id = renameTarget.id;
                    setRenameTarget(null);
                    await deleteSection(id);
                  }}
                >
                  Удалить
                </button>
              ) : null}
              {renameTarget.kind === "folder" && !isLockedFolder(foldersById.get(renameTarget.id)) ? (
                <button
                  type="button"
                  className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-sm"
                  onClick={async () => {
                    const folder = foldersById.get(renameTarget.id);
                    setRenameTarget(null);
                    if (folder) await deleteFolder(folder);
                  }}
                >
                  Удалить
                </button>
              ) : null}
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setRenameTarget(null)}>Отмена</button>
              <button type="button" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={() => void commitRename()}>Сохранить</button>
            </div>
          </div>
        </div>
      ) : null}

      {ctxMenu ? (
        (() => {
          const node = (
            <div className="fixed z-[60] min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
              {ctxMenu.kind === "section" && ctxMenu.id ? (
                <>
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { const s = sectionById.get(ctxMenu.id!); if (s) setRenameTarget({ kind: "section", id: s.id, name: s.name }); }}>Переименовать</button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      const s = sectionById.get(ctxMenu.id!);
                      setCtxMenu(null);
                      if (!s) return;
                      setAccessSectionModal({
                        section: s,
                        draft: { hasPassword: Boolean(s.passwordProtected), passwordInput: "" },
                      });
                    }}
                  >
                    Настроить доступ…
                  </button>
                  <button type="button" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50" onClick={() => { const id = ctxMenu.id!; setCtxMenu(null); void deleteSection(id); }}>Удалить</button>
                </>
              ) : null}
              {ctxMenu.kind === "folder" && ctxMenu.id ? (
                <>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      const f = foldersById.get(ctxMenu.id!);
                      setCtxMenu(null);
                      if (f) openFolder(f);
                    }}
                  >
                    Открыть
                  </button>
                  {!isLockedFolder(foldersById.get(ctxMenu.id!)) ? (
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        const f = foldersById.get(ctxMenu.id!);
                        if (f) setRenameTarget({ kind: "folder", id: f.id, name: f.name });
                      }}
                    >
                      Переименовать
                    </button>
                  ) : null}
                  {!isLockedFolder(foldersById.get(ctxMenu.id!)) ? (
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        const f = foldersById.get(ctxMenu.id!);
                        setCtxMenu(null);
                        if (f) setMoveFolderModal({ folder: f });
                      }}
                    >
                      Переместить…
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => {
                      const f = foldersById.get(ctxMenu.id!);
                      setCtxMenu(null);
                      if (f) openShare(f.name, folderLink(f));
                    }}
                  >
                    Поделиться
                  </button>
                  {!isLockedFolder(foldersById.get(ctxMenu.id!)) ? (
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        const f = foldersById.get(ctxMenu.id!);
                        setCtxMenu(null);
                        if (f) {
                          const accessType: "private" | "org" | "selected" =
                            f.accessType ??
                            (f.shared ? "org" : (f.sharedWithUserIds?.length ?? 0) > 0 ? "selected" : "private");
                          setAccessUserSearch("");
                          setAccessFolderModal({
                            folder: f,
                            draft: {
                              accessType,
                              selectedUserIds: f.sharedWithUserIds ?? [],
                              selectedRoleIds: f.sharedWithRoleIds ?? [],
                              hasPassword: Boolean(f.passwordProtected),
                              passwordInput: "",
                            },
                          });
                        }
                      }}
                    >
                      Настроить доступ…
                    </button>
                  ) : null}
                  {!isLockedFolder(foldersById.get(ctxMenu.id!)) ? (
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
                      onClick={() => {
                        const f = foldersById.get(ctxMenu.id!);
                        setCtxMenu(null);
                        setSelectedFolderIds(new Set());
                        if (f) void deleteFolder(f);
                      }}
                    >
                      Удалить
                    </button>
                  ) : null}
                </>
              ) : null}
              {ctxMenu.kind === "root" ? <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={goRoot}>Открыть корень</button> : null}
            </div>
          );
          return typeof document !== "undefined" ? createPortal(node, document.body) : node;
        })()
      ) : null}
    </div>
  );
}
