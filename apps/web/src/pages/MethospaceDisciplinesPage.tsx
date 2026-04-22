import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  playServiceSound,
  primeServiceAudioFromUserGestureAsync,
} from "../audio/systemSounds";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type SummaryItem = {
  baseCode: string;
  name: string;
  codes: string[];
  grades: number[];
  hasMaterials: boolean;
  hasRanges: boolean;
  missingMaterialsCodes: string[];
  missingRangesCodes: string[];
};

type ArchiveDoc = { id: string; originalName: string; storageRelPath: string; createdAt: string };

type GradeRangesDraft = Record<"1" | "2" | "3" | "4" | "5", { min: number; max: number }>;

type HeadTeacherTab = "disciplines" | "classes" | "journalSettings" | "quarters" | "workingSchedule";

const GRADE_MARKS = ["1", "2", "3", "4", "5"] as const;

function makeDefaultGradeRanges(): GradeRangesDraft {
  return { "1": { min: 0, max: 0 }, "2": { min: 0, max: 0 }, "3": { min: 0, max: 0 }, "4": { min: 0, max: 0 }, "5": { min: 0, max: 0 } };
}

function formatDocRef(doc: ArchiveDoc): { id: string; name: string; url: string } {
  return { id: doc.id, name: doc.originalName, url: `/files/${doc.storageRelPath}` };
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

const RU_TO_LAT: Record<string, string> = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ё: "E",
  Ж: "ZH",
  З: "Z",
  И: "I",
  Й: "I",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "C",
  Ч: "CH",
  Ш: "SH",
  Щ: "SH",
  Ы: "Y",
  Э: "E",
  Ю: "YU",
  Я: "YA",
  Ъ: "",
  Ь: "",
};

function makeDisciplineBaseCode(name: string): string {
  const raw = (name ?? "").trim();
  if (!raw) throw new Error("EMPTY_NAME");

  const letters = Array.from(raw)
    .filter((ch) => /\p{L}/u.test(ch))
    .slice(0, 5)
    .map((ch) => {
      const up = ch.toUpperCase();
      if (/[A-Z]/.test(up)) return up;
      if (RU_TO_LAT[up]) return RU_TO_LAT[up];
      const normalized = up.normalize("NFKD").replace(/[^\p{L}]/gu, "");
      return RU_TO_LAT[normalized] ?? normalized.replace(/[^A-Z]/g, "");
    })
    .join("");

  const base = letters.replace(/[^A-Z]/g, "").slice(0, 5);
  if (base.length < 3) throw new Error("NAME_TOO_SHORT_FOR_CODE");
  return base.padEnd(5, "X");
}

function makeDisciplineCode(args: { baseCode: string; grade: number }): string {
  const base = (args.baseCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(base)) throw new Error("INVALID_BASE_CODE");
  if (!Number.isInteger(args.grade) || args.grade <= 0) throw new Error("INVALID_GRADE");
  return `${base}${args.grade}`;
}

function getDisciplineVisual(name: string) {
  const lower = name.toLowerCase();

  if (/(матем|алгеб|геометр|информ|програм|робот)/.test(lower)) {
    return {
      icon: "∑",
      bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 45%, #93c5fd 100%)",
      glow: "rgba(59, 130, 246, 0.22)",
      chips: ["#eff6ff", "#dbeafe"],
    };
  }
  if (/(литер|русск|язык|филолог|чтени)/.test(lower)) {
    return {
      icon: "Аа",
      bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 45%, #fca5a5 100%)",
      glow: "rgba(245, 158, 11, 0.2)",
      chips: ["#fff7ed", "#ffedd5"],
    };
  }
  if (/(англ|немец|франц|иностр)/.test(lower)) {
    return {
      icon: "EN",
      bg: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 45%, #a7f3d0 100%)",
      glow: "rgba(14, 165, 233, 0.22)",
      chips: ["#ecfeff", "#cffafe"],
    };
  }
  if (/(истор|обществ|прав|географ)/.test(lower)) {
    return {
      icon: "◎",
      bg: "linear-gradient(135deg, #f5d0fe 0%, #e9d5ff 45%, #c4b5fd 100%)",
      glow: "rgba(168, 85, 247, 0.2)",
      chips: ["#faf5ff", "#f3e8ff"],
    };
  }
  if (/(биолог|хими|физик|астрон|естест)/.test(lower)) {
    return {
      icon: "⚗",
      bg: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 45%, #86efac 100%)",
      glow: "rgba(34, 197, 94, 0.22)",
      chips: ["#f0fdf4", "#dcfce7"],
    };
  }
  if (/(музык|искус|изо|дизайн|театр)/.test(lower)) {
    return {
      icon: "✦",
      bg: "linear-gradient(135deg, #ffe4e6 0%, #fecdd3 45%, #fbcfe8 100%)",
      glow: "rgba(244, 63, 94, 0.18)",
      chips: ["#fff1f2", "#ffe4e6"],
    };
  }

  return {
    icon: "•",
    bg: "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 45%, #bfdbfe 100%)",
    glow: "rgba(100, 116, 139, 0.18)",
    chips: ["#f8fafc", "#f1f5f9"],
  };
}

