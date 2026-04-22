import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type PrintMode = "class" | "multi-class" | "teacher";

const DAY_KEYS = ["1", "2", "3", "4", "5"] as const;
const DAY_LABELS: Record<string, string> = { "1": "ПН", "2": "ВТ", "3": "СР", "4": "ЧТ", "5": "ПТ" };

function formatNow(): string {
  return new Date().toLocaleString("ru-RU");
}

function parseGrades(raw: string | null): number[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x)),
    ),
  ).sort((a, b) => a - b);
}

function parsePageCount(raw: string | null): 2 | 4 | 6 | 9 {
  if (raw === "4" || raw === "6" || raw === "9") return Number(raw) as 4 | 6 | 9;
  return 2;
}

function getMultiClassDensity(pageCount: 2 | 4 | 6 | 9) {
  if (pageCount === 9) {
    return {
      titleClass: "text-sm",
      metaClass: "text-[9px]",
      tableClass: "text-[7px]",
      headCellClass: "px-0.5 py-0.5",
      bodyCellClass: "px-0.5 py-0.5",
      slotCellClass: "px-1 py-0.5",
      pageClass: "max-w-none",
      lineClampStyle: { lineHeight: 1.05 } as const,
    };
  }
  if (pageCount === 6) {
    return {
      titleClass: "text-base",
      metaClass: "text-[10px]",
      tableClass: "text-[8px]",
      headCellClass: "px-1 py-0.5",
      bodyCellClass: "px-1 py-0.5",
      slotCellClass: "px-1 py-0.5",
      pageClass: "max-w-none",
      lineClampStyle: { lineHeight: 1.1 } as const,
    };
  }
  if (pageCount === 4) {
    return {
      titleClass: "text-base",
      metaClass: "text-[10px]",
      tableClass: "text-[9px]",
      headCellClass: "px-1 py-1",
      bodyCellClass: "px-1 py-1",
      slotCellClass: "px-1.5 py-1",
      pageClass: "max-w-none",
      lineClampStyle: { lineHeight: 1.15 } as const,
    };
  }
  return {
    titleClass: "text-lg",
    metaClass: "text-xs",
    tableClass: "text-[10px]",
    headCellClass: "px-2 py-1",
    bodyCellClass: "px-1 py-1",
    slotCellClass: "px-2 py-1",
    pageClass: "max-w-none",
    lineClampStyle: { lineHeight: 1.2 } as const,
  };
}

function slotKey(cell: any): string {
  const start = Number(cell?.slotIndex ?? 0);
  const end = Number(cell?.slotIndexEnd ?? start);
  return start === end ? String(start) : `${start}-${end}`;
}

function collectSlotKeys(week: any): string[] {
  const keys = new Set<string>();
  for (const day of DAY_KEYS) {
    const times = week?.days?.[day]?.slotTimes ?? [];
    for (const t of times) {
      const start = Number(t?.slotIndex ?? 0);
      const end = Number(t?.slotIndexEnd ?? start);
      keys.add(start === end ? String(start) : `${start}-${end}`);
    }
  }
  return Array.from(keys).sort((a, b) => {
    const aStart = Number(a.split("-")[0] ?? "0");
    const bStart = Number(b.split("-")[0] ?? "0");
    return aStart - bStart;
  });
}

function getSlotTime(week: any, day: string, key: string): { startTime: string; endTime: string } | null {
  const times = week?.days?.[day]?.slotTimes ?? [];
  const found = times.find((t: any) => {
    const start = Number(t?.slotIndex ?? 0);
    const end = Number(t?.slotIndexEnd ?? start);
    return (start === end ? String(start) : `${start}-${end}`) === key;
  });
  if (!found) return null;
  return { startTime: String(found.startTime ?? "—"), endTime: String(found.endTime ?? "—") };
}

function eventTitles(list: any[] | undefined): string {
  const src = Array.isArray(list) ? list : [];
  if (!src.length) return "";
  return src.map((x) => String(x?.title ?? "Мероприятие")).join("; ");
}

