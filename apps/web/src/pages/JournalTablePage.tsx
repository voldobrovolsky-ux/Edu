import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { isoDateToday, pickQuarterForDate } from "../lib/quarters";
import { useAuth } from "../state/auth";

type TableData = {
  journalView?: "staff" | "teacher";
  discipline: {
    code: string;
    name: string;
    grade: number;
    documents: Array<{ id: string; name: string; url: string }>;
    gradeRanges: Record<string, { min: number; max: number }>;
  };
  from: string;
  to: string;
  students: Array<{ userId: string; fio: string; groupNumber: number }>;
  lessons: Array<{
    id: string;
    date: string;
    slotIndex: number;
    groupNumber?: number | null;
    teacherUserId?: string;
    canEdit?: boolean;
    blockedByEvent?: { id: string; title: string; status: string } | null;
  }>;
  lessonMeta: Array<{ timetableLessonId: string; topic: string; attachedDocumentIds: string[]; journalLessonTypeId?: string | null }>;
  lessonTypes: Array<{ id: string; name: string; description: string; colorKey: string; colorHex: string }>;
  marks: Array<{
    timetableLessonId: string;
    studentUserId: string;
    mark: number | null;
    absent: boolean;
    applicable: boolean;
  }>;
  lessonStats: Array<{ lessonId: string; presentCount: number | null; classAverage: number | null }>;
  studentAverages: Array<{ studentUserId: string; average: number | null; finalMark: number | null }>;
};

type ArchiveDoc = {
  id: string;
  originalName: string;
  storageRelPath: string;
  createdAt: string;
  tags?: { periods?: string[] };
};
type JournalDocType = { id: string; name: string; description: string };

function buildJournalLessonLinkToken(lessonId: string, journalDocumentTypeId: string, groupNumber: number | null | undefined): string {
  const g = groupNumber == null ? "all" : String(groupNumber);
  return `jl:${lessonId}:${journalDocumentTypeId}:g${g}`;
}

const LESSON_POPOVER_W = 320;
const HOVER_POPOVER_CLOSE_MS = 260;

/** Fallback, если якорь недоступен: центр окна с отступами. */
function lessonPopoverViewportFallback(): { style: CSSProperties } {
  const pad = 10;
  return {
    style: {
      position: "fixed",
      left: Math.max(pad, (window.innerWidth - LESSON_POPOVER_W) / 2),
      top: Math.max(pad, window.innerHeight * 0.08),
      width: LESSON_POPOVER_W,
      maxHeight: Math.min(window.innerHeight * 0.78, 560),
      zIndex: 10000,
    },
  };
}

function lessonPopoverPosition(anchorRect: DOMRect | null, fallbackRect: DOMRect | null): { style: CSSProperties } {
  const rect = anchorRect ?? fallbackRect;
  if (!rect) return lessonPopoverViewportFallback();

  const pad = 10;
  let left = rect.left;
  if (left + LESSON_POPOVER_W > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - LESSON_POPOVER_W - pad);
  }
  const belowTop = rect.bottom + pad;
  const maxOverall = Math.min(window.innerHeight * 0.78, 560);
  const spaceBelow = window.innerHeight - belowTop - pad;
  let top = belowTop;
  let maxHeight = Math.min(maxOverall, Math.max(220, spaceBelow));
  if (spaceBelow < 180 && rect.top - pad > window.innerHeight - rect.bottom) {
    maxHeight = Math.min(maxOverall, Math.max(220, rect.top - 2 * pad));
    top = Math.max(pad, rect.top - pad - maxHeight);
  }
  return {
    style: {
      position: "fixed",
      left,
      top,
      width: LESSON_POPOVER_W,
      maxHeight,
      zIndex: 10000,
    },
  };
}