function DisciplineTile({
  item,
  role,
  editable = false,
  loading = false,
  onOpen,
  onRemove,
}: {
  item: SummaryItem;
  role?: string;
  editable?: boolean;
  loading?: boolean;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const visual = getDisciplineVisual(item.name);
  const content = (
    <>
      <div
        className="relative aspect-square overflow-hidden rounded-[1.35rem] border border-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
        style={{ background: visual.bg, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.7), 0 18px 36px ${visual.glow}` }}
      >
        <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.5),transparent_60%)]" />
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-start justify-end gap-2">
            <div className="rounded-2xl bg-white/58 px-4 py-2 text-2xl font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
              {visual.icon}
            </div>
          </div>
          <div className="space-y-2">
            <div className="line-clamp-2 text-xl font-semibold leading-tight text-slate-900">{item.name}</div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-700">
              <span className="rounded-full bg-white/72 px-2.5 py-1 backdrop-blur-sm">Классы: {item.grades.join(", ") || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
          <span className={`rounded-full px-2.5 py-1 ${item.hasMaterials ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {item.hasMaterials ? "Материалы есть" : "Материалов нет"}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${item.hasRanges ? "bg-cyan-50 text-cyan-700" : "bg-amber-50 text-amber-700"}`}>
            {item.hasRanges ? "Диапазоны настроены" : "Диапазонов нет"}
          </span>
        </div>

        {role === "director" ? (
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            Нет материалов: <span className="font-semibold text-slate-900">{item.missingMaterialsCodes.length}</span> • Нет диапазонов:{" "}
            <span className="font-semibold text-slate-900">{item.missingRangesCodes.length}</span>
          </div>
        ) : null}

        {editable ? (
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-[11px] font-medium text-slate-500">Открыть форму редактирования</div>
            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                void onRemove?.();
              }}
              className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Удалить
            </button>
          </div>
        ) : null}
      </div>
    </>
  );

  const className =
    "ed-card ed-card-interactive ed-interactive group block rounded-[1.6rem] border border-slate-200/90 bg-white/95 p-3 text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)]";

  if (editable) {
    return (
      <div
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen?.();
        }}
        className={className}
      >
        {content}
      </div>
    );
  }

  return (
    <Link to={`/section/methospace/${encodeURIComponent(item.baseCode)}`} className={className}>
      {content}
    </Link>
  );
}

export function MethospaceDisciplinesPage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const role = auth.user?.primaryRole;

  if (role === "head_teacher" || role === "director" || role === "sysadmin") {
    return <HeadTeacherMethospacePage token={token} />;
  }

  return <NonHeadTeacherMethospaceDisciplinesPage token={token} role={role} />;
}

function NonHeadTeacherMethospaceDisciplinesPage({ token, role }: { token: string; role?: string }) {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(() => role === "teacher", [role]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.methospaceDisciplineSummary(token, mine);
      setItems(res.items as SummaryItem[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, mine]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5" data-dedus-id="methospace.disciplines">
        <div className="text-sm text-slate-500">Методическое пространство</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Дисциплины</h2>
        <div className="mt-2 text-sm text-slate-700">
          {role === "director"
            ? "Общий обзор обеспеченности: где нет материалов и где не настроены диапазоны."
            : "Ваши дисциплины и методпакеты в рамках закреплённых предметов."}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void refresh()}
            className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm font-medium"
          >
            Обновить
          </button>
          {loading ? <div className="text-sm text-slate-500">Загрузка…</div> : null}
          {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        </div>
      </div>

      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">
          Всего дисциплин: <span className="font-medium text-slate-900">{items.length}</span>
        </div>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {items.map((x) => (
            <DisciplineTile key={x.baseCode} item={x} role={role} />
          ))}
          {items.length === 0 ? <div className="text-sm text-slate-600">Пока нет дисциплин или они не назначены вам.</div> : null}
        </div>
      </div>
    </div>
  );
}

function HeadTeacherMethospacePage({ token }: { token: string }) {
  const [tab, setTab] = useState<HeadTeacherTab>("disciplines");

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5" data-dedus-id="methospace.disciplines">
        <div className="text-sm text-slate-500">Методическое пространство</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Управление</h2>
        <div className="mt-3 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab("disciplines")}
            className={[
              "ed-btn ed-interactive rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium",
              tab === "disciplines"
                ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                : "border-transparent bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Дисциплины
          </button>
          <button
            onClick={() => setTab("classes")}
            className={[
              "ed-btn ed-interactive rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium",
              tab === "classes" ? "border-indigo-600 bg-indigo-50 text-indigo-900" : "border-transparent bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Классы
          </button>
          <button
            onClick={() => setTab("journalSettings")}
            className={[
              "ed-btn ed-interactive rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium",
              tab === "journalSettings"
                ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                : "border-transparent bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Настройки журнала
          </button>
          <button
            onClick={() => setTab("quarters")}
            className={[
              "ed-btn ed-interactive rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium",
              tab === "quarters"
                ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                : "border-transparent bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Настройка четвертей
          </button>
          <button
            onClick={() => setTab("workingSchedule")}
            className={[
              "ed-btn ed-interactive rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium",
              tab === "workingSchedule"
                ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                : "border-transparent bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Рабочее расписание
          </button>
        </div>
      </div>

      {tab === "disciplines" ? <HeadTeacherDisciplinesTab token={token} /> : null}
      {tab === "classes" ? <HeadTeacherClassesTab token={token} /> : null}
      {tab === "journalSettings" ? (
        <div className="space-y-8">
          <HeadTeacherJournalDocumentTypesTab token={token} />
          <HeadTeacherJournalLessonTypesTab token={token} />
        </div>
      ) : null}
      {tab === "quarters" ? <HeadTeacherQuartersTab token={token} /> : null}
      {tab === "workingSchedule" ? <HeadTeacherWorkingScheduleTab token={token} /> : null}
    </div>
  );
}

function HeadTeacherQuartersTab({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quarters, setQuarters] = useState<Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>>([
    { index: 1, startDate: "", endDate: "" },
    { index: 2, startDate: "", endDate: "" },
    { index: 3, startDate: "", endDate: "" },
    { index: 4, startDate: "", endDate: "" },
  ]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.methospaceQuarters(token);
      if ((res.quarters ?? []).length === 4) setQuarters(res.quarters);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="text-sm text-slate-500">Настройка четвертей</div>
      <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Периоды учебного года</h3>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {quarters.map((q, idx) => (
          <div key={q.index} className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-900">{q.index} четверть</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600">
                Начало
                <input
                  type="date"
                  value={q.startDate}
                  onChange={(e) =>
                    setQuarters((prev) => prev.map((item, i) => (i === idx ? { ...item, startDate: e.target.value } : item)))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Конец
                <input
                  type="date"
                  value={q.endDate}
                  onChange={(e) =>
                    setQuarters((prev) => prev.map((item, i) => (i === idx ? { ...item, endDate: e.target.value } : item)))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
            </div>
            {idx > 0 ? (
              <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Каникулы: между {quarters[idx - 1]!.endDate || "—"} и {q.startDate || "—"}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
      <div className="mt-4 flex gap-2">
        <button onClick={() => void refresh()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900">
          Обновить
        </button>
        <button
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await api.updateMethospaceQuarters(token, quarters);
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ---------------------------
// Tab: Дисциплины
// ---------------------------

function HeadTeacherDisciplinesTab({
  token,
}: {
  token: string;
}) {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.methospaceDisciplineSummary(token, false);
      setItems(res.items as SummaryItem[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [editor, setEditor] = useState<{
    open: boolean;
    mode: "create" | "edit";
    baseCode?: string;
  }>({ open: false, mode: "create" });

  const openCreate = useCallback(() => setEditor({ open: true, mode: "create" }), []);
  const openEdit = useCallback((baseCode: string) => setEditor({ open: true, mode: "edit", baseCode }), []);

  const closeEditor = useCallback(() => setEditor({ open: false, mode: "create" }), []);

  const removeDiscipline = useCallback(
    async (baseCode: string, name: string) => {
      if (loading) return;
      const ok = window.confirm(`Вы действительно хотите удалить «${name}»? Это действие нельзя отменить.`);
      if (!ok) return;
      setLoading(true);
      setError(null);
      try {
        await api.deleteDiscipline(token, baseCode);
        if (editor.open && editor.mode === "edit" && editor.baseCode === baseCode) closeEditor();
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [closeEditor, editor.baseCode, editor.mode, editor.open, loading, refresh, token],
  );

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Дисциплины</div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Управление предметами</h3>
            <div className="mt-1 text-sm text-slate-600">Название, диапазоны оценок и привязанные стандартизирующие документы.</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refresh()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900">
              Обновить
            </button>
            <button
              onClick={() => openCreate()}
              className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium"
              disabled={loading}
            >
              Добавить дисциплину
            </button>
          </div>
        </div>
        {loading ? <div className="mt-3 text-sm text-slate-500">Загрузка…</div> : null}
        {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}
      </div>

      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">
          Всего дисциплин: <span className="font-medium text-slate-900">{items.length}</span>
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {items.map((x) => (
            <DisciplineTile
              key={x.baseCode}
              item={x}
              editable
              loading={loading}
              onOpen={() => openEdit(x.baseCode)}
              onRemove={() => removeDiscipline(x.baseCode, x.name)}
            />
          ))}

          {/* Серый “плюс” */}
          <button
            onClick={() => openCreate()}
            className="ed-card ed-card-interactive ed-interactive flex aspect-square flex-col items-center justify-center rounded-[1.6rem] border-2 border-dashed border-slate-200 bg-slate-50 p-8"
          >
            <div className="text-4xl font-semibold text-slate-400">+</div>
            <div className="mt-2 text-sm font-medium text-slate-600">Добавить дисциплину</div>
          </button>

          {items.length === 0 ? (
            <div className="md:col-span-2" />
          ) : null}
        </div>
      </div>

      <DisciplineEditorModal
        token={token}
        open={editor.open}
        mode={editor.mode}
        baseCode={editor.baseCode}
        onClose={() => closeEditor()}
        onSaved={() => {
          closeEditor();
          void refresh();
        }}
      />
    </div>
  );
}

function DisciplineEditorModal({
  token,
  open,
  mode,
  baseCode,
  onClose,
  onSaved,
}: {
  token: string;
  open: boolean;
  mode: "create" | "edit";
  baseCode?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classesOptions, setClassesOptions] = useState<number[]>([]);

  const [nameDraft, setNameDraft] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [gradeRangesDraft, setGradeRangesDraft] = useState<GradeRangesDraft>(makeDefaultGradeRanges());

  const [docs, setDocs] = useState<ArchiveDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  const [existing, setExisting] = useState<null | {
    baseCode: string;
    name: string;
    grades: number[];
    codesByGrade: Record<number, string>;
  }>(null);

  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedDocId) ?? null, [docs, selectedDocId]);

  useEffect(() => {
    if (!selectedDocId) return;
    if (docs.length === 0) return;
    if (!docs.some((d) => d.id === selectedDocId)) setSelectedDocId("");
  }, [docs, selectedDocId]);

  const selectedDisciplineCodeForDocs = useMemo(() => {
    if (!existing) return null;
    const sorted = [...selectedGrades].sort((a, b) => a - b);
    for (const grade of sorted) {
      const code = existing.codesByGrade[grade];
      if (code) return code;
    }
    return null;
  }, [existing, selectedGrades]);

  const uploadDisabled = useMemo(() => {
    if (busy) return true;
    if (selectedGrades.length === 0) return true;
    if (mode === "create" && !nameDraft.trim()) return true;
    return false;
  }, [busy, mode, nameDraft, selectedGrades.length]);

  const refreshClasses = useCallback(async () => {
    const res = await api.methospaceClasses(token);
    const gs = (res.classes ?? []).map((c) => c.grade).filter((g: unknown): g is number => typeof g === "number");
    setClassesOptions(gs.sort((a, b) => a - b));
  }, [token]);

  const refreshDocs = useCallback(async () => {
    if (mode !== "create" && mode !== "edit") return;
    setDocs([]);

    const firstGrade = [...selectedGrades].sort((a, b) => a - b)[0];
    if (!firstGrade) return;

    try {
      if (mode === "edit" && selectedDisciplineCodeForDocs) {
        const r = await api.documentsList(token, {
          officeSection: "methospace",
          disciplineCode: selectedDisciplineCodeForDocs,
          grade: undefined,
        });
        setDocs(r.documents as ArchiveDoc[]);
        return;
      }

      // create: ограничиваемся grade по тегам документов (officeSection document_archive).
      const r = await api.documentsList(token, {
        officeSection: "document_archive",
        grade: firstGrade,
      });
      setDocs(r.documents as ArchiveDoc[]);
    } catch {
      setDocs([]);
    }
  }, [mode, token, selectedDisciplineCodeForDocs, selectedGrades]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setNameDraft("");
    setSelectedGrades([]);
    setGradeRangesDraft(makeDefaultGradeRanges());
    setDocs([]);
    setSelectedDocId("");
    setExisting(null);

    void refreshClasses();

    if (mode === "edit" && baseCode) {
      void (async () => {
        try {
          const res = await api.methospaceDisciplineByBase(token, baseCode);
          const disciplines = res.disciplines as Array<any>;
          const codesByGrade: Record<number, string> = {};
          for (const d of disciplines) codesByGrade[d.grade] = d.code;

          const docsFromDiscipline = res.documents as Array<{ id: string; name: string; url: string }>;
          const firstDoc = docsFromDiscipline?.[0] ?? null;

          setNameDraft(res.name ?? "");
          setSelectedGrades(res.grades ?? []);
          setGradeRangesDraft(
            disciplines?.[0]?.gradeRanges ? (disciplines[0].gradeRanges as GradeRangesDraft) : makeDefaultGradeRanges(),
          );
          setExisting({
            baseCode: res.baseCode,
            name: res.name ?? "",
            grades: res.grades ?? [],
            codesByGrade,
          });

          // docs drop-down загрузим отдельным эффектом refreshDocs, а после подберём выбранный документ.
          setSelectedDocId(firstDoc?.id ? firstDoc.id : "");
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    }
  }, [open, mode, baseCode, token, refreshClasses]);

  useEffect(() => {
    if (!open) return;
    void refreshDocs();
  }, [open, refreshDocs]);

  const updateRangeDraft = useCallback((mark: (typeof GRADE_MARKS)[number], key: "min" | "max", v: string) => {
    const parsed = parseHundredths(v);
    setGradeRangesDraft((prev) => ({
      ...prev,
      [mark]: {
        min: key === "min" ? (parsed ?? prev[mark].min) : prev[mark].min,
        max: key === "max" ? (parsed ?? prev[mark].max) : prev[mark].max,
      },
    }));
  }, []);

  const uploadNewDocument = useCallback(
    async (file: File) => {
      if (busy) return;
      if (!selectedGrades.length) {
        setError("Выберите хотя бы один класс для загрузки документа.");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        // В режиме редактирования дисциплина уже существует, поэтому можем загрузить
        // сразу в «Документы -> Дисциплины» (а не в «Отдельные документы»),
        // чтобы она отобразилась в выпадающем списке.
        if (mode === "edit" && selectedDisciplineCodeForDocs) {
          const res = await api.uploadDocument(token, {
            file,
            disciplineCode: selectedDisciplineCodeForDocs,
            isStandardizing: true,
          });

          const newDocRef: ArchiveDoc = {
            id: res.document.id,
            originalName: res.document.originalName,
            storageRelPath: res.document.storageRelPath,
            createdAt: res.document.createdAt,
          };

          setDocs((prev) => {
            if (prev.some((d) => d.id === newDocRef.id)) return prev;
            return [newDocRef, ...prev];
          });
          setSelectedDocId(newDocRef.id);
          await refreshDocs();
          return;
        }

        const sortedGrades = [...selectedGrades].sort((a, b) => a - b);
        const firstGrade = sortedGrades[0]!;

        const baseCodeToUse =
          mode === "edit"
            ? String(baseCode ?? "").trim().toUpperCase()
            : makeDisciplineBaseCode(nameDraft.trim()).trim().toUpperCase();

        const codes = sortedGrades.map((g) => makeDisciplineCode({ baseCode: baseCodeToUse, grade: g }));
        const tags = {
          disciplineCodes: codes,
          grades: sortedGrades,
          roles: [],
          periods: [],
        };

        // В “folder” храним пример для минимального grade:
        // tags.disciplineCodes покрывают все выбранные grades, чтобы документ находился по каждому коду.
        const folder = {
          schoolId: "school-1",
          officeSection: "document_archive",
          disciplineCode: codes[0],
          grade: firstGrade,
        };

        const res = await api.uploadDocument(token, { file, tags, folder });
        const newDocRef: ArchiveDoc = {
          id: res.document.id,
          originalName: res.document.originalName,
          storageRelPath: res.document.storageRelPath,
          createdAt: res.document.createdAt,
        };

        // Сразу добавляем в выпадающий список, чтобы сохранение дисциплины
        // не зависело от асинхронного refreshDocs().
        setDocs((prev) => {
          if (prev.some((d) => d.id === newDocRef.id)) return prev;
          return [newDocRef, ...prev];
        });
        setSelectedDocId(newDocRef.id);

        await refreshDocs();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [baseCode, busy, mode, nameDraft, refreshDocs, selectedGrades, token],
  );

  const toggleGrade = useCallback(
    (g: number) => {
      setSelectedGrades((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].sort((a, b) => a - b)));
    },
    [setSelectedGrades],
  );

  const save = useCallback(async () => {
    if (!open) return;
    await primeServiceAudioFromUserGestureAsync();
    setBusy(true);
    setError(null);
    try {
      const trimmedName = nameDraft.trim();
      if (!trimmedName) throw new Error("Введите название дисциплины");
      if (selectedGrades.length === 0) throw new Error("Выберите хотя бы один класс (grade)");

      const docsArg = selectedDoc ? [formatDocRef(selectedDoc)] : [];

      if (mode === "create") {
        await api.createDiscipline(token, {
          name: trimmedName,
          grades: selectedGrades,
          documents: docsArg,
          gradeRanges: gradeRangesDraft,
        });
      } else {
        if (!baseCode) throw new Error("baseCode отсутствует");

        // 1) обновляем существующие коды по выбранным grades
        if (existing) {
          const existingGrades = new Set(existing.grades);
          const keepGrades = selectedGrades.filter((g) => existingGrades.has(g));
          const createGrades = selectedGrades.filter((g) => !existingGrades.has(g));

          const updateCalls: Promise<any>[] = [];
          for (const g of keepGrades) {
            const code = existing.codesByGrade[g];
            updateCalls.push(
              api.updateDiscipline(token, code, {
                name: trimmedName,
                gradeRanges: gradeRangesDraft,
                documents: docsArg,
              }),
            );
          }

          if (createGrades.length) {
            // 2) добавляем недостающие grades, фиксируя baseCode (чтобы новые коды попали в ту же группу).
            await api.createDiscipline(token, {
              name: trimmedName,
              baseCode: baseCode,
              grades: createGrades,
              documents: docsArg,
              gradeRanges: gradeRangesDraft,
            });
          }

          await Promise.all(updateCalls);
        }
      }

      playServiceSound("success");
      onSaved();
    } catch (e) {
      playServiceSound("error");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [open, baseCode, existing, gradeRangesDraft, mode, nameDraft, onSaved, selectedDoc, selectedGrades, token]);

  const removeDiscipline = useCallback(async () => {
    if (mode !== "edit" || !baseCode) return;
    const ok = window.confirm(`Вы действительно хотите удалить дисциплину «${nameDraft || baseCode}»? Это действие нельзя отменить.`);
    if (!ok) return;
    await primeServiceAudioFromUserGestureAsync();
    setBusy(true);
    setError(null);
    try {
      await api.deleteDiscipline(token, baseCode);
      playServiceSound("success");
      onSaved();
    } catch (e) {
      playServiceSound("error");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [baseCode, mode, nameDraft, onSaved, token]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Методическое пространство • Дисциплины</div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              {mode === "create" ? "Добавить дисциплину" : `Редактировать: ${baseCode ?? ""}`}
            </h3>
          </div>
          <button onClick={() => onClose()} className="ed-btn ed-btn-close ed-interactive px-3 py-2 text-sm font-medium">
            Закрыть
          </button>
        </div>

        {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            <div className="text-slate-600">Название дисциплины</div>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
              placeholder="Например: Математика"
              disabled={busy}
            />
          </label>

          <div>
            <div className="text-sm text-slate-600">Классы, где ведётся дисциплина</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {classesOptions.length ? (
                classesOptions.map((g) => (
                  <label key={g} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                    <input type="checkbox" checked={selectedGrades.includes(g)} onChange={() => toggleGrade(g)} disabled={busy} />
                    <span className="font-medium text-slate-900">{g}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-slate-500">Загружаем список классов…</div>
              )}
            </div>
            {mode === "edit" ? (
              <div className="mt-2 text-xs text-slate-600">
                Удаление классов из дисциплины сейчас не предусмотрено (можно добавлять, но нельзя убирать существующие коды).
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-sm text-slate-600">Диапазоны оценок (1–5): минимум/максимум</div>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              {GRADE_MARKS.map((m) => (
                <div key={m} className="rounded-2xl border border-slate-200 p-3">
                  <div className="text-xs font-medium text-slate-700">Оценка {m}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block text-xs text-slate-600">
                      минимум
                      <input
                        type="number"
                        step={0.01}
                        value={gradeRangesDraft[m].min}
                        onChange={(e) => updateRangeDraft(m, "min", e.target.value.replace(",", "."))}
                        disabled={busy}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-900"
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      максимум
                      <input
                        type="number"
                        step={0.01}
                        value={gradeRangesDraft[m].max}
                        onChange={(e) => updateRangeDraft(m, "max", e.target.value.replace(",", "."))}
                        disabled={busy}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-900"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm text-slate-600">Привязанный стандартизирующий документ</div>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <div className="text-slate-600">Документ из «Документов»</div>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                >
                  <option value="">(нет документа)</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="block text-sm">
                <div className="text-slate-600">Загрузить новый документ</div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="upload-new-discipline-doc"
                    type="file"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void uploadNewDocument(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <label
                    htmlFor="upload-new-discipline-doc"
                    className={[
                      "rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white",
                      uploadDisabled ? "cursor-not-allowed opacity-40 pointer-events-none" : "hover:bg-slate-800",
                    ].join(" ")}
                  >
                    Загрузить новый документ
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Можно выбрать документ из системы или загрузить новый с компьютера.
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {mode === "edit" ? (
              <button
                type="button"
                onClick={() => void removeDiscipline()}
                className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm font-medium"
                disabled={busy}
              >
                Удалить дисциплину
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
          <Link
            to={mode === "edit" && baseCode ? `/section/methospace/${encodeURIComponent(baseCode)}` : "#"}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            onClick={(e) => {
              if (!(mode === "edit" && baseCode)) e.preventDefault();
            }}
          >
            Методические пакеты
          </Link>
          <button
            onClick={() => void save()}
            className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40"
            disabled={busy}
          >
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------
// Tab: Классы
// ---------------------------

function HeadTeacherClassesTab({ token }: { token: string }) {
  const [classes, setClasses] = useState<Array<{ grade: number; studentCount: number }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [studentsModal, setStudentsModal] = useState<{ open: boolean; grade: number | null }>({ open: false, grade: null });
  const [students, setStudents] = useState<Array<{ userId: string; fio: string; groupNumber: number }> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.methospaceClasses(token);
      setClasses(res.classes ?? []);
    } catch (e) {
      setError((e as Error).message);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openStudents = useCallback(
    async (grade: number) => {
      setStudentsModal({ open: true, grade });
      setStudents(null);
      try {
        const res = await api.methospaceClassStudents(token, grade);
        setStudents(res.students ?? []);
      } catch (e) {
        setStudents([]);
      }
    },
    [token],
  );

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="text-sm text-slate-500">Классы</div>
      <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Сводка по ученикам</h3>

      {loading ? <div className="mt-3 text-sm text-slate-500">Загрузка…</div> : null}
      {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(classes ?? []).map((c) => (
          <button
            key={c.grade}
            onClick={() => void openStudents(c.grade)}
            className="ed-card ed-card-interactive ed-interactive p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{c.grade} класс</div>
                <div className="mt-1 text-xs text-slate-500">Открыть список учеников</div>
              </div>
              <div className="text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{c.studentCount} учеников</span>
              </div>
            </div>
          </button>
        ))}
        {!loading && (classes ?? []).length === 0 ? (
          <div className="md:col-span-2 text-sm text-slate-600">Пока нет классов.</div>
        ) : null}
      </div>

      {studentsModal.open && studentsModal.grade != null ? (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Класс</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{studentsModal.grade} класс</h3>
              </div>
              <button
                onClick={() => setStudentsModal({ open: false, grade: null })}
                className="ed-btn ed-btn-close ed-interactive px-3 py-2 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-slate-200">
              {students == null ? (
                <div className="p-4 text-sm text-slate-500">Загружаем…</div>
              ) : students.length === 0 ? (
                <div className="p-4 text-sm text-slate-600">Нет учеников.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {students.map((s) => (
                    <div key={s.userId} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{s.fio}</div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-600">гр {s.groupNumber}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------
// Tab: Настройки журнала
// ---------------------------

function HeadTeacherJournalDocumentTypesTab({ token }: { token: string }) {
  const [types, setTypes] = useState<Array<{ id: string; name: string; description: string; requiredForLessonTypeIds?: string[] }> | null>(null);
  const [lessonTypes, setLessonTypes] = useState<Array<{ id: string; name: string }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<{ open: boolean; mode: "create" | "edit"; typeId?: string }>({ open: false, mode: "create" });
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftRequiredLessonTypeIds, setDraftRequiredLessonTypeIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, lesson] = await Promise.all([api.methospaceJournalDocumentTypes(token), api.methospaceJournalLessonTypes(token)]);
      setTypes(res.types ?? []);
      setLessonTypes((lesson.types ?? []).map((x) => ({ id: x.id, name: x.name })));
    } catch (e) {
      setTypes([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!editor.open) return;
    if (editor.mode === "create") {
      setDraftName("");
      setDraftDescription("");
      setDraftRequiredLessonTypeIds([]);
      return;
    }
    const t = types?.find((x) => x.id === editor.typeId);
    if (t) {
      setDraftName(t.name ?? "");
      setDraftDescription(t.description ?? "");
      setDraftRequiredLessonTypeIds(t.requiredForLessonTypeIds ?? []);
    }
  }, [editor.open, editor.mode, editor.typeId, types]);

  const save = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (editor.mode === "create") {
        await api.createJournalDocumentType(token, {
          name: draftName,
          description: draftDescription,
          requiredForLessonTypeIds: draftRequiredLessonTypeIds,
        } as any);
      } else if (editor.typeId) {
        await api.updateJournalDocumentType(token, editor.typeId, {
          name: draftName,
          description: draftDescription,
          requiredForLessonTypeIds: draftRequiredLessonTypeIds,
        } as any);
      }
      setEditor({ open: false, mode: "create" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [draftDescription, draftName, draftRequiredLessonTypeIds, editor.mode, editor.typeId, refresh, token]);

  const remove = useCallback(async () => {
    if (editor.mode !== "edit" || !editor.typeId) return;
    const ok = window.confirm(`Вы действительно хотите удалить «${draftName || "тип документа"}»? Это действие нельзя отменить.`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      await api.deleteJournalDocumentType(token, editor.typeId);
      setEditor({ open: false, mode: "create" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [editor.mode, editor.typeId, refresh, token]);

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Настройки журнала</div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Типы документов</h3>
          <div className="mt-1 text-sm text-slate-600">
            Влияют на список документов в поповере журнала.
            <div className="mt-1 text-xs text-slate-500">Документы попадают сюда, если при загрузке файла указан нужный тип.</div>
          </div>
        </div>
        <button onClick={() => setEditor({ open: true, mode: "create" })} className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={loading}>
          Добавить тип документа
        </button>
      </div>

      {loading && types == null ? <div className="mt-4 text-sm text-slate-500">Загрузка…</div> : null}
      {error ? <div className="mt-4 text-sm text-rose-600">{error}</div> : null}

      <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {(types ?? []).map((t) => (
          <button
            key={t.id}
            onClick={() => setEditor({ open: true, mode: "edit", typeId: t.id })}
            className="ed-card ed-card-interactive ed-interactive flex h-44 flex-col items-start justify-between p-4 text-left"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
              {t.description ? <div className="mt-1 line-clamp-2 text-xs text-slate-600">{t.description}</div> : null}
            </div>
            <div className="text-xs text-slate-500">Редактировать</div>
          </button>
        ))}

        {/* “+” */}
        {(types ?? []).length === 0 ? (
          <button
            onClick={() => setEditor({ open: true, mode: "create" })}
            className="ed-card ed-card-interactive ed-interactive flex h-44 flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50"
          >
            <div className="text-4xl font-semibold text-slate-400">+</div>
            <div className="mt-2 text-sm font-medium text-slate-600">Добавить тип</div>
          </button>
        ) : (
          <button
            onClick={() => setEditor({ open: true, mode: "create" })}
            className="ed-card ed-card-interactive ed-interactive flex h-44 flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50"
          >
            <div className="text-4xl font-semibold text-slate-400">+</div>
            <div className="mt-2 text-sm font-medium text-slate-600">Добавить тип</div>
          </button>
        )}
      </div>

      {editor.open ? (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Тип документа журнала</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  {editor.mode === "create" ? "Добавить тип" : "Редактировать тип"}
                </h3>
              </div>
              <button onClick={() => setEditor({ open: false, mode: "create" })} className="ed-btn ed-btn-close ed-interactive px-3 py-2 text-sm font-medium">
                Закрыть
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <div className="text-slate-600">Название документа</div>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                />
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Описание</div>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  disabled={loading}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                />
              </label>
              <div className="block text-sm">
                <div className="text-slate-600">Обязателен для типов уроков</div>
                <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2">
                  {(lessonTypes ?? []).map((lt) => (
                    <label key={lt.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                      <span>{lt.name}</span>
                      <input
                        type="checkbox"
                        checked={draftRequiredLessonTypeIds.includes(lt.id)}
                        onChange={(e) =>
                          setDraftRequiredLessonTypeIds((prev) =>
                            e.target.checked ? [...prev, lt.id] : prev.filter((x) => x !== lt.id),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Если ничего не выбрано, тип документа считается обязательным для всех типов уроков.
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {editor.mode === "edit" ? (
                <button
                  onClick={() => void remove()}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                  disabled={loading}
                >
                  Удалить
                </button>
              ) : (
                <div />
              )}
              <button onClick={() => void save()} className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={loading}>
                {loading ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeadTeacherJournalLessonTypesTab({ token }: { token: string }) {
  const [res, setRes] = useState<{
    types: Array<{
      id: string;
      name: string;
      description: string;
      disciplineCodes: string[];
      standardDocumentId: string | null;
      colorKey: string;
    }>;
    colorPalette: Array<{ key: string; hex: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<{ open: boolean; mode: "create" | "edit"; typeId?: string }>({ open: false, mode: "create" });
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftColorKey, setDraftColorKey] = useState("neutral_blue_gray");
  const [draftDisciplineCodes, setDraftDisciplineCodes] = useState("");
  const [uploadDisciplineCode, setUploadDisciplineCode] = useState("");
  const [allCodes, setAllCodes] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, d] = await Promise.all([api.methospaceJournalLessonTypes(token), api.methospaceDisciplinesList(token)]);
      setRes(r as any);
      setAllCodes((d.disciplines ?? []).map((x) => x.code).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setRes(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!editor.open) return;
    if (editor.mode === "create") {
      setDraftName("");
      setDraftDescription("");
      setDraftColorKey("neutral_blue_gray");
      setDraftDisciplineCodes("");
      setUploadDisciplineCode(allCodes[0] ?? "");
      return;
    }
    const t = res?.types?.find((x) => x.id === editor.typeId);
    if (t) {
      setDraftName(t.name ?? "");
      setDraftDescription(t.description ?? "");
      setDraftColorKey(t.colorKey ?? "neutral_blue_gray");
      setDraftDisciplineCodes((t.disciplineCodes ?? []).join(", "));
      setUploadDisciplineCode((t.disciplineCodes ?? [])[0] ?? allCodes[0] ?? "");
    }
  }, [editor.open, editor.mode, editor.typeId, res?.types, allCodes]);

  const save = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const codes = draftDisciplineCodes
        .split(/[,;\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (editor.mode === "create") {
        await api.createJournalLessonType(token, {
          name: draftName,
          description: draftDescription,
          colorKey: draftColorKey,
          disciplineCodes: codes,
        });
      } else if (editor.typeId) {
        await api.updateJournalLessonType(token, editor.typeId, {
          name: draftName,
          description: draftDescription,
          colorKey: draftColorKey,
          disciplineCodes: codes,
        });
      }
      setEditor({ open: false, mode: "create" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [draftColorKey, draftDescription, draftDisciplineCodes, draftName, editor.mode, editor.typeId, refresh, token]);

  const remove = useCallback(async () => {
    if (editor.mode !== "edit" || !editor.typeId) return;
    const ok = window.confirm(`Вы действительно хотите удалить «${draftName || "тип урока"}»? Это действие нельзя отменить.`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      await api.deleteJournalLessonType(token, editor.typeId);
      setEditor({ open: false, mode: "create" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [editor.mode, editor.typeId, refresh, token]);

  const palette = res?.colorPalette ?? [];

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Настройки журнала</div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Типы уроков</h3>
          <div className="mt-1 text-sm text-slate-600">
            Цвет колонок в журнале, эталонный документ для методического пространства.
            <div className="mt-1 text-xs text-slate-500">
              Укажите коды дисциплин (MATEM5…), чтобы эталон показывался в карточке этой дисциплины. Пусто — тип только в журнале.
            </div>
          </div>
        </div>
        <button
          onClick={() => setEditor({ open: true, mode: "create" })}
          className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40"
          disabled={loading}
        >
          Добавить тип урока
        </button>
      </div>

      {loading && res == null ? <div className="mt-4 text-sm text-slate-500">Загрузка…</div> : null}
      {error ? <div className="mt-4 text-sm text-rose-600">{error}</div> : null}

      <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        {(res?.types ?? []).map((t) => {
          const hex = palette.find((p) => p.key === t.colorKey)?.hex ?? "#e2e8f0";
          return (
            <button
              key={t.id}
              onClick={() => setEditor({ open: true, mode: "edit", typeId: t.id })}
              className="ed-card ed-card-interactive ed-interactive flex h-44 flex-col items-start justify-between p-4 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: hex }} />
                  <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                </div>
                {t.description ? <div className="mt-1 line-clamp-2 text-xs text-slate-600">{t.description}</div> : null}
                {t.standardDocumentId ? <div className="mt-1 text-[11px] text-sky-800">Эталон прикреплён</div> : null}
              </div>
              <div className="text-xs text-slate-500">Редактировать</div>
            </button>
          );
        })}

        {(res?.types ?? []).length === 0 ? (
          <button
            onClick={() => setEditor({ open: true, mode: "create" })}
            className="ed-card ed-card-interactive ed-interactive flex h-44 flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50"
          >
            <div className="text-4xl font-semibold text-slate-400">+</div>
            <div className="mt-2 text-sm font-medium text-slate-600">Добавить тип урока</div>
          </button>
        ) : (
          <button
            onClick={() => setEditor({ open: true, mode: "create" })}
            className="ed-card ed-card-interactive ed-interactive flex h-44 flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50"
          >
            <div className="text-4xl font-semibold text-slate-400">+</div>
            <div className="mt-2 text-sm font-medium text-slate-600">Добавить тип урока</div>
          </button>
        )}
      </div>

      {editor.open ? (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Тип урока</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  {editor.mode === "create" ? "Добавить тип" : "Редактировать тип"}
                </h3>
              </div>
              <button
                onClick={() => setEditor({ open: false, mode: "create" })}
                className="ed-btn ed-btn-close ed-interactive px-3 py-2 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <div className="text-slate-600">Название</div>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                />
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Назначение / описание</div>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  disabled={loading}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                />
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Цвет колонки</div>
                <select
                  value={draftColorKey}
                  onChange={(e) => setDraftColorKey(e.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                >
                  {palette.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.key.replace(/_/g, " ")} ({p.hex})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Коды дисциплин для метод. пространства</div>
                <textarea
                  value={draftDisciplineCodes}
                  onChange={(e) => setDraftDisciplineCodes(e.target.value)}
                  disabled={loading}
                  rows={2}
                  placeholder="Например: MATEM5, RUSS6"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-300"
                />
              </label>
              {editor.mode === "edit" && editor.typeId ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-medium text-slate-900">Стандартизирующий документ</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="block text-xs text-slate-600">
                      Загрузить в папку дисциплины
                      <select
                        value={uploadDisciplineCode}
                        onChange={(e) => setUploadDisciplineCode(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                      >
                        {allCodes.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-600">
                      Файл
                      <input
                        type="file"
                        disabled={loading || !uploadDisciplineCode}
                        className="mt-1 w-full text-sm"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file || !editor.typeId) return;
                          setLoading(true);
                          void api
                            .uploadJournalLessonTypeStandardDocument(token, {
                              lessonTypeId: editor.typeId,
                              disciplineCode: uploadDisciplineCode,
                              file,
                            })
                            .then(() => refresh())
                            .catch((err) => setError(err instanceof Error ? err.message : "UPLOAD_FAILED"))
                            .finally(() => setLoading(false));
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {editor.mode === "edit" ? (
                <button
                  onClick={() => void remove()}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                  disabled={loading}
                >
                  Удалить
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={() => void save()}
                className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40"
                disabled={loading}
              >
                {loading ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------
// Tab: Рабочее расписание
// ---------------------------

function HeadTeacherWorkingScheduleTab({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [draftLunch, setDraftLunch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.timetableConfig(token);
      setDraftStart(res.config?.workdayStartTime ?? res.config?.dayStartTime ?? "");
      setDraftEnd(res.config?.workdayEndTime ?? res.config?.dayStartTime ?? "");
      setDraftLunch(res.config?.lunchTime ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.updateTimetableConfig(token, {
        workdayStartTime: draftStart,
        workdayEndTime: draftEnd,
        lunchTime: draftLunch,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [draftEnd, draftLunch, draftStart, refresh, token]);

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="text-sm text-slate-500">Рабочее расписание</div>
      <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Параметры рабочего дня</h3>
      <div className="mt-1 text-sm text-slate-600">Используется для индикаторов времени в интерфейсе.</div>

      {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <div className="text-slate-600">Начало рабочего дня</div>
          <input type="time" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} disabled={loading} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900" />
        </label>
        <label className="block text-sm">
          <div className="text-slate-600">Конец рабочего дня</div>
          <input type="time" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} disabled={loading} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900" />
        </label>
        <label className="block text-sm">
          <div className="text-slate-600">Время обеда</div>
          <input type="time" value={draftLunch} onChange={(e) => setDraftLunch(e.target.value)} disabled={loading} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900" />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => void save()} className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={loading}>
          {loading ? "Сохраняем…" : "Сохранить"}
        </button>
        {loading ? <div className="text-sm text-slate-500">…</div> : null}
      </div>
    </div>
  );
}