function renderCellText(cell: any): string {
  if (!cell) return "—";
  if (Array.isArray(cell.wholeClassEvents) && cell.wholeClassEvents.length > 0) {
    return `Мероприятие: ${eventTitles(cell.wholeClassEvents)}`;
  }
  if (cell.kind === "service") {
    const type = String(cell.serviceType ?? "service");
    const typeText =
      type === "lunch"
        ? "Обед"
        : type === "walk"
          ? "Прогулка"
          : type === "self_study"
            ? "Самоподготовка"
            : type === "other"
              ? "Другое"
              : "Служебный интервал";
    const desc = cell.serviceDescription ? ` (${String(cell.serviceDescription)})` : "";
    return `${typeText}${desc}`;
  }
  if (cell.wholeClass?.lesson) {
    const l = cell.wholeClass.lesson;
    return `${String(l.disciplineName ?? l.disciplineCode ?? "Предмет")} | ${String(l.teacherName ?? l.teacherUserId ?? "")} | весь класс`;
  }
  const groupParts: string[] = [];
  for (const g of cell.groups ?? []) {
    if (Array.isArray(g?.events) && g.events.length > 0) {
      groupParts.push(`${String(g.label ?? `Группа ${String(g.groupNumber ?? "")}`)}: мероприятие (${eventTitles(g.events)})`);
      continue;
    }
    if (g?.lesson) {
      const l = g.lesson;
      groupParts.push(
        `${String(g.label ?? `Группа ${String(g.groupNumber ?? "")}`)}: ${String(l.disciplineName ?? l.disciplineCode ?? "Предмет")} | ${String(l.teacherName ?? l.teacherUserId ?? "")}`,
      );
    }
  }
  if (groupParts.length > 0) return groupParts.join("\n");
  return "—";
}

function renderTeacherCellText(cell: any, teacherUserId: string): string {
  if (!cell) return "—";
  if (Array.isArray(cell.wholeClassEvents) && cell.wholeClassEvents.length > 0) {
    return `Мероприятие: ${eventTitles(cell.wholeClassEvents)}`;
  }
  if (cell.kind === "service") {
    const type = String(cell.serviceType ?? "service");
    return type === "lunch"
      ? "Обед"
      : type === "walk"
        ? "Прогулка"
        : type === "self_study"
          ? "Самоподготовка"
          : type === "other"
            ? `Другое${cell.serviceDescription ? ` (${String(cell.serviceDescription)})` : ""}`
            : "Служебный интервал";
  }
  if (cell.wholeClass?.lesson && String(cell.wholeClass.lesson.teacherUserId ?? "") === teacherUserId) {
    const l = cell.wholeClass.lesson;
    return `${String(l.disciplineName ?? l.disciplineCode ?? "Предмет")} | весь класс`;
  }
  const ownGroups: string[] = [];
  for (const g of cell.groups ?? []) {
    if (g?.lesson && String(g.lesson.teacherUserId ?? "") === teacherUserId) {
      ownGroups.push(`${String(g.label ?? `Группа ${String(g.groupNumber ?? "")}`)}: ${String(g.lesson.disciplineName ?? g.lesson.disciplineCode ?? "Предмет")}`);
    }
  }
  return ownGroups.length > 0 ? ownGroups.join("\n") : "—";
}