function readSafeBoundingRect(el: EventTarget | null): DOMRect | null {
  if (!el || !(el instanceof Element)) return null;
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isStaffJournalUser(user: { primaryRole: string; username: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.primaryRole === "head_teacher" || user.primaryRole === "director" || user.primaryRole === "sysadmin")
    return true;
  return user.username.trim().toLowerCase() === "admin";
}

export function JournalTablePage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { grade: gradeParam, disciplineCode: disciplineCodeParam } = useParams();
  const token = auth.accessToken;
  const staffJournalUser = isStaffJournalUser(auth.user ?? null);

  const grade = Number(gradeParam);
  const disciplineCode = disciplineCodeParam ? decodeURIComponent(disciplineCodeParam) : "";

  const [disciplinesForGrade, setDisciplinesForGrade] = useState<Array<{ code: string; name: string }>>([]);

  const [quarters, setQuarters] = useState<Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>>([]);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [quartersError, setQuartersError] = useState<string | null>(null);

  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [journalDocTypes, setJournalDocTypes] = useState<JournalDocType[]>([]);
  const [docsByTypeId, setDocsByTypeId] = useState<Record<string, ArchiveDoc[]>>({});
  const [journalDocsLoading, setJournalDocsLoading] = useState(false);

  const [lessonPopover, setLessonPopover] = useState<{ lessonId: string; anchorRect: DOMRect | null } | null>(null);
  const lessonPopoverPanelRef = useRef<HTMLDivElement | null>(null);
  const journalTableWrapRef = useRef<HTMLDivElement | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current != null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleCloseLessonPopover = useCallback(() => {
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setLessonPopover(null);
      hoverCloseTimerRef.current = null;
    }, HOVER_POPOVER_CLOSE_MS);
  }, [clearHoverCloseTimer]);

  useEffect(() => {
    return () => {
      clearHoverCloseTimer();
    };
  }, [clearHoverCloseTimer]);

  const selectedQuarterRange = useMemo(() => quarters.find((q) => q.index === selectedQuarter) ?? null, [quarters, selectedQuarter]);
  const from = selectedQuarterRange?.startDate ?? isoDate(new Date());
  const to = selectedQuarterRange?.endDate ?? isoDate(new Date());

  useEffect(() => {
    if (!token || !staffJournalUser || !Number.isFinite(grade)) return;
    void api
      .methospaceDisciplinesList(token)
      .then((r) => {
        const list = (r.disciplines ?? [])
          .filter((d) => d.grade === grade)
          .sort((a, b) => a.name.localeCompare(b.name, "ru"))
          .map((d) => ({ code: d.code, name: d.name }));
        setDisciplinesForGrade(list);
      })
      .catch(() => setDisciplinesForGrade([]));
  }, [token, staffJournalUser, grade]);

  useEffect(() => {
    if (!token) return;
    setQuartersError(null);
    void api
      .methospaceQuarters(token)
      .then((r) => {
        const nextQuarters = r.quarters ?? [];
        console.info("[journal] quarters loaded", nextQuarters);
        setQuarters(nextQuarters);
        setQuartersError(null);
        const autoQuarter = pickQuarterForDate(nextQuarters, isoDateToday());
        if (autoQuarter) setSelectedQuarter(autoQuarter.index);
      })
      .catch((e) => {
        console.error("[journal] failed to load quarters", e);
        setQuarters([]);
        setQuartersError((e as Error).message);
      });
  }, [token]);

  const reload = useCallback((): Promise<void> => {
    if (!token || !Number.isFinite(grade) || !disciplineCode) return Promise.resolve();
    if (!selectedQuarterRange) return Promise.resolve();
    setError(null);
    setData(null);
    return api
      .journalTable(token, { from, to, grade, disciplineCode })
      .then((r) => {
        setData(r as TableData);
      })
      .catch((e) => {
        setError((e as Error).message);
      });
  }, [token, from, to, grade, disciplineCode, selectedQuarterRange]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Индекс документов по типам журнала (для поповера). Для params класса/предмета, не зависит от `data`. */
  const refetchJournalDocumentsIndex = useCallback(async () => {
    if (!token || !Number.isFinite(grade) || !disciplineCode) return;
    setJournalDocsLoading(true);
    try {
      const res = await api.methospaceJournalDocumentTypes(token);
      const types = (res.types ?? []) as JournalDocType[];
      setJournalDocTypes(types);
      const byType: Record<string, ArchiveDoc[]> = {};
      await Promise.all(
        types.map(async (t) => {
          const r = await api.documentsList(token, {
            officeSection: "document_archive",
            disciplineCode,
            grade,
            periods: [t.id],
          });
          byType[t.id] = (r.documents ?? []).map((d) => d as ArchiveDoc);
        }),
      );
      setDocsByTypeId(byType);
    } catch {
      // Ошибка справочника документов не должна ломать загрузку/редактирование самого журнала.
    } finally {
      setJournalDocsLoading(false);
    }
  }, [token, grade, disciplineCode]);

  useEffect(() => {
    if (!data) return;
    void refetchJournalDocumentsIndex();
  }, [data, refetchJournalDocumentsIndex]);

  const metaByLessonId = useMemo(() => {
    const m = new Map<string, { topic: string; attachedDocumentIds: string[]; journalLessonTypeId: string | null }>();
    for (const x of data?.lessonMeta ?? []) {
      m.set(x.timetableLessonId, {
        topic: x.topic ?? "",
        attachedDocumentIds: Array.isArray(x.attachedDocumentIds) ? x.attachedDocumentIds : [],
        journalLessonTypeId: x.journalLessonTypeId ?? null,
      });
    }
    return m;
  }, [data]);

  const lessonTypeColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of data?.lessonTypes ?? []) m.set(t.id, t.colorHex);
    return m;
  }, [data]);

  const columnTint = useCallback(
    (lessonId: string): string | undefined => {
      const tid = metaByLessonId.get(lessonId)?.journalLessonTypeId ?? null;
      if (!tid) return undefined;
      return lessonTypeColorById.get(tid);
    },
    [metaByLessonId, lessonTypeColorById],
  );

  const statsByLessonId = useMemo(() => {
    const m = new Map<string, { presentCount: number | null; classAverage: number | null }>();
    for (const s of data?.lessonStats ?? []) m.set(s.lessonId, s);
    return m;
  }, [data]);

  const avgByStudentId = useMemo(() => {
    const m = new Map<string, { average: number | null; finalMark: number | null }>();
    for (const a of data?.studentAverages ?? []) m.set(a.studentUserId, a);
    return m;
  }, [data]);

  const cellByKey = useMemo(() => {
    const m = new Map<string, { mark: number | null; absent: boolean; applicable: boolean }>();
    for (const c of data?.marks ?? []) {
      m.set(`${c.timetableLessonId}:${c.studentUserId}`, { mark: c.mark ?? null, absent: Boolean(c.absent), applicable: Boolean(c.applicable) });
    }
    return m;
  }, [data]);

  const lessonCanEdit = useCallback(
    (lessonId: string) => {
      const le = data?.lessons.find((x) => x.id === lessonId);
      return le ? le.canEdit !== false : true;
    },
    [data],
  );

  const disciplineNav = useMemo(() => {
    if (!disciplinesForGrade.length || !disciplineCode) return { prev: null as string | null, next: null as string | null };
    const idx = disciplinesForGrade.findIndex((d) => d.code === disciplineCode);
    const prev = idx > 0 ? disciplinesForGrade[idx - 1].code : null;
    const next = idx >= 0 && idx < disciplinesForGrade.length - 1 ? disciplinesForGrade[idx + 1].code : null;
    return { prev, next };
  }, [disciplinesForGrade, disciplineCode]);

  const saveMark = useCallback(
    async (args: { lessonId: string; studentId: string; mark?: number | null; absent?: boolean }) => {
      if (!token) return;
      const key = `${args.lessonId}:${args.studentId}`;
      setSavingKey(key);
      try {
        await api.upsertJournalMark(token, {
          timetableLessonId: args.lessonId,
          studentUserId: args.studentId,
          mark: args.mark,
          absent: args.absent,
        });
        reload();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSavingKey(null);
      }
    },
    [token, reload],
  );

  useEffect(() => {
    if (!lessonPopover) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const el = lessonPopoverPanelRef.current;
      if (el && t && el.contains(t)) return;
      if (t?.closest?.("[data-journal-lesson-date-cell]")) return;
      setLessonPopover(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [lessonPopover]);

  useEffect(() => {
    if (!lessonPopover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLessonPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lessonPopover]);

  useEffect(() => {
    if (!lessonPopover || !data) return;
    if (!data.lessons.some((x) => x.id === lessonPopover.lessonId)) {
      setLessonPopover(null);
    }
  }, [data, lessonPopover?.lessonId]);

  const saveLessonMeta = useCallback(
    async (args: { lessonId: string; topic?: string; attachedDocumentIds?: string[]; journalLessonTypeId?: string | null }) => {
      if (!token) return;
      setSavingKey(`meta:${args.lessonId}`);
      try {
        await api.upsertJournalLessonMeta(token, {
          timetableLessonId: args.lessonId,
          topic: args.topic,
          attachedDocumentIds: args.attachedDocumentIds,
          journalLessonTypeId: args.journalLessonTypeId,
        });
        reload();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSavingKey(null);
      }
    },
    [token, reload],
  );

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Раздел • Журнал</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {Number.isFinite(grade) ? `${grade} класс` : "Класс"}
            {!staffJournalUser ? (
              <>
                {" "}
                • {disciplineCode || "предмет"}
              </>
            ) : null}
          </h2>
          {staffJournalUser && disciplinesForGrade.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Предмет</span>
              <button
                type="button"
                disabled={!disciplineNav.prev}
                onClick={() => disciplineNav.prev && nav(`/section/journal/${grade}/${encodeURIComponent(disciplineNav.prev)}`)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Предыдущий предмет"
              >
                ←
              </button>
              <select
                value={disciplineCode}
                onChange={(e) => nav(`/section/journal/${grade}/${encodeURIComponent(e.target.value)}`)}
                className="max-w-[min(100vw-8rem,24rem)] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-900"
              >
                {disciplinesForGrade.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!disciplineNav.next}
                onClick={() => disciplineNav.next && nav(`/section/journal/${grade}/${encodeURIComponent(disciplineNav.next)}`)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Следующий предмет"
              >
                →
              </button>
            </div>
          ) : null}
          {data && <div className="mt-1 text-sm text-slate-600">{data.discipline.name}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => nav("/section/journal")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {staffJournalUser ? "← К выбору класса" : "← К панелям"}
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="text-xs text-slate-500">Четверть</div>
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500">
              {quartersError
                ? "не удалось загрузить четверти"
                : selectedQuarterRange
                  ? `${selectedQuarterRange.startDate} — ${selectedQuarterRange.endDate}`
                  : "четверти не настроены"}
            </div>
            <button
              onClick={reload}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
            >
              Обновить
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      {quartersError && !error ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Не удалось получить четверти журнала: {quartersError}
        </div>
      ) : null}
      {!error && !quartersError && data == null && selectedQuarterRange && <div className="mt-4 text-sm text-slate-500">Загружаем журнал…</div>}
      {!error && !quartersError && data == null && !selectedQuarterRange && (
        <div className="mt-4 text-sm text-slate-500">Четверти не настроены, поэтому журнал пока недоступен.</div>
      )}

      {data && (
        <div ref={journalTableWrapRef} className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold text-slate-900">
                  Ученик
                </th>
                {data.lessons.map((l) => {
                  const meta = metaByLessonId.get(l.id) ?? { topic: "", attachedDocumentIds: [], journalLessonTypeId: null };
                  const stats = statsByLessonId.get(l.id) ?? { presentCount: null, classAverage: null };
                  const docCount = meta.attachedDocumentIds.length;
                  const header = `${l.date} • ${l.slotIndex}${l.groupNumber ? ` • гр ${l.groupNumber}` : ""}`;
                  const tint = columnTint(l.id);
                  return (
                    <th
                      key={l.id}
                      className="border-b border-slate-200 px-2 py-2 text-center font-semibold text-slate-900"
                      style={tint ? { backgroundColor: tint } : undefined}
                    >
                      <div
                        className="inline-flex max-w-[7rem] flex-col items-center gap-0.5"
                        data-journal-lesson-date-cell=""
                        onMouseEnter={(e) => {
                          clearHoverCloseTimer();
                          setLessonPopover({ lessonId: l.id, anchorRect: readSafeBoundingRect(e.currentTarget) });
                        }}
                        onMouseLeave={scheduleCloseLessonPopover}
                      >
                        <div className="flex flex-col items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-slate-100">
                          <div className="text-xs text-slate-500">{l.date}</div>
                          <div className="text-sm">
                            {l.slotIndex}
                            {l.groupNumber ? <span className="ml-1 text-xs text-slate-500">гр {l.groupNumber}</span> : null}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500">{docCount > 0 ? `доки: ${docCount}` : "—"}</div>
                        <div className="sr-only">
                          {header}. Присутствуют: {stats.presentCount ?? "—"}, средний:{" "}
                          {stats.classAverage != null ? stats.classAverage.toFixed(2) : "—"}
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-20 border-b border-slate-200 bg-white px-3 py-2 text-center font-semibold text-slate-900">
                  Средний
                  <div className="text-[11px] font-normal text-slate-500">итог</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => {
                const avg = avgByStudentId.get(s.userId);
                return (
                  <tr key={s.userId} className="odd:bg-slate-50">
                    <td className="sticky left-0 z-10 border-b border-slate-100 bg-inherit px-3 py-2">
                      <div className="font-medium text-slate-900">{s.fio}</div>
                      <div className="text-xs text-slate-500">гр {s.groupNumber}</div>
                    </td>
                    {data.lessons.map((l) => {
                      const k = `${l.id}:${s.userId}`;
                      const cell = cellByKey.get(k) ?? { mark: null, absent: false, applicable: false };
                      const isSaving = savingKey === k;
                      const tint = columnTint(l.id);
                      const editable = cell.applicable && lessonCanEdit(l.id);
                      if (!cell.applicable) {
                        return (
                          <td
                            key={k}
                            className="border-b border-slate-100 px-2 py-2 text-center text-slate-400"
                            style={tint ? { backgroundColor: tint } : undefined}
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={k}
                          className="border-b border-slate-100 px-2 py-2"
                          style={tint ? { backgroundColor: tint } : undefined}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={5}
                              defaultValue={cell.mark ?? ""}
                              disabled={!editable || cell.absent}
                              tabIndex={editable && !cell.absent ? 0 : -1}
                              onBlur={(e) => {
                                if (!editable) return;
                                const v = e.target.value.trim();
                                if (v === "") {
                                  saveMark({ lessonId: l.id, studentId: s.userId, mark: null });
                                  return;
                                }
                                const next = Number(v);
                                if (!Number.isInteger(next) || next < 1 || next > 5) return;
                                saveMark({ lessonId: l.id, studentId: s.userId, mark: next });
                              }}
                              className={[
                                "w-14 rounded-lg border px-2 py-1 text-center",
                                cell.absent ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-white",
                                !editable ? "cursor-default bg-slate-50 text-slate-800" : "",
                              ].join(" ")}
                            />
                            <label className="flex items-center gap-1 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={cell.absent}
                                disabled={!editable}
                                onChange={(e) => {
                                  if (!editable) return;
                                  saveMark({ lessonId: l.id, studentId: s.userId, absent: e.target.checked });
                                }}
                              />
                              нет
                            </label>
                            {isSaving && <div className="text-[11px] text-slate-500">…</div>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-b border-slate-100 bg-white px-3 py-2 text-center">
                      <div className="font-medium text-slate-900">{avg?.average != null ? avg.average.toFixed(2) : "—"}</div>
                      <div className="text-xs text-slate-500">{avg?.finalMark != null ? `итог: ${avg.finalMark}` : " "}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && lessonPopover
        ? (() => {
            const l = data.lessons.find((x) => x.id === lessonPopover.lessonId);
            if (!l) return null;
            const canEditLesson = lessonCanEdit(l.id);
            const meta = metaByLessonId.get(l.id) ?? { topic: "", attachedDocumentIds: [], journalLessonTypeId: null };
            const stats = statsByLessonId.get(l.id) ?? { presentCount: null, classAverage: null };
            const header = `${l.date} • ${l.slotIndex}${l.groupNumber ? ` • гр ${l.groupNumber}` : ""}`;
            const tableFallback =
              journalTableWrapRef.current != null ? readSafeBoundingRect(journalTableWrapRef.current) : null;
            const pos = lessonPopoverPosition(lessonPopover.anchorRect, tableFallback);
            return createPortal(
              <div
                ref={lessonPopoverPanelRef}
                style={pos.style}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left shadow-xl"
                onMouseEnter={clearHoverCloseTimer}
                onMouseLeave={scheduleCloseLessonPopover}
              >
                <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-slate-900">{header}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="text-slate-500">Присутствуют</div>
                    <div className="text-slate-900">{stats.presentCount != null ? stats.presentCount : "—"}</div>
                    <div className="text-slate-500">Средний по классу</div>
                    <div className="text-slate-900">{stats.classAverage != null ? stats.classAverage.toFixed(2) : "—"}</div>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
                  {l.blockedByEvent ? (
                    <div className="text-sm text-amber-900">
                      Слот перекрыт мероприятием: <span className="font-semibold">{l.blockedByEvent.title}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-slate-500">Тема</div>
                      <input
                        key={`topic-${l.id}`}
                        defaultValue={meta.topic}
                        onBlur={(e) => {
                          if (!canEditLesson) return;
                          saveLessonMeta({ lessonId: l.id, topic: e.target.value });
                        }}
                        disabled={!canEditLesson}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-700"
                        placeholder="Тема урока"
                      />
                      <div className="mt-3 text-xs text-slate-500">Тип урока</div>
                      <select
                        value={meta.journalLessonTypeId ?? ""}
                        onChange={(e) => {
                          if (!canEditLesson) return;
                          const v = e.target.value;
                          void saveLessonMeta({ lessonId: l.id, journalLessonTypeId: v === "" ? null : v });
                        }}
                        disabled={Boolean(l.blockedByEvent) || !canEditLesson}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-50"
                      >
                        <option value="">— не выбран</option>
                        {(data.lessonTypes ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-3 text-xs text-slate-500">Документы журнала</div>
                      <div className="mt-1 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                        {journalDocsLoading ? <div className="text-xs text-slate-500">Загружаем справочник…</div> : null}
                        {!journalDocsLoading && journalDocTypes.length === 0 ? (
                          <div className="text-xs text-slate-500">Типы документов не настроены.</div>
                        ) : null}

                        {journalDocTypes.map((t) => {
                          const docs = docsByTypeId[t.id] ?? [];
                          const linkToken = buildJournalLessonLinkToken(l.id, t.id, l.groupNumber ?? null);
                          const slotDocs = docs.filter((d) => d.tags?.periods?.includes(linkToken));
                          const attachKey = `jlup:${l.id}:${t.id}`;
                          const uploading = savingKey === attachKey;
                          return (
                            <div key={t.id} className="mb-3 last:mb-0">
                              <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-100 px-2 py-1.5">
                                <div className="text-[11px] font-semibold leading-tight text-slate-800">{t.name}</div>
                                {!l.blockedByEvent && slotDocs.length === 0 && canEditLesson ? (
                                  <label className="shrink-0 cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800 hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                                    <input
                                      type="file"
                                      className="sr-only"
                                      disabled={uploading || journalDocsLoading || !token}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        e.target.value = "";
                                        if (!file || !token) return;
                                        setSavingKey(attachKey);
                                        void (async () => {
                                          try {
                                            clearHoverCloseTimer();
                                            await api.journalUploadLessonDocument(token, {
                                              file,
                                              timetableLessonId: l.id,
                                              journalDocumentTypeId: t.id,
                                              disciplineCode: data.discipline.code,
                                            });
                                            await reload();
                                            await refetchJournalDocumentsIndex();
                                          } catch (err) {
                                            setError(err instanceof Error ? err.message : "JOURNAL_DOC_UPLOAD_FAILED");
                                          } finally {
                                            setSavingKey(null);
                                          }
                                        })();
                                      }}
                                    />
                                    {uploading ? "…" : "Прикрепить документ"}
                                  </label>
                                ) : null}
                              </div>
                              <div className="mt-1 space-y-1.5">
                                {slotDocs.length === 0 ? (
                                  <div className="text-xs text-slate-500">
                                    {l.blockedByEvent ? "—" : !canEditLesson ? "Файл не прикреплён." : "Файл не прикреплён. Нажмите «Прикрепить документ»."}
                                  </div>
                                ) : (
                                  slotDocs.map((d) => {
                                    const replKey = `jlrepl:${l.id}:${d.id}`;
                                    const detKey = `jldet:${l.id}:${d.id}`;
                                    const replacing = savingKey === replKey;
                                    const detaching = savingKey === detKey;
                                    return (
                                      <div key={d.id} className="rounded-md border border-slate-100 bg-white px-2 py-1.5">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="break-words text-xs font-medium text-slate-900">{d.originalName}</div>
                                            <a
                                              href={`/files/${d.storageRelPath}`}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-[10px] font-medium text-sky-800 underline decoration-slate-300 hover:decoration-sky-600"
                                            >
                                              Открыть
                                            </a>
                                          </div>
                                          <div className="flex shrink-0 flex-wrap gap-1">
                                            <label
                                              className={[
                                                "rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700",
                                                canEditLesson ? "cursor-pointer hover:bg-slate-100" : "cursor-not-allowed opacity-50",
                                              ].join(" ")}
                                            >
                                              <input
                                                type="file"
                                                className="sr-only"
                                                disabled={replacing || journalDocsLoading || !token || Boolean(l.blockedByEvent) || !canEditLesson}
                                                onChange={(ev) => {
                                                  const file = ev.target.files?.[0];
                                                  ev.target.value = "";
                                                  if (!file || !token || l.blockedByEvent || !canEditLesson) return;
                                                  setSavingKey(replKey);
                                                  void (async () => {
                                                    try {
                                                      clearHoverCloseTimer();
                                                      await api.journalUploadLessonDocument(token, {
                                                        file,
                                                        timetableLessonId: l.id,
                                                        journalDocumentTypeId: t.id,
                                                        disciplineCode: data.discipline.code,
                                                      });
                                                      await reload();
                                                      await refetchJournalDocumentsIndex();
                                                    } catch (err) {
                                                      setError(err instanceof Error ? err.message : "JOURNAL_DOC_REPLACE_FAILED");
                                                    } finally {
                                                      setSavingKey(null);
                                                    }
                                                  })();
                                                }}
                                              />
                                              {replacing ? "…" : "Заменить документ"}
                                            </label>
                                            <button
                                              type="button"
                                              disabled={detaching || !token || Boolean(l.blockedByEvent) || !canEditLesson}
                                              onClick={() => {
                                                if (!token || !canEditLesson) return;
                                                setSavingKey(detKey);
                                                void (async () => {
                                                  try {
                                                    clearHoverCloseTimer();
                                                    await api.journalDetachLessonDocument(token, d.id, l.id);
                                                    await reload();
                                                    await refetchJournalDocumentsIndex();
                                                  } catch (err) {
                                                    setError(err instanceof Error ? err.message : "JOURNAL_DOC_DETACH_FAILED");
                                                  } finally {
                                                    setSavingKey(null);
                                                  }
                                                })();
                                              }}
                                              className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                                            >
                                              {detaching ? "…" : "Убрать с урока"}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 shrink-0 text-xs text-slate-500">
                        {savingKey === `meta:${l.id}` ? "Сохраняем…" : " "}
                      </div>
                    </>
                  )}
                </div>
              </div>,
              document.body,
            );
          })()
        : null}
    </div>
  );
}

