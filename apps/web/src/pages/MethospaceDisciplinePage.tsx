import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatFileName } from "../lib/formatFileName";
import { useAuth } from "../state/auth";

type Discipline = {
  id: string;
  code: string;
  baseCode: string;
  name: string;
  grade: number;
  documents: Array<{ id: string; name: string; url: string }>;
  documentFolderId?: string | null;
  gradeRanges: Record<"1" | "2" | "3" | "4" | "5", { min: number; max: number }>;
};

type DocItem = {
  id: string;
  originalFileName?: string;
  originalName: string;
  storageRelPath: string;
  createdAt: string;
  mimeType?: string;
  sizeBytes?: number;
  sectionId?: string | null;
  folderId?: string | null;
  disciplineId?: string | null;
  isStandardizing?: boolean;
  tags?: {
    periods?: string[];
    journalTrace?: { journalDocumentTypeId?: string; lessonDateIso?: string };
  };
};
type FolderItem = { id: string; name: string; sectionId: string | null; parentFolderId: string | null; disciplineId?: string | null };
type ViewMode = "date" | "docType";
type PeriodMode = "academicYear" | "currentQuarter" | "custom";

function inferDocTypeId(doc: DocItem, knownTypeIds: Set<string>): string | null {
  const jt = doc.tags?.journalTrace?.journalDocumentTypeId;
  if (jt && knownTypeIds.has(jt)) return jt;
  for (const p of doc.tags?.periods ?? []) {
    if (knownTypeIds.has(p)) return p;
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

function parseHundredths(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

export function MethospaceDisciplinePage() {
  const { baseCode } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const token = auth.accessToken!;
  const role = auth.user?.primaryRole;
  const uploadRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<{
    name: string;
    baseCode: string;
    disciplines: Discipline[];
    lessonTypeStandards: Array<{
      lessonTypeId: string;
      name: string;
      description: string;
      colorKey: string;
      colorHex: string;
      document: { id: string; originalName: string; storageRelPath: string } | null;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rangesDraft, setRangesDraft] = useState<Record<string, Discipline["gradeRanges"]>>({});
  const [attachDocId, setAttachDocId] = useState("");
  const [attachToCode, setAttachToCode] = useState("");
  const [uploadToCode, setUploadToCode] = useState("");

  const [, setDocsByDiscipline] = useState<Record<string, DocItem[]>>({});
  const [treeFolders, setTreeFolders] = useState<FolderItem[]>([]);
  const [treeDocuments, setTreeDocuments] = useState<DocItem[]>([]);
  const [journalDocTypes, setJournalDocTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [quarters, setQuarters] = useState<Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("date");
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("academicYear");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [chatUsers, setChatUsers] = useState<Array<{ id: string; fio: string }>>([]);
  const [docPopover, setDocPopover] = useState<DocItem | null>(null);
  const [shareUsers, setShareUsers] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!baseCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.methospaceDisciplineByBase(token, baseCode);
      setData(res);
      const draft: Record<string, Discipline["gradeRanges"]> = {};
      for (const d of res.disciplines as Discipline[]) draft[d.code] = structuredClone(d.gradeRanges);
      setRangesDraft(draft);
      const firstCode = (res.disciplines as Discipline[])[0]?.code ?? "";
      setAttachToCode(firstCode);
      setUploadToCode(firstCode);
      // каталог документов по дисциплинам
      const nextDocs: Record<string, DocItem[]> = {};
      await Promise.all(
        (res.disciplines as Discipline[]).map(async (d) => {
          try {
            const r = await api.documentsList(token, { disciplineCode: d.code });
            nextDocs[d.code] = (r.documents ?? []) as DocItem[];
          } catch {
            nextDocs[d.code] = [];
          }
        }),
      );
      setDocsByDiscipline(nextDocs);
      const tree = await api.documentsTree(token);
      setTreeFolders((tree.folders ?? []) as FolderItem[]);
      setTreeDocuments((tree.documents ?? []) as DocItem[]);
      const [jt, q] = await Promise.all([
        api.methospaceJournalDocumentTypes(token).catch(() => ({ types: [] as Array<{ id: string; name: string }> })),
        api.methospaceQuarters(token).catch(() => ({ quarters: [] as Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }> })),
      ]);
      setJournalDocTypes((jt.types ?? []).map((x) => ({ id: x.id, name: x.name })));
      setQuarters(q.quarters ?? []);
      const chatUsersRes = await api.chatsUsers(token);
      setChatUsers((chatUsersRes.users ?? []).map((item) => ({ id: item.id, fio: item.fio })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, baseCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setIsModeTransitioning(true);
    const timer = window.setTimeout(() => setIsModeTransitioning(false), 180);
    return () => window.clearTimeout(timer);
  }, [viewMode]);

  const canEditDiscipline = role === "head_teacher" || role === "sysadmin";

  const deleteDiscipline = useCallback(async () => {
    if (!canEditDiscipline) return;
    if (!baseCode) return;
    const ok = window.confirm(`Удалить дисциплину «${data?.name ?? baseCode}»?\nБудут удалены документы и папки (включая все коды этого предмета).`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      await api.deleteDiscipline(token, baseCode);
      navigate("/section/methospace");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [baseCode, canEditDiscipline, data?.name, navigate, token]);

  const codes = useMemo(() => (data?.disciplines ?? []).map((d) => d.code), [data]);
  const foldersById = useMemo(() => new Map(treeFolders.map((folder) => [folder.id, folder] as const)), [treeFolders]);

  const disciplinePanels = useMemo(() => {
    const result: Array<{ doc: DocItem; discipline: Discipline; rootFolderId: string }> = [];
    const disciplines = data?.disciplines ?? [];
    for (const discipline of disciplines) {
      if (!discipline.documentFolderId) continue;
      const stack = [discipline.documentFolderId];
      const subtree = new Set<string>();
      while (stack.length > 0) {
        const folderId = stack.pop()!;
        if (subtree.has(folderId)) continue;
        subtree.add(folderId);
        for (const folder of treeFolders) {
          if (folder.parentFolderId === folderId) stack.push(folder.id);
        }
      }
      for (const doc of treeDocuments) {
        if (doc.folderId && subtree.has(doc.folderId)) {
          result.push({ doc, discipline, rootFolderId: discipline.documentFolderId });
        }
      }
    }
    return result.sort((a, b) => b.doc.createdAt.localeCompare(a.doc.createdAt));
  }, [data, treeDocuments, treeFolders]);

  const docTypeNameById = useMemo(() => new Map(journalDocTypes.map((x) => [x.id, x.name] as const)), [journalDocTypes]);
  const knownDocTypeIds = useMemo(() => new Set(journalDocTypes.map((x) => x.id)), [journalDocTypes]);

  const quarterForNow = useMemo(() => {
    const now = new Date();
    return quarters.find((q) => {
      const from = new Date(q.startDate);
      const to = new Date(q.endDate);
      return !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && now >= from && now <= to;
    }) ?? null;
  }, [quarters]);

  const docsForSelectedPeriod = useMemo(() => {
    if (viewMode !== "docType") return disciplinePanels;
    return disciplinePanels.filter(({ doc }) => {
      const lessonDate = doc.tags?.journalTrace?.lessonDateIso ?? doc.createdAt;
      if (periodMode === "academicYear") return inCurrentAcademicYear(lessonDate);
      if (periodMode === "currentQuarter") {
        if (!quarterForNow) return true;
        const d = new Date(lessonDate);
        const from = new Date(quarterForNow.startDate);
        const to = new Date(quarterForNow.endDate);
        return !Number.isNaN(d.getTime()) && d >= from && d <= to;
      }
      if (!periodFrom || !periodTo) return true;
      const d = new Date(lessonDate);
      const from = new Date(periodFrom);
      const to = new Date(periodTo);
      return !Number.isNaN(d.getTime()) && d >= from && d <= to;
    });
  }, [disciplinePanels, viewMode, periodMode, periodFrom, periodTo, quarterForNow]);

  const groupedByClass = useMemo(() => {
    const out = new Map<string, { folder: FolderItem; byDate: Map<string, DocItem[]>; byType: Map<string, DocItem[]> }>();
    const folderById = new Map(treeFolders.map((f) => [f.id, f] as const));
    const disciplines = data?.disciplines ?? [];
    for (const d of disciplines) {
      const rootId = d.documentFolderId;
      if (!rootId) continue;
      const classFolders = treeFolders.filter((f) => f.parentFolderId === rootId);
      for (const cf of classFolders) {
        if (!out.has(cf.id)) out.set(cf.id, { folder: cf, byDate: new Map(), byType: new Map() });
      }
    }
    for (const { doc } of docsForSelectedPeriod) {
      if (!doc.folderId) continue;
      let cur = folderById.get(doc.folderId);
      let classFolder: FolderItem | undefined;
      while (cur) {
        if (out.has(cur.id)) {
          classFolder = cur;
          break;
        }
        cur = cur.parentFolderId ? folderById.get(cur.parentFolderId) : undefined;
      }
      if (!classFolder) continue;
      const group = out.get(classFolder.id)!;
      const dateKey = folderById.get(doc.folderId)?.name ?? "Без даты";
      const arrDate = group.byDate.get(dateKey) ?? [];
      arrDate.push(doc);
      group.byDate.set(dateKey, arrDate);
      const docTypeId = inferDocTypeId(doc, knownDocTypeIds);
      const typeKey = docTypeId ? (docTypeNameById.get(docTypeId) ?? "Неизвестный тип") : "Без типа";
      const arrType = group.byType.get(typeKey) ?? [];
      arrType.push(doc);
      group.byType.set(typeKey, arrType);
    }
    return Array.from(out.values()).sort((a, b) => a.folder.name.localeCompare(b.folder.name, "ru"));
  }, [data, treeFolders, docsForSelectedPeriod, knownDocTypeIds, docTypeNameById]);

  const updateRangeField = useCallback(
    (code: string, mark: "1" | "2" | "3" | "4" | "5", key: "min" | "max", value: string) => {
      const parsed = parseHundredths(value);
      setRangesDraft((prev) => {
        const next = { ...prev };
        const ranges = structuredClone(next[code]);
        if (!ranges) return prev;
        ranges[mark][key] = parsed ?? 0;
        next[code] = ranges;
        return next;
      });
    },
    [],
  );

  const saveRanges = useCallback(
    async (code: string) => {
      if (!canEditDiscipline) return;
      const draft = rangesDraft[code];
      if (!draft) return;
      setLoading(true);
      setError(null);
      try {
        await api.updateDiscipline(token, code, { gradeRanges: draft });
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [canEditDiscipline, rangesDraft, token, refresh],
  );

  const attachDocument = useCallback(async () => {
    if (!canEditDiscipline) return;
    if (!attachDocId.trim() || !attachToCode) return;
    setLoading(true);
    setError(null);
    try {
      await api.linkDocumentToDiscipline(token, attachDocId.trim(), attachToCode);
      setAttachDocId("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canEditDiscipline, attachDocId, attachToCode, token, refresh]);

  const uploadDocument = useCallback(
    async (file: File) => {
      if (!canEditDiscipline || !uploadToCode) return;
      setLoading(true);
      setError(null);
      try {
        await api.uploadDocument(token, { file, disciplineCode: uploadToCode, isStandardizing: true });
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [canEditDiscipline, refresh, token, uploadToCode],
  );

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">
          <Link className="text-indigo-700 hover:underline" to="/section/methospace">
            Методическое пространство
          </Link>{" "}
          • Дисциплина
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
          {data?.name ?? baseCode ?? "Дисциплина"}
        </h2>
        <div className="mt-1 text-sm text-slate-600">
          {data?.baseCode ?? ""} • коды: {(data?.disciplines ?? []).map((d) => d.code).join(", ") || "—"}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void refresh()}
            className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm font-medium"
          >
            Обновить
          </button>
          {canEditDiscipline ? (
            <button
              onClick={() => void deleteDiscipline()}
              disabled={loading}
              className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Удалить дисциплину
            </button>
          ) : null}
          {loading ? <div className="text-sm text-slate-500">Загрузка…</div> : null}
          {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        </div>
      </div>

      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">Документы дисциплины</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600">Просмотр:</span>
          <button
            type="button"
            className={["rounded-full px-3 py-1 text-xs", viewMode === "date" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"].join(" ")}
            onClick={() => setViewMode("date")}
          >
            по дате
          </button>
          <button
            type="button"
            className={["rounded-full px-3 py-1 text-xs", viewMode === "docType" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"].join(" ")}
            onClick={() => setViewMode("docType")}
          >
            по типу документов
          </button>
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
            Режим: {viewMode === "date" ? "по дате" : "по типу документов"}
          </span>
        </div>
        {viewMode === "docType" ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <label className="text-xs text-slate-600">
              Период
              <select
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
                className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
              >
                <option value="academicYear">весь учебный год</option>
                <option value="currentQuarter">текущая четверть</option>
                <option value="custom">задать даты</option>
              </select>
            </label>
            {periodMode === "custom" ? (
              <>
                <label className="text-xs text-slate-600">
                  c
                  <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="text-xs text-slate-600">
                  по
                  <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm" />
                </label>
              </>
            ) : null}
          </div>
        ) : null}
        <div className={["mt-4 space-y-4 transition-opacity duration-200", isModeTransitioning ? "opacity-70" : "opacity-100"].join(" ")}>
          {groupedByClass.map((cls) => (
            <div key={cls.folder.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">{cls.folder.name}</div>
              {viewMode === "date" ? (
                <div className="mt-3 space-y-3">
                  {Array.from(cls.byDate.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru")).map(([dateName, docs]) => (
                    <div key={dateName} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="text-xs font-semibold text-slate-700">{dateName}</div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {docs
                          .slice()
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((doc) => (
                            <button key={doc.id} type="button" onClick={() => { setShareUsers([]); setDocPopover(doc); }} className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm">
                              <div className="line-clamp-2 font-medium text-slate-900">{formatFileName(doc.originalFileName ?? doc.originalName)}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</div>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                  {cls.byDate.size === 0 ? <div className="text-sm text-slate-500">Нет документов по датам.</div> : null}
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from(cls.byType.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru")).map(([typeName, docs]) => (
                    <div key={typeName} className="group flex min-h-56 flex-col rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 transition duration-150 hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-600" aria-hidden>
                            📁
                          </div>
                          <div className="line-clamp-2 text-xs font-semibold text-slate-800">{typeName}</div>
                        </div>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{docs.length}</span>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">документов</div>
                      <div className="mt-3 space-y-2">
                        {docs
                          .slice()
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .slice(0, 3)
                          .map((doc) => (
                            <button key={doc.id} type="button" onClick={() => { setShareUsers([]); setDocPopover(doc); }} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50">
                              <div className="line-clamp-1 font-medium text-slate-900">{formatFileName(doc.originalFileName ?? doc.originalName)}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</div>
                            </button>
                          ))}
                      </div>
                      {docs.length > 3 ? <div className="mt-auto pt-2 text-[11px] text-slate-500">+ еще {docs.length - 3}</div> : <div className="mt-auto" />}
                    </div>
                  ))}
                  {cls.byType.size === 0 ? <div className="md:col-span-2 xl:col-span-3 text-sm text-slate-500">В выбранном периоде нет документов по типам.</div> : null}
                </div>
              )}
            </div>
          ))}
          {groupedByClass.length === 0 ? <div className="text-sm text-slate-600">Пока нет папок классов для этого предмета.</div> : null}
        </div>
        {disciplinePanels.length === 0 ? <div className="mt-3 text-sm text-slate-600">Пока нет прикреплённых документов.</div> : null}

        {canEditDiscipline ? (
          <div className="ed-card p-4 mt-4">
            <div className="text-sm font-medium text-slate-900">Загрузить регламентирующий документ</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="block text-sm">
                <div className="text-slate-600">Код дисциплины</div>
                <select
                  value={uploadToCode}
                  onChange={(e) => setUploadToCode(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                >
                  {codes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block text-sm md:col-span-2">
                <div className="text-slate-600">Файл</div>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => uploadRef.current?.click()}
                    className="ed-btn ed-btn-primary ed-interactive shrink-0 px-4 py-2 text-sm font-medium disabled:opacity-40"
                    disabled={!uploadToCode || loading}
                  >
                    Загрузить в папку дисциплины
                  </button>
                </div>
                <input
                  ref={uploadRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadDocument(file);
                  }}
                />
              </div>
            </div>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="text-sm font-medium text-slate-900">Привязать существующий документ по ID</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="block text-sm">
                  <div className="text-slate-600">Код дисциплины</div>
                  <select
                    value={attachToCode}
                    onChange={(e) => setAttachToCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                  >
                    {codes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm md:col-span-2">
                  <div className="text-slate-600">ID документа</div>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={attachDocId}
                      onChange={(e) => setAttachDocId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                      placeholder="Введите ID документа"
                    />
                    <button
                      onClick={() => void attachDocument()}
                      className="ed-btn ed-btn-secondary ed-interactive shrink-0 px-4 py-2 text-sm font-medium disabled:opacity-40"
                      disabled={!attachDocId.trim() || loading}
                    >
                      Привязать
                    </button>
                  </div>
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">Диапазоны оценок</div>
        <div className="mt-3 space-y-4">
          {(data?.disciplines ?? []).map((d) => (
            <div key={d.code} className="ed-card p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {d.code} • {d.grade} класс
                </div>
                {canEditDiscipline ? (
                  <button
                    onClick={() => void saveRanges(d.code)}
                    className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-xs font-medium disabled:opacity-40"
                    disabled={loading}
                  >
                    Сохранить
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-5">
                {(["1", "2", "3", "4", "5"] as const).map((m) => (
                  <div key={m} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs font-medium text-slate-700">Оценка {m}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-xs text-slate-600">
                        min
                        <input
                          disabled={!canEditDiscipline}
                          type="number"
                          step={0.01}
                          value={rangesDraft[d.code]?.[m]?.min ?? d.gradeRanges[m].min}
                          onChange={(e) => updateRangeField(d.code, m, "min", e.target.value.replace(",", "."))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-900 disabled:bg-slate-50"
                        />
                      </label>
                      <label className="block text-xs text-slate-600">
                        max
                        <input
                          disabled={!canEditDiscipline}
                          type="number"
                          step={0.01}
                          value={rangesDraft[d.code]?.[m]?.max ?? d.gradeRanges[m].max}
                          onChange={(e) => updateRangeField(d.code, m, "max", e.target.value.replace(",", "."))}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-900 disabled:bg-slate-50"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!data ? <div className="text-sm text-slate-600">Загрузка…</div> : null}
        </div>
      </div>

      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">Типы уроков — стандартизирующие документы</div>
        <div className="mt-1 text-sm text-slate-600">
          Документы задаются в разделе «Настройки журнала» → «Типы уроков» и привязываются к кодам этой дисциплины.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.lessonTypeStandards ?? []).map((row) => (
            <div
              key={row.lessonTypeId}
              className="ed-card ed-lesson-standard-card p-4"
              style={{ ["--ed-lesson-color" as string]: row.colorHex }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{row.name}</div>
                  {row.description ? <div className="mt-1 text-xs text-slate-700">{row.description}</div> : null}
                </div>
              </div>
              <div className="mt-3">
                {row.document ? (
                  <a
                    href={`/files/${row.document.storageRelPath}`}
                    target="_blank"
                    rel="noreferrer"
                  className="ed-btn ed-btn-secondary ed-interactive inline-flex px-3 py-1.5 text-xs font-medium"
                  >
                    Открыть: {formatFileName(row.document.originalName)}
                  </a>
                ) : (
                  <div className="text-xs text-slate-600">Файл не прикреплён</div>
                )}
              </div>
            </div>
          ))}
          {(data?.lessonTypeStandards ?? []).length === 0 ? (
            <div className="text-sm text-slate-600 md:col-span-2">
              Нет стандартов для кодов этой дисциплины. Добавьте тип урока в настройках журнала и укажите коды классов (например{" "}
              {codes.slice(0, 2).join(", ") || "MATEM5"}).
            </div>
          ) : null}
        </div>
      </div>

      {docPopover ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="ed-panel w-full max-w-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Документ дисциплины</div>
                <div className="mt-1 text-base font-semibold text-slate-900">{formatFileName(docPopover.originalFileName ?? docPopover.originalName)}</div>
              </div>
              <button onClick={() => setDocPopover(null)} className="ed-btn ed-btn-close ed-interactive px-3 py-1.5 text-sm">
                Закрыть
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  const folder = docPopover.folderId ? foldersById.get(docPopover.folderId) : null;
                  if (folder?.sectionId) {
                    navigate(`/documents/section/${encodeURIComponent(folder.sectionId)}/folder/${encodeURIComponent(folder.id)}?documentId=${encodeURIComponent(docPopover.id)}`);
                  }
                  setDocPopover(null);
                }}
                className="ed-btn ed-btn-secondary ed-interactive px-4 py-3 text-left text-sm"
              >
                Открыть в Документах
              </button>
              <a
                href={`/files/${docPopover.storageRelPath}`}
                target="_blank"
                rel="noreferrer"
                className="ed-btn ed-btn-secondary ed-interactive px-4 py-3 text-left text-sm"
              >
                Открыть файл
              </a>
              <a href={`/files/${docPopover.storageRelPath}`} download className="ed-btn ed-btn-secondary ed-interactive px-4 py-3 text-left text-sm">
                Скачать
              </a>
            </div>
            <div className="mt-5">
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/files/${docPopover.storageRelPath}`)}`}
                  alt="QR"
                  className="h-44 w-44 border"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <input value={`${window.location.origin}/files/${docPopover.storageRelPath}`} readOnly className="w-full rounded border border-slate-200 px-2 py-1 text-sm" />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/files/${docPopover.storageRelPath}`)}
                  className="rounded border border-slate-200 px-2 py-1 text-sm"
                >
                  Копировать
                </button>
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
                    const link = `${window.location.origin}/files/${docPopover.storageRelPath}`;
                    await Promise.all(shareUsers.map((id) => api.sendChatMessage(token, { toUserId: id, text: `Ссылка: ${link}` })));
                    setDocPopover(null);
                  }}
                  className="ed-btn ed-btn-primary ed-interactive px-3 py-1.5 text-sm"
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
