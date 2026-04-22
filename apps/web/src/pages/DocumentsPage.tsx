import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Doc = {
  id: string;
  originalName: string;
  storageRelPath: string;
  createdAt: string;
  tags?: { disciplineCodes?: string[]; grades?: number[]; roles?: string[]; periods?: string[] };
  folder?: { schoolId?: string; officeSection?: string; disciplineCode?: string; grade?: number };
  createdByUserId?: string;
};

function fmtPath(folder?: Doc["folder"]): string {
  if (!folder) return "—";
  const parts = [
    folder.schoolId || "school-1",
    folder.officeSection || "school",
    folder.disciplineCode || null,
    folder.grade != null ? String(folder.grade) : null,
  ].filter(Boolean) as string[];
  return parts.join(" / ");
}

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseGradesCsv(input: string): number[] {
  return parseCsv(input)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function DocumentsPage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadDisciplineCode, setUploadDisciplineCode] = useState("");
  const [uploadGrade, setUploadGrade] = useState<string>("");

  const [filterDisciplineCode, setFilterDisciplineCode] = useState("");
  const [filterGrade, setFilterGrade] = useState<string>("");
  const [filterRoles, setFilterRoles] = useState<string>("");
  const [filterPeriods, setFilterPeriods] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parsedGrade = filterGrade.trim() ? Number(filterGrade) : null;
      const res = await api.documentsList(token, {
        officeSection: "document_archive",
        disciplineCode: filterDisciplineCode.trim() ? filterDisciplineCode.trim() : undefined,
        grade: Number.isFinite(parsedGrade) && parsedGrade != null ? parsedGrade : undefined,
        roles: parseCsv(filterRoles),
        periods: parseCsv(filterPeriods),
      });
      setItems(res.documents as Doc[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUpload = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsedGrade = uploadGrade.trim() ? Number(uploadGrade) : null;
      const tags = {
        disciplineCodes: uploadDisciplineCode.trim() ? [uploadDisciplineCode.trim()] : [],
        grades: Number.isFinite(parsedGrade) && parsedGrade != null ? [parsedGrade] : [],
        roles: [],
        periods: [],
      };
      const folder = {
        officeSection: "document_archive",
        disciplineCode: uploadDisciplineCode.trim() ? uploadDisciplineCode.trim() : undefined,
        grade: Number.isFinite(parsedGrade) && parsedGrade != null ? parsedGrade : undefined,
      };
      await api.uploadDocument(token, { file, tags, folder });
      setFile(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, file, uploadDisciplineCode, uploadGrade, refresh]);

  const onDelete = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        await api.deleteDocument(token, id);
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, refresh],
  );

  const canUpload = useMemo(() => Boolean(file) && !loading, [file, loading]);

  const [editDoc, setEditDoc] = useState<null | { doc: Doc; tags: any; folder: any }>(null);

  const openEdit = useCallback((doc: Doc) => {
    setEditDoc({
      doc,
      tags: {
        disciplineCodes: (doc.tags?.disciplineCodes ?? []).join(", "),
        grades: (doc.tags?.grades ?? []).join(", "),
        roles: (doc.tags?.roles ?? []).join(", "),
        periods: (doc.tags?.periods ?? []).join(", "),
      },
      folder: {
        schoolId: doc.folder?.schoolId ?? "school-1",
        officeSection: doc.folder?.officeSection ?? "document_archive",
        disciplineCode: doc.folder?.disciplineCode ?? "",
        grade: doc.folder?.grade != null ? String(doc.folder.grade) : "",
      },
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editDoc) return;
    setLoading(true);
    setError(null);
    try {
      const tags = {
        disciplineCodes: parseCsv(editDoc.tags.disciplineCodes),
        grades: parseGradesCsv(editDoc.tags.grades),
        roles: parseCsv(editDoc.tags.roles),
        periods: parseCsv(editDoc.tags.periods),
      };
      const grade = editDoc.folder.grade.trim() ? Number(editDoc.folder.grade) : undefined;
      const folder = {
        schoolId: editDoc.folder.schoolId?.trim() ? editDoc.folder.schoolId.trim() : "school-1",
        officeSection: editDoc.folder.officeSection?.trim() ? editDoc.folder.officeSection.trim() : undefined,
        disciplineCode: editDoc.folder.disciplineCode?.trim() ? editDoc.folder.disciplineCode.trim() : undefined,
        grade: Number.isFinite(grade) ? grade : undefined,
      };
      await api.patchDocument(token, editDoc.doc.id, { tags, folder });
      setEditDoc(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [editDoc, token, refresh]);

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">Документы • Хранилище</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Централизованное хранилище</h2>
        <div className="mt-2 text-sm text-slate-700">
          Файл сохраняется в общей структуре и далее используется по ссылкам в других разделах.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="block text-sm md:col-span-2">
            <div className="text-slate-600">Фильтр: disciplineCode</div>
            <input
              value={filterDisciplineCode}
              onChange={(e) => setFilterDisciplineCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="MATEM5"
            />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Фильтр: grade</div>
            <input
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="5"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => void refresh()}
              className="ed-btn ed-btn-secondary ed-interactive w-full px-4 py-2 text-sm font-medium"
            >
              Применить фильтры
            </button>
          </div>
          <label className="block text-sm md:col-span-2">
            <div className="text-slate-600">Фильтр: roles (через запятую)</div>
            <input
              value={filterRoles}
              onChange={(e) => setFilterRoles(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="teacher, head_teacher"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <div className="text-slate-600">Фильтр: periods (через запятую)</div>
            <input
              value={filterPeriods}
              onChange={(e) => setFilterPeriods(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="Q1, 2025-2026"
            />
          </label>
        </div>

        <div className="ed-card mt-5 bg-slate-50 p-4">
          <div className="text-sm font-medium text-slate-900">Загрузка</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <div className="text-slate-600">Дисциплина (код, опционально)</div>
            <input
              value={uploadDisciplineCode}
              onChange={(e) => setUploadDisciplineCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="MATEM5"
            />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Класс (номер, опционально)</div>
            <input
              value={uploadGrade}
              onChange={(e) => setUploadGrade(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="5"
            />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Файл</div>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
            />
          </label>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void onUpload()}
              disabled={!canUpload}
              className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Загрузить
            </button>
            {error ? <div className="text-sm text-rose-600">{error}</div> : null}
          </div>
        </div>
      </div>

      <div className="ed-panel ed-panel-hover p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">Список</div>
            <div className="mt-1 text-sm text-slate-700">
              Всего: <span className="font-medium">{items.length}</span>
            </div>
          </div>
          {loading ? <div className="text-sm text-slate-500">Загрузка…</div> : null}
        </div>

        <div className="mt-4 space-y-2">
          {items.map((d) => (
            <div key={d.id} className="ed-card flex items-center justify-between px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{d.originalName}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  <span className="mr-2">Путь: {fmtPath(d.folder)}</span>
                  {d.folder?.disciplineCode ? ` • ${d.folder.disciplineCode}` : ""}
                  {d.folder?.grade != null ? ` • ${d.folder.grade} класс` : ""}
                  <span className="ml-2">{new Date(d.createdAt).toLocaleString()}</span>
                </div>
                <a
                  className="mt-1 inline-block text-xs font-medium text-indigo-700 hover:underline"
                  href={`/files/${d.storageRelPath}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть
                </a>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <button
                  onClick={() => openEdit(d)}
                  className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium"
                >
                  Изменить
                </button>
                <button
                  onClick={() => void onDelete(d.id)}
                  className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <div className="text-sm text-slate-600">Пока нет документов.</div>
          ) : null}
        </div>
      </div>

      {editDoc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm text-slate-500">Документ • Метаданные</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{editDoc.doc.originalName}</div>
            <div className="mt-1 text-xs text-slate-500">ID: {editDoc.doc.id}</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-medium text-slate-900">Теги</div>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">disciplineCodes</div>
                  <input
                    value={editDoc.tags.disciplineCodes}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, tags: { ...p.tags, disciplineCodes: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="MATEM5, BIOLO7"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">grades</div>
                  <input
                    value={editDoc.tags.grades}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, tags: { ...p.tags, grades: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="5, 6"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">roles</div>
                  <input
                    value={editDoc.tags.roles}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, tags: { ...p.tags, roles: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="teacher, head_teacher"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">periods</div>
                  <input
                    value={editDoc.tags.periods}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, tags: { ...p.tags, periods: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="Q1, 2025-2026"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-medium text-slate-900">Папка</div>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">schoolId</div>
                  <input
                    value={editDoc.folder.schoolId}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, folder: { ...p.folder, schoolId: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="school-1"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">officeSection</div>
                  <input
                    value={editDoc.folder.officeSection}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, folder: { ...p.folder, officeSection: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="document_archive"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">disciplineCode</div>
                  <input
                    value={editDoc.folder.disciplineCode}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, folder: { ...p.folder, disciplineCode: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="MATEM5"
                  />
                </label>
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">grade</div>
                  <input
                    value={editDoc.folder.grade}
                    onChange={(e) => setEditDoc((p) => (p ? { ...p, folder: { ...p.folder, grade: e.target.value } } : p))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    placeholder="5"
                  />
                </label>
                <div className="mt-3 text-xs text-slate-500">Путь отображаем по метаданным, не по файловой системе.</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={async () => {
                  const ok = window.confirm(`Вы действительно хотите удалить «${editDoc.doc.originalName}»? Это действие нельзя отменить.`);
                  if (!ok) return;
                  setLoading(true);
                  setError(null);
                  try {
                    await api.deleteDocument(token, editDoc.doc.id);
                    setEditDoc(null);
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Удалить
              </button>
              <button
                onClick={() => setEditDoc(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
              >
                Отмена
              </button>
              <button
                onClick={() => void saveEdit()}
                disabled={loading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