export function TimetablePrintPage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const user = auth.user;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<any>(null);
  const [classes, setClasses] = useState<Array<{ grade: number }>>([]);
  const printedRef = useRef(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const weekStart = params.get("weekStart") ?? "";
  const requestedGrades = useMemo(() => parseGrades(params.get("grades")), [params]);
  const mode: PrintMode = (params.get("mode") as PrintMode) || "class";
  const teacherUserId = params.get("teacherUserId") ?? (user?.id ?? "");
  const pageCount = parsePageCount(params.get("pageCount"));

  const selectedGrades = useMemo(() => {
    if (mode === "class") return requestedGrades.slice(0, 1);
    if (requestedGrades.length > 0) return requestedGrades;
    return classes.map((c) => c.grade).sort((a, b) => a - b);
  }, [classes, mode, requestedGrades]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!weekStart) {
        setError("Не передан параметр weekStart.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const classesRes = await api.schoolClasses(token);
        if (cancelled) return;
        setClasses(classesRes.classes ?? []);

        const gradesForRequest =
          requestedGrades.length > 0 ? requestedGrades : (classesRes.classes ?? []).map((c) => c.grade).sort((a, b) => a - b);
        if (gradesForRequest.length === 0) {
          setError("Нет классов для печати.");
          setLoading(false);
          return;
        }
        const weekRes = await api.timetableWeekView(token, { weekStart, grades: gradesForRequest });
        if (cancelled) return;
        setWeek(weekRes);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [requestedGrades, token, weekStart]);

  useEffect(() => {
    if (loading || error || !week || printedRef.current) return;
    printedRef.current = true;
    window.setTimeout(() => {
      window.print();
    }, 250);
  }, [error, loading, week]);

  const slotKeys = useMemo(() => (week ? collectSlotKeys(week) : []), [week]);

  const visualBlockMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const vb of week?.visualBlocks ?? []) {
      const gradeStart = Number(vb.grade ?? 0);
      const gradeEnd = Number(vb.gradeEnd ?? vb.grade ?? gradeStart);
      const slotStart = Number(vb.slotIndexStart ?? 0);
      const slotEnd = Number(vb.slotIndexEnd ?? slotStart);
      for (let g = gradeStart; g <= gradeEnd; g++) {
        for (let s = slotStart; s <= slotEnd; s++) {
          map.set(`${Number(vb.dayOfWeek)}:${g}:${s}`, String(vb.label ?? "Объединенный блок"));
        }
      }
    }
    return map;
  }, [week]);

  const printGrades = mode === "teacher" ? selectedGrades : selectedGrades;

  const multiClassPages = useMemo(() => {
    const grades = [...printGrades].sort((a, b) => a - b);
    if (grades.length === 0) return [] as number[][];
    const pages = Math.max(1, Math.min(pageCount, grades.length));
    const baseSize = Math.floor(grades.length / pages);
    const remainder = grades.length % pages;
    const result: number[][] = [];
    let cursor = 0;
    for (let i = 0; i < pages; i++) {
      const size = baseSize + (i < remainder ? 1 : 0);
      result.push(grades.slice(cursor, cursor + size));
      cursor += size;
    }
    return result.filter((page) => page.length > 0);
  }, [pageCount, printGrades]);

  const multiClassDensity = useMemo(() => getMultiClassDensity(pageCount), [pageCount]);

  return (
    <div className="mx-auto max-w-[1200px] p-4 text-slate-900">
      <style>{`
        @page { size: ${mode === "multi-class" ? "A4 landscape" : "A4 portrait"}; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          .print-section { break-after: page; page-break-after: always; }
          .print-section:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center gap-2">
        <button onClick={() => window.print()} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">
          Печать / Сохранить в PDF
        </button>
        <button onClick={() => window.close()} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm">
          Закрыть
        </button>
      </div>

      {loading ? <div className="text-sm text-slate-500">Подготовка печатной версии...</div> : null}
      {error ? <div className="text-sm text-rose-700">{error}</div> : null}

      {!loading && !error && week ? (
        <>
          {mode === "teacher" ? (
            <section className="print-section mb-8">
              <header className="mb-3 border-b border-slate-300 pb-2">
                <h1 className="text-lg font-semibold">Расписание учителя</h1>
                <div className="text-xs text-slate-600">
                  Неделя: {weekStart} | Учитель: {user?.id === teacherUserId ? "Мое расписание" : teacherUserId} | Сформировано: {formatNow()}
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 px-2 py-1 text-left">Слот</th>
                      {DAY_KEYS.map((day) => (
                        <th key={day} className="border border-slate-300 px-2 py-1 text-left">
                          {DAY_LABELS[day]} {String(week?.days?.[day]?.date ?? "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slotKeys.map((key) => (
                      <tr key={key}>
                        <td className="whitespace-pre-line border border-slate-300 px-2 py-1 align-top">
                          {key}
                          <br />
                          {(() => {
                            const t = getSlotTime(week, "1", key);
                            return t ? `${t.startTime}-${t.endTime}` : "—";
                          })()}
                        </td>
                        {DAY_KEYS.map((day) => {
                          const cellsForAllGrades: any[] = printGrades.flatMap((grade) => {
                            const rows = (week?.days?.[day]?.grades?.[String(grade)] ?? []) as any[];
                            return rows.filter((c) => slotKey(c) === key);
                          });
                          const lines = cellsForAllGrades
                            .map((cell) => {
                              const grade = cell?.wholeClass?.lesson?.grade ?? cell?.groups?.[0]?.lesson?.grade ?? "";
                              const base = renderTeacherCellText(cell, teacherUserId);
                              return base !== "—" ? `[${grade || "класс"}] ${base}` : "";
                            })
                            .filter(Boolean);
                          return (
                            <td key={`${day}-${key}`} className="whitespace-pre-line border border-slate-300 px-2 py-1 align-top">
                              {lines.length > 0 ? lines.join("\n") : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : mode === "multi-class" ? (
            multiClassPages.map((pageGrades, pageIndex) => (
              <section key={`multi-${pageIndex}`} className={`print-section mb-8 ${multiClassDensity.pageClass}`}>
                <header className="mb-2 border-b border-slate-300 pb-2">
                  <h1 className={`${multiClassDensity.titleClass} font-semibold tracking-tight`}>Сводное расписание классов</h1>
                  <div className={`${multiClassDensity.metaClass} text-slate-600`}>
                    Неделя: {weekStart} | Страница {pageIndex + 1} из {multiClassPages.length} | Классы: {pageGrades.join(", ")} | Сформировано: {formatNow()}
                  </div>
                </header>
                <div className="overflow-x-auto">
                  <table className={`w-full border-collapse ${multiClassDensity.tableClass}`}>
                    <thead>
                      <tr>
                        <th rowSpan={2} className={`border border-slate-400 bg-slate-50 text-left font-semibold ${multiClassDensity.slotCellClass}`}>
                          Слот
                        </th>
                        {pageGrades.map((grade) => (
                          <th
                            key={`grade-${grade}`}
                            colSpan={DAY_KEYS.length}
                            className={`border border-slate-400 bg-slate-100 text-center font-semibold ${multiClassDensity.headCellClass}`}
                          >
                            {grade} класс
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {pageGrades.flatMap((grade) =>
                          DAY_KEYS.map((day) => (
                            <th
                              key={`${grade}-${day}`}
                              className={`border border-slate-300 bg-slate-50 text-left font-medium ${multiClassDensity.headCellClass}`}
                              style={multiClassDensity.lineClampStyle}
                            >
                              {DAY_LABELS[day]}
                              <br />
                              {String(week?.days?.[day]?.date ?? "")}
                            </th>
                          )),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {slotKeys.map((key) => (
                        <tr key={`multi-row-${key}`}>
                          <td className={`border border-slate-400 align-top font-medium ${multiClassDensity.slotCellClass}`} style={multiClassDensity.lineClampStyle}>
                            {key}
                            <br />
                            {(() => {
                              const t = getSlotTime(week, "1", key);
                              return t ? `${t.startTime}-${t.endTime}` : "—";
                            })()}
                          </td>
                          {pageGrades.flatMap((grade) =>
                            DAY_KEYS.map((day) => {
                              const rows = (week?.days?.[day]?.grades?.[String(grade)] ?? []) as any[];
                              const cell = rows.find((c) => slotKey(c) === key);
                              const firstSlot = Number(String(key).split("-")[0] ?? "0");
                              const vbText = visualBlockMap.get(`${day}:${grade}:${firstSlot}`);
                              const text = vbText ? `Блок: ${vbText}` : renderCellText(cell);
                              return (
                                <td
                                  key={`${grade}-${day}-${key}`}
                                  className={`whitespace-pre-line border border-slate-300 align-top ${multiClassDensity.bodyCellClass}`}
                                  style={multiClassDensity.lineClampStyle}
                                >
                                  {text}
                                </td>
                              );
                            }),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          ) : (
            printGrades.map((grade) => (
              <section key={grade} className="print-section mb-8">
                <header className="mb-3 border-b border-slate-300 pb-2">
                  <h1 className="text-lg font-semibold">Расписание класса {grade}</h1>
                  <div className="text-xs text-slate-600">Неделя: {weekStart} | Сформировано: {formatNow()}</div>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 px-2 py-1 text-left">Слот</th>
                        {DAY_KEYS.map((day) => (
                          <th key={day} className="border border-slate-300 px-2 py-1 text-left">
                            {DAY_LABELS[day]} {String(week?.days?.[day]?.date ?? "")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slotKeys.map((key) => (
                        <tr key={key}>
                          <td className="border border-slate-300 px-2 py-1 align-top">
                            {key}
                            <br />
                            {(() => {
                              const t = getSlotTime(week, "1", key);
                              return t ? `${t.startTime}-${t.endTime}` : "—";
                            })()}
                          </td>
                          {DAY_KEYS.map((day) => {
                            const rows = (week?.days?.[day]?.grades?.[String(grade)] ?? []) as any[];
                            const cell = rows.find((c) => slotKey(c) === key);
                            const firstSlot = Number(String(key).split("-")[0] ?? "0");
                            const vbText = visualBlockMap.get(`${day}:${grade}:${firstSlot}`);
                            const text = vbText ? `Блок: ${vbText}` : renderCellText(cell);
                            return (
                              <td key={`${day}-${key}`} className="whitespace-pre-line border border-slate-300 px-2 py-1 align-top">
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </>
      ) : null}
    </div>
  );
}
