import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { isoDateToday, pickQuarterForDate } from "../lib/quarters";
import { useAuth } from "../state/auth";

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftIsoDate(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return isoDate(d);
}

type DaySlotRow = {
  slotIndex: number;
  slotIndexEnd: number;
  timetableLessonId: string | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  mark: number | null;
  absent: boolean;
};

function padSix(slots: DaySlotRow[]): DaySlotRow[] {
  const empty = (idx: number): DaySlotRow => ({
    slotIndex: idx,
    slotIndexEnd: idx,
    timetableLessonId: null,
    disciplineCode: null,
    disciplineName: null,
    mark: null,
    absent: false,
  });
  const out = [...slots];
  let i = 0;
  while (out.length < 6) {
    out.push(empty(1000 + i));
    i += 1;
  }
  return out.slice(0, 6);
}

function chunkPages(slots: DaySlotRow[]): DaySlotRow[][] {
  const pages: DaySlotRow[][] = [];
  for (let i = 0; i < slots.length; i += 6) {
    pages.push(padSix(slots.slice(i, i + 6)));
  }
  return pages.length ? pages : [padSix([])];
}

function DiaryNotebookSpread({ slots }: { slots: DaySlotRow[] }) {
  const pages = chunkPages(slots);
  return (
    <div className="space-y-8">
      {pages.map((page, pi) => (
        <div key={pi} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-inner">
          <div className="grid grid-cols-2 gap-4">
            {/* левая «страница» */}
            <div className="space-y-0 rounded-xl border border-amber-100 bg-white p-2 shadow-sm">
              {[0, 1, 2].map((row) => (
                <DiarySlotLine key={`L-${pi}-${row}`} slot={page[row]!} labelSlot={row + 1 + pi * 6} side="left" rowInPage={row} />
              ))}
            </div>
            {/* правая «страница» */}
            <div className="space-y-0 rounded-xl border border-amber-100 bg-white p-2 shadow-sm">
              {[0, 1, 2].map((row) => (
                <DiarySlotLine key={`R-${pi}-${row}`} slot={page[row + 3]!} labelSlot={row + 4 + pi * 6} side="right" rowInPage={row} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DiarySlotLine(props: { slot: DaySlotRow; labelSlot: number; side: "left" | "right"; rowInPage: number }) {
  const { slot, labelSlot, side, rowInPage } = props;
  const isPad = slot.slotIndex >= 1000;
  const num = isPad
    ? String(labelSlot)
    : slot.slotIndex === slot.slotIndexEnd
      ? String(slot.slotIndex)
      : `${slot.slotIndex}–${slot.slotIndexEnd}`;
  const title = slot.disciplineName ?? "";
  const mark =
    slot.absent ? "н" : slot.mark != null && Number.isFinite(slot.mark) ? String(slot.mark) : slot.timetableLessonId ? "—" : "";

  return (
    <div
      className={[
        "flex min-h-[4.25rem] border-b border-slate-200/80 bg-[repeating-linear-gradient(transparent_0_23px,rgba(148,163,184,0.35)_24px)]",
        rowInPage === 2 ? "border-b-0" : "",
      ].join(" ")}
    >
      <div className="flex w-10 shrink-0 items-start justify-center border-r border-slate-200/80 pt-1 text-xs font-semibold text-slate-600">
        {num}
      </div>
      <div className="min-w-0 flex-1 px-2 pt-1">
        <div className={["text-sm font-medium leading-snug text-slate-900", side === "right" ? "text-right" : "text-left"].join(" ")}>
          {title}
        </div>
      </div>
      <div className="flex w-10 shrink-0 items-start justify-center border-l border-slate-200/80 pt-1 text-sm font-semibold text-slate-800">
        {mark}
      </div>
    </div>
  );
}

export function DiaryViewPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { studentUserId: studentUserIdParam } = useParams();
  const token = auth.accessToken;

  const [viewDate, setViewDate] = useState(() => isoDate(new Date()));

  const requestedStudentUserId = studentUserIdParam && studentUserIdParam !== "me" ? decodeURIComponent(studentUserIdParam) : undefined;

  const [data, setData] = useState<{
    from: string;
    to: string;
    student: { userId: string; fio: string; grade: number; groupNumber: number };
    lessons: Array<{
      timetableLessonId: string;
      date: string;
      slotIndex: number;
      disciplineCode: string;
      disciplineName: string;
      mark: number | null;
      absent: boolean;
    }>;
    daySlots?: DaySlotRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quarters, setQuarters] = useState<Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>>([]);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [quartersError, setQuartersError] = useState<string | null>(null);
  const [periodScope, setPeriodScope] = useState<"quarter" | "year">("quarter");
  const [finalOpen, setFinalOpen] = useState(false);
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [finalData, setFinalData] = useState<{
    subjects: Array<{ disciplineCode: string; disciplineName: string; average: number | null; finalMark: number | null }>;
    from: string;
    to: string;
  } | null>(null);

  const selectedQuarterRange = useMemo(() => quarters.find((q) => q.index === selectedQuarter) ?? null, [quarters, selectedQuarter]);

  const yearRange = useMemo(() => {
    if (quarters.length === 0) return null;
    const starts = quarters.map((q) => q.startDate).sort((a, b) => a.localeCompare(b));
    const ends = quarters.map((q) => q.endDate).sort((a, b) => a.localeCompare(b));
    return { from: starts[0]!, to: ends[ends.length - 1]! };
  }, [quarters]);

  useEffect(() => {
    if (!token) return;
    setQuartersError(null);
    void api
      .methospaceQuarters(token)
      .then((r) => {
        const nextQuarters = r.quarters ?? [];
        setQuarters(nextQuarters);
        const autoQuarter = pickQuarterForDate(nextQuarters, isoDateToday());
        if (autoQuarter) setSelectedQuarter(autoQuarter.index);
      })
      .catch((e) => setQuartersError((e as Error).message));
  }, [token]);

  const reload = useCallback(() => {
    if (!token) return;
    setError(null);
    setData(null);
    void api
      .diaryView(token, { from: viewDate, to: viewDate, studentUserId: requestedStudentUserId })
      .then((r) => setData(r))
      .catch((e) => setError((e as Error).message));
  }, [token, viewDate, requestedStudentUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const daySlots = data?.daySlots;

  const openFinalGrades = useCallback(async () => {
    if (!token || !data) return;
    const range =
      periodScope === "quarter"
        ? selectedQuarterRange
          ? { from: selectedQuarterRange.startDate, to: selectedQuarterRange.endDate }
          : null
        : yearRange;
    if (!range) {
      setFinalError("Не задан период (четверти не загружены).");
      setFinalOpen(true);
      return;
    }
    setFinalOpen(true);
    setFinalLoading(true);
    setFinalError(null);
    setFinalData(null);
    try {
      const studentArg = auth.user?.id && data.student.userId === auth.user.id ? undefined : data.student.userId;
      const r = await api.diaryFinalGrades(token, {
        from: range.from,
        to: range.to,
        studentUserId: studentArg,
      });
      setFinalData({ subjects: r.subjects, from: r.from, to: r.to });
    } catch (e) {
      setFinalError((e as Error).message);
    } finally {
      setFinalLoading(false);
    }
  }, [token, data, periodScope, selectedQuarterRange, yearRange, auth.user?.id]);

  const dayLabel = useMemo(() => {
    try {
      return new Date(`${viewDate}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    } catch {
      return viewDate;
    }
  }, [viewDate]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">Раздел • Дневник</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Дневник</h2>
          {data && (
            <div className="mt-1 text-sm text-slate-600">
              {data.student.fio} • {data.student.grade} класс • гр {data.student.groupNumber}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => nav("/section/diary")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← К выбору
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-sm" onClick={() => setViewDate((d) => shiftIsoDate(d, -1))}>
              ←
            </button>
            <div className="min-w-[12rem] text-center text-sm font-medium text-slate-900">{dayLabel}</div>
            <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-sm" onClick={() => setViewDate((d) => shiftIsoDate(d, 1))}>
              →
            </button>
            <input
              type="date"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <button onClick={reload} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
              Обновить
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void openFinalGrades()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Посмотреть итоговые оценки
        </button>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>Период для итогов:</span>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="periodScope" checked={periodScope === "quarter"} onChange={() => setPeriodScope("quarter")} />
            четверть
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="periodScope" checked={periodScope === "year"} onChange={() => setPeriodScope("year")} />
            год
          </label>
          {periodScope === "quarter" ? (
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4].map((quarter) => (
                <option key={quarter} value={quarter}>
                  {quarter} четверть
                </option>
              ))}
            </select>
          ) : null}
          {periodScope === "quarter" && selectedQuarterRange ? (
            <span className="text-xs text-slate-500">
              {selectedQuarterRange.startDate} — {selectedQuarterRange.endDate}
            </span>
          ) : null}
          {periodScope === "year" && yearRange ? (
            <span className="text-xs text-slate-500">
              {yearRange.from} — {yearRange.to}
            </span>
          ) : null}
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      {quartersError && !error ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{quartersError}</div> : null}
      {!error && data == null && <div className="mt-4 text-sm text-slate-500">Загружаем дневник…</div>}

      {data && daySlots && daySlots.length > 0 && (
        <div className="mt-6">
          <DiaryNotebookSpread slots={daySlots} />
        </div>
      )}

      {data && (!daySlots || daySlots.length === 0) && (
        <div className="mt-6 text-sm text-slate-500">На этот день нет учебных слотов в расписании или данные ещё не загружены.</div>
      )}

      {finalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setFinalOpen(false)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Итоговые оценки</div>
                {finalData ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {finalData.from} — {finalData.to}
                  </div>
                ) : null}
              </div>
              <button type="button" className="ed-btn ed-btn-close ed-interactive px-2 py-1 text-sm" onClick={() => setFinalOpen(false)}>
                Закрыть
              </button>
            </div>
            {finalLoading ? <div className="mt-4 text-sm text-slate-500">Загрузка…</div> : null}
            {finalError ? <div className="mt-4 text-sm text-rose-700">{finalError}</div> : null}
            {finalData && !finalLoading ? (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 pr-2">Предмет</th>
                    <th className="py-2 text-right">Средний балл</th>
                    <th className="py-2 text-right">Итог</th>
                  </tr>
                </thead>
                <tbody>
                  {finalData.subjects.map((s) => (
                    <tr key={s.disciplineCode} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-medium text-slate-900">{s.disciplineName}</td>
                      <td className="py-2 text-right tabular-nums text-slate-800">{s.average != null ? s.average.toFixed(2) : "—"}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{s.finalMark ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
