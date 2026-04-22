import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ED_Z_MODAL_GLOBAL } from "../lib/zLayers";
import { useAuth } from "../state/auth";

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtAvg(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}%`;
}

function parseHundredths(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  // допускаем 0..2 знака после точки/запятой
  if (!/^-?\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

function riskColor(args: { avg: number | null; att: number | null; minAvg: number; minAtt: number }): string {
  const lowAvg = args.avg != null && args.avg < args.minAvg;
  const lowAtt = args.att != null && args.att < args.minAtt;
  if (lowAvg || lowAtt) return "text-rose-700";
  return "text-slate-900";
}

function EmptyAnalyticsState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
      <div className="font-medium text-slate-900">{title}</div>
      <div className="mt-1">{text}</div>
    </div>
  );
}

export function AnalyticsPage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const role = auth.user?.primaryRole;

  const canOverview = role === "director" || role === "head_teacher" || role === "sysadmin";
  const canTeacher = role === "teacher";

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDateLocal(d);
  });
  const [to, setTo] = useState(() => isoDateLocal(new Date()));
  const [minAverage, setMinAverage] = useState("3");
  const [minAttendancePercent, setMinAttendancePercent] = useState("90");

  const thresholds = useMemo(() => {
    return {
      minAvg: parseHundredths(minAverage) ?? 3,
      minAtt: parseHundredths(minAttendancePercent) ?? 90,
    };
  }, [minAverage, minAttendancePercent]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [teacher, setTeacher] = useState<any>(null);
  const [dashboard, setDashboard] = useState<"profile" | "hiring" | "quality" | "projects">("profile");
  const [hiring, setHiring] = useState<any>(null);
  const [cadreProfile, setCadreProfile] = useState<any>(null);
    const [quality, setQuality] = useState<any>(null);
  const [projects, setProjects] = useState<any>(null);
  const [cadreDrilldown, setCadreDrilldown] = useState<{ title: string; teachers: any[] } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (canTeacher) {
        const [teacherOverview, teacherProjects] = await Promise.all([
          api.analyticsTeacher(token, { from, to }),
          api.analyticsProjects(token, { from, to }),
        ]);
        setTeacher(teacherOverview);
        setProjects(teacherProjects);
        setOverview(null);
      } else {
        const [overviewRes, hiringRes, cadreRes, qualityRes, projectsRes] = await Promise.all([
          api.analyticsOverview(token, {
            from,
            to,
            minAverage: thresholds.minAvg,
            minAttendancePercent: thresholds.minAtt,
          }),
          api.analyticsHiring(token, { from, to }),
          api.analyticsCadreProfile(token, { from, to }),
          api.analyticsQuality(token),
          api.analyticsProjects(token, { from, to }),
        ]);
        setOverview(overviewRes);
        setHiring(hiringRes);
        setCadreProfile(cadreRes);
        setQuality(qualityRes);
        setProjects(projectsRes);
        setTeacher(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, canTeacher, thresholds.minAvg, thresholds.minAtt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener("edumed:analytics-refresh", handler as EventListener);
    return () => window.removeEventListener("edumed:analytics-refresh", handler as EventListener);
  }, [refresh]);

  if (!canOverview && !canTeacher) {
    return (
      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">Раздел • Аналитика</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Аналитика</h2>
        <div className="mt-2 text-sm text-slate-700">Доступно только для директора / завуча / учителя.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Раздел • Аналитика</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              {canTeacher ? "Моя аналитика" : "Обзор"}
            </h2>
            <div className="mt-1 text-sm text-slate-600">
              Данные загружаются с сервера, на фронте только форматирование (округление/цвета).
            </div>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Обновить
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="block text-sm">
            <div className="text-slate-600">Период: from</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
            />
          </label>
          <label className="block text-sm">
            <div className="text-slate-600">Период: to</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
            />
          </label>
          {canOverview ? (
            <label className="block text-sm">
              <div className="text-slate-600">Минимальный средний балл</div>
              <input
                type="number"
                step={0.01}
                value={minAverage}
                onChange={(e) => setMinAverage(e.target.value.replace(",", "."))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                placeholder="3"
              />
            </label>
          ) : (
            <div />
          )}
          {canOverview ? (
            <label className="block text-sm">
              <div className="text-slate-600">Минимальная посещаемость, %</div>
              <input
                type="number"
                step={0.01}
                value={minAttendancePercent}
                onChange={(e) => setMinAttendancePercent(e.target.value.replace(",", "."))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                placeholder="90"
              />
            </label>
          ) : (
            <div />
          )}
        </div>

        {error ? <div className="mt-3 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="mt-3 text-sm text-slate-500">Загрузка…</div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setDashboard("profile")} className={["rounded-xl px-3 py-2 text-sm", dashboard === "profile" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900"].join(" ")}>Кадровый профиль</button>
          {!canTeacher ? <button type="button" onClick={() => setDashboard("hiring")} className={["rounded-xl px-3 py-2 text-sm", dashboard === "hiring" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900"].join(" ")}>Найм</button> : null}
          {!canTeacher ? <button type="button" onClick={() => setDashboard("quality")} className={["rounded-xl px-3 py-2 text-sm", dashboard === "quality" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900"].join(" ")}>Качество</button> : null}
          <button type="button" onClick={() => setDashboard("projects")} className={["rounded-xl px-3 py-2 text-sm", dashboard === "projects" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-900"].join(" ")}>Проекты</button>
        </div>
      </div>

      {canOverview ? <RevisionAnalyticsPanel token={token} /> : null}

      {canOverview && overview && dashboard === "profile" ? (
        <div className="space-y-4">
          {(cadreProfile?.totals?.teachersCount ?? 0) === 0 ? (
            <EmptyAnalyticsState
              title="Нет учителей для кадрового профиля"
              text="По текущим фильтрам не найдено ни одного учителя. Проверьте предмет, ступень или наполненность нагрузки у педагогов."
            />
          ) : null}

          <div className="ed-panel ed-panel-hover p-5">
            <div className="text-sm text-slate-500">Кадровый профиль</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Учителей</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{cadreProfile?.totals?.teachersCount ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">ПК назначен</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{cadreProfile?.totals?.assignedPcRateCount ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Первая + высшая</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {(() => {
                    const rows = cadreProfile?.byCategory ?? [];
                    const first = rows.find((x: any) => x.title === "первая")?.count ?? 0;
                    const highest = rows.find((x: any) => x.title === "высшая")?.count ?? 0;
                    return first + highest;
                  })()}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Ветки известны</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {(() => {
                    const branches = cadreProfile?.byBranches ?? [];
                    const unknown = branches.find((b: any) => b.title === "неизвестно")?.count ?? 0;
                    const total = branches.reduce((sum: number, b: any) => sum + (b.count ?? 0), 0);
                    return total - unknown;
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="ed-panel ed-panel-hover p-5 lg:col-span-1">
              <div className="text-sm text-slate-500">По категориям</div>
              <div className="mt-3 space-y-2">
                {(cadreProfile?.byCategory ?? []).map((c: any) => (
                  <button
                    type="button"
                    key={c.title}
                    onClick={() => setCadreDrilldown({ title: `Категория: ${c.title}`, teachers: c.teachers ?? [] })}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-left text-sm hover:border-slate-300"
                  >
                    <span className="text-slate-800">{c.title}</span>
                    <span className="font-semibold text-slate-900">{c.count}</span>
                  </button>
                ))}
                {cadreProfile?.byCategory?.length === 0 ? <div className="text-sm text-slate-600">Нет данных.</div> : null}
              </div>
            </div>

            <div className="ed-panel ed-panel-hover p-5 lg:col-span-1">
              <div className="text-sm text-slate-500">По диапазонам ПК</div>
              <div className="mt-1 text-xs text-slate-500">
                `не назначено` означает, что для этих педагогов ставка ПК ещё не заполнена и их нужно дотащить до настройки оплаты.
              </div>
              <div className="mt-3 space-y-2">
                {(cadreProfile?.byPcRateRanges ?? []).map((r: any) => (
                  <button
                    type="button"
                    key={r.title}
                    onClick={() => setCadreDrilldown({ title: `ПК: ${r.title}`, teachers: r.teachers ?? [] })}
                    className={[
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm hover:border-slate-300",
                      r.title === "не назначено" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white",
                    ].join(" ")}
                  >
                    <span className={r.title === "не назначено" ? "text-amber-900" : "text-slate-800"}>{r.title}</span>
                    <span className="font-semibold text-slate-900">{r.count}</span>
                  </button>
                ))}
                {(cadreProfile?.byPcRateRanges ?? []).length === 0 ? <div className="text-sm text-slate-600">Нет данных.</div> : null}
              </div>
            </div>

            <div className="ed-panel ed-panel-hover p-5 lg:col-span-1">
              <div className="text-sm text-slate-500">По веткам (прокси)</div>
              <div className="mt-1 text-xs text-slate-500">
                `неизвестно` означает, что учитель ещё не связан с исходным кандидатом или по нему не хватает данных для восстановления ветки.
              </div>
              <div className="mt-3 space-y-2">
                {(cadreProfile?.byBranches ?? []).map((b: any) => (
                  <button
                    type="button"
                    key={b.title}
                    onClick={() => setCadreDrilldown({ title: `Ветка: ${b.title}`, teachers: b.teachers ?? [] })}
                    className={[
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm hover:border-slate-300",
                      b.title === "неизвестно" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white",
                    ].join(" ")}
                  >
                    <span className={b.title === "неизвестно" ? "text-amber-900" : "text-slate-800"}>{b.title}</span>
                    <span className="font-semibold text-slate-900">{b.count}</span>
                  </button>
                ))}
                {(cadreProfile?.byBranches ?? []).length === 0 ? <div className="text-sm text-slate-600">Нет данных.</div> : null}
              </div>
            </div>
          </div>

          <div className="ed-panel ed-panel-hover p-5">
            <div className="text-sm text-slate-500">Школа</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Средний балл</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{fmtAvg(overview.overview?.averageMark ?? null)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Посещаемость</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {fmtPct(overview.overview?.attendancePercent ?? null)}
                </div>
              </div>
            </div>
          </div>

          <MetricTable
            title="По классам"
            rows={(overview.byGrade ?? []).map((x: any) => ({
              key: String(x.grade),
              label: `${x.grade} класс`,
              avg: x.averageMark ?? null,
              att: x.attendancePercent ?? null,
            }))}
            thresholds={thresholds}
          />

          <MetricTable
            title="По дисциплинам"
            rows={(overview.byDiscipline ?? []).map((x: any) => ({
              key: String(x.disciplineCode),
              label: x.disciplineName ?? x.disciplineCode,
              avg: x.averageMark ?? null,
              att: x.attendancePercent ?? null,
            }))}
            thresholds={thresholds}
          />

          <MetricTable
            title="Класс + дисциплина"
            rows={(overview.byGradeDiscipline ?? []).map((x: any) => ({
              key: `${x.grade}:${x.disciplineCode}`,
              label: `${x.grade} • ${x.disciplineName ?? x.disciplineCode}`,
              avg: x.averageMark ?? null,
              att: x.attendancePercent ?? null,
            }))}
            thresholds={thresholds}
          />

          {overview.riskZones ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <div className="text-sm font-semibold text-rose-900">Зоны риска</div>
              <div className="mt-1 text-xs text-rose-800">
                Пороги: средний &lt; {thresholds.minAvg}, посещаемость &lt; {thresholds.minAtt}%
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-rose-200 bg-white p-3">
                  <div className="text-xs font-medium text-rose-900">Классы</div>
                  <div className="mt-2 space-y-1 text-sm text-rose-900">
                    {(overview.riskZones.lowAverage?.grades ?? [])
                      .concat(overview.riskZones.lowAttendance?.grades ?? [])
                      .slice(0, 30)
                      .map((x: any, i: number) => (
                        <div key={`${x.grade}:${i}`}>{x.grade} класс</div>
                      ))}
                    {(overview.riskZones.lowAverage?.grades ?? []).length === 0 &&
                    (overview.riskZones.lowAttendance?.grades ?? []).length === 0 ? (
                      <div className="text-sm text-rose-800">Нет.</div>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-white p-3">
                  <div className="text-xs font-medium text-rose-900">Дисциплины</div>
                  <div className="mt-2 space-y-1 text-sm text-rose-900">
                    {(overview.riskZones.lowAverage?.disciplines ?? [])
                      .concat(overview.riskZones.lowAttendance?.disciplines ?? [])
                      .slice(0, 30)
                      .map((x: any, i: number) => (
                        <div key={`${x.disciplineCode}:${i}`}>{x.disciplineName ?? x.disciplineCode}</div>
                      ))}
                    {(overview.riskZones.lowAverage?.disciplines ?? []).length === 0 &&
                    (overview.riskZones.lowAttendance?.disciplines ?? []).length === 0 ? (
                      <div className="text-sm text-rose-800">Нет.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!canTeacher && dashboard === "hiring" && hiring ? (
        <div className="ed-panel ed-panel-hover p-5">
          <div className="text-sm text-slate-500">Воронка найма</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {(hiring.funnel ?? []).map((item: any) => (
              <div key={item.stage} className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{item.count}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-800">Интервью / анкеты: {hiring.conversions?.interviewFromApplications != null ? `${Math.round(hiring.conversions.interviewFromApplications * 100)}%` : "—"}</div>
            <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-800">Демо / интервью: {hiring.conversions?.demoFromInterview != null ? `${Math.round(hiring.conversions.demoFromInterview * 100)}%` : "—"}</div>
            <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-800">Выход / офферы: {hiring.conversions?.hiredFromOffers != null ? `${Math.round(hiring.conversions.hiredFromOffers * 100)}%` : "—"}</div>
          </div>
        </div>
      ) : null}

      {!canTeacher && dashboard === "quality" && quality ? (
        <div className="ed-panel ed-panel-hover p-5">
          <div className="text-sm text-slate-500">Качество учителей</div>
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-2">Учитель</th>
                  <th className="border-b border-slate-200 px-2 py-2">Индекс</th>
                  <th className="border-b border-slate-200 px-2 py-2">Категория</th>
                  <th className="border-b border-slate-200 px-2 py-2">ПК</th>
                  <th className="border-b border-slate-200 px-2 py-2">Средний урок</th>
                </tr>
              </thead>
              <tbody>
                {(quality.teachers ?? []).map((row: any) => (
                  <tr key={row.teacherUserId} className="text-sm">
                    <td className="border-b border-slate-100 px-2 py-2">{row.teacherFio}</td>
                    <td className="border-b border-slate-100 px-2 py-2">{row.qualityIndex ?? "—"}</td>
                    <td className="border-b border-slate-100 px-2 py-2">{row.category ?? "—"}</td>
                    <td className="border-b border-slate-100 px-2 py-2">{row.currentPcRate ?? "—"}</td>
                    <td className="border-b border-slate-100 px-2 py-2">{row.components?.lessonAverage0to5 != null ? row.components.lessonAverage0to5.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {dashboard === "projects" && projects ? (
        <div className="ed-panel ed-panel-hover p-5">
          <div className="text-sm text-slate-500">Проекты и мероприятия</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(projects.events ?? []).map((event: any) => (
              <div key={event.eventId} className="rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                <div className="mt-1 text-xs text-slate-500">{event.date}</div>
                <div className="mt-2 text-sm text-slate-700">Станций: {event.stationCount} • учителей: {event.teacherCount} • факт: {event.actualAcademicHours.toFixed(2)} ч</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {canTeacher && teacher && dashboard === "profile" ? (
        <TeacherAnalytics data={teacher} />
      ) : null}

      {cadreDrilldown ? <CadreDrilldownModal title={cadreDrilldown.title} teachers={cadreDrilldown.teachers} onClose={() => setCadreDrilldown(null)} /> : null}
    </div>
  );
}

function CadreDrilldownModal({
  title,
  teachers,
  onClose,
}: {
  title: string;
  teachers: any[];
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: ED_Z_MODAL_GLOBAL }} role="dialog" aria-modal>
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-xs text-slate-600">Список учителей, попавших в выбранный срез.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="border-b border-slate-200 px-2 py-2 font-medium">ФИО</th>
                <th className="border-b border-slate-200 px-2 py-2 font-medium">Предметы</th>
                <th className="border-b border-slate-200 px-2 py-2 font-medium">Ступени</th>
                <th className="border-b border-slate-200 px-2 py-2 font-medium">ПК</th>
                <th className="border-b border-slate-200 px-2 py-2 font-medium">Категория</th>
                <th className="border-b border-slate-200 px-2 py-2 font-medium">Ветка</th>
                <th className="border-b border-slate-200 px-2 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => (
                <tr key={teacher.teacherUserId} className="text-sm">
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{teacher.teacherFio}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{(teacher.subjects ?? []).join(", ") || "—"}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{(teacher.levels ?? []).join(", ") || "—"}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{teacher.currentPcRate ?? "не назначено"}</td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-900">
                    {teacher.category === "none" ? "без категории" : teacher.category}
                    {!teacher.categoryExplicit ? " (не заполнена явно)" : ""}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-slate-900">
                    {teacher.branchKnown ? teacher.branchTitle : "неизвестно"}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/section/users_admin/teacher/${teacher.teacherUserId}`} className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-900" onClick={onClose}>
                        Карточка учителя
                      </Link>
                      <Link to={`/section/users_admin/teacher/${teacher.teacherUserId}`} className="rounded-lg bg-slate-900 px-3 py-1 text-xs text-white" onClick={onClose}>
                        Аналитический профиль
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {teachers.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-sm text-slate-600" colSpan={7}>
                    Нет учителей в этом срезе.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type RevisionClassRow = {
  disciplineCode: string;
  disciplineName: string;
  teacherUserId: string;
  teacherFio: string;
  key: string;
};

function defaultLocalDatetime(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RevisionAnalyticsPanel({ token }: { token: string }) {
  const [docOpen, setDocOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="text-sm font-medium text-slate-900">Ревизия</div>
      <div className="mt-1 text-sm text-slate-600">
        Задания выполняет бот-ассистент в указанное время; результаты приходят в личные сообщения.
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDocOpen(true)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Ревизия документации
        </button>
        <button
          type="button"
          onClick={() => setJournalOpen(true)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Ревизия журнала
        </button>
      </div>

      {docOpen ? (
        <RevisionDocumentationModal token={token} onClose={() => setDocOpen(false)} />
      ) : null}
      {journalOpen ? <RevisionJournalModal token={token} onClose={() => setJournalOpen(false)} /> : null}
    </div>
  );
}

function RevisionDocumentationModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [classes, setClasses] = useState<Array<{ grade: number; label: string; rows: RevisionClassRow[] }>>([]);
  const [docTypes, setDocTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGrades, setSelectedGrades] = useState<Set<number>>(new Set());
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [lessonFrom, setLessonFrom] = useState("");
  const [lessonTo, setLessonTo] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState(defaultLocalDatetime);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [c, t] = await Promise.all([
          api.analyticsRevisionClasses(token),
          api.analyticsRevisionJournalDocTypes(token),
        ]);
        if (cancelled) return;
        setClasses(c.classes);
        setDocTypes(t.types);
        setSelectedGrades(new Set(c.classes.map((x) => x.grade)));
        setSelectedDocTypes(new Set(t.types.map((x) => x.id)));
        setExcludedKeys(new Set());
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleGrade = (grade: number, on: boolean) => {
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (on) next.add(grade);
      else next.delete(grade);
      return next;
    });
    const cls = classes.find((c) => c.grade === grade);
    if (!cls) return;
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      for (const r of cls.rows) {
        if (on) next.delete(r.key);
        else next.add(r.key);
      }
      return next;
    });
  };

  const toggleRow = (key: string, included: boolean) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (included) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDocType = (id: string, on: boolean) => {
    setSelectedDocTypes((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onSubmit = async () => {
    setErr(null);
    const grades = [...selectedGrades].sort((a, b) => a - b);
    const journalDocumentTypeIds = [...selectedDocTypes];
    if (grades.length === 0 || journalDocumentTypeIds.length === 0) {
      setErr("Выберите хотя бы один класс и тип документа.");
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(scheduledLocal).toISOString();
      await api.analyticsRevisionDocumentation(token, {
        grades,
        excludedKeys: [...excludedKeys],
        journalDocumentTypeIds,
        scheduledAt,
        lessonDateFrom: lessonFrom.trim() || undefined,
        lessonDateTo: lessonTo.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: ED_Z_MODAL_GLOBAL }}
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Ревизия документации</div>
            <div className="mt-1 text-xs text-slate-600">Классы, дисциплины и типы документов журнала; время запуска проверки.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            ✕
          </button>
        </div>

        {loading ? <div className="mt-4 text-sm text-slate-500">Загрузка…</div> : null}
        {err ? <div className="mt-3 text-sm text-rose-700">{err}</div> : null}

        {!loading ? (
          <div className="mt-4 space-y-6">
            <div>
              <div className="text-xs font-medium text-slate-700">Классы</div>
              <div className="mt-2 space-y-2">
                {classes.map((c) => {
                  const open = expanded.has(c.grade);
                  const gradeOn = selectedGrades.has(c.grade);
                  return (
                    <div key={c.grade} className="rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={gradeOn}
                          onChange={(e) => toggleGrade(c.grade, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <button
                          type="button"
                          className="flex-1 text-left text-sm font-medium text-slate-900"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.grade)) next.delete(c.grade);
                              else next.add(c.grade);
                              return next;
                            })
                          }
                        >
                          {c.label} {open ? "▼" : "▶"}
                        </button>
                      </div>
                      {open ? (
                        <div className="border-t border-slate-100 px-3 py-2 pl-9">
                          {c.rows.length === 0 ? (
                            <div className="text-xs text-slate-500">Нет привязанных дисциплин.</div>
                          ) : (
                            c.rows.map((r) => {
                              const included = !excludedKeys.has(r.key);
                              return (
                                <label key={r.key} className="mt-1 flex cursor-pointer items-start gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                    checked={included && gradeOn}
                                    disabled={!gradeOn}
                                    onChange={(e) => toggleRow(r.key, e.target.checked)}
                                  />
                                  <span className="text-slate-800">
                                    {r.disciplineName} — {r.teacherFio}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700">Типы документов (журнал)</div>
              <div className="mt-2 space-y-1">
                {docTypes.length === 0 ? (
                  <div className="text-sm text-slate-500">Нет типов — настройте в «Методическом пространстве».</div>
                ) : (
                  docTypes.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selectedDocTypes.has(t.id)}
                        onChange={(e) => toggleDocType(t.id, e.target.checked)}
                      />
                      <span>{t.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <div className="text-slate-600">Период уроков: с</div>
                <input
                  type="date"
                  value={lessonFrom}
                  onChange={(e) => setLessonFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Период уроков: по</div>
                <input
                  type="date"
                  value={lessonTo}
                  onChange={(e) => setLessonTo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                />
              </label>
            </div>
            <div className="text-xs text-slate-500">Если даты не заданы, сервер подставит четверть или последние 30 дней до даты проверки.</div>

            <label className="block text-sm">
              <div className="text-slate-600">Время проверки</div>
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void onSubmit()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? "…" : "Провести"}
              </button>
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800">
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function RevisionJournalModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [classes, setClasses] = useState<Array<{ grade: number; label: string; rows: RevisionClassRow[] }>>([]);
  const [selectedGrades, setSelectedGrades] = useState<Set<number>>(new Set());
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [quarters, setQuarters] = useState<Array<{ index: 1 | 2 | 3 | 4; startDate: string; endDate: string }>>([]);
  const [periodMode, setPeriodMode] = useState<"quarter" | "range">("quarter");
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4 | "">("");
  const [lessonFrom, setLessonFrom] = useState("");
  const [lessonTo, setLessonTo] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState(defaultLocalDatetime);
  const [checkLessons, setCheckLessons] = useState(true);
  const [checkTopics, setCheckTopics] = useState(true);
  const [checkMarks, setCheckMarks] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [c, q] = await Promise.all([api.analyticsRevisionClasses(token), api.methospaceQuarters(token)]);
        if (cancelled) return;
        setClasses(c.classes);
        setSelectedGrades(new Set(c.classes.map((x) => x.grade)));
        setExcludedKeys(new Set());
        setQuarters(q.quarters ?? []);
        setSelectedQuarter(q.quarters?.[0]?.index ?? "");
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleGrade = (grade: number, on: boolean) => {
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (on) next.add(grade);
      else next.delete(grade);
      return next;
    });
    const cls = classes.find((c) => c.grade === grade);
    if (!cls) return;
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      for (const r of cls.rows) {
        if (on) next.delete(r.key);
        else next.add(r.key);
      }
      return next;
    });
  };

  const toggleRow = (key: string, included: boolean) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (included) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onSubmit = async () => {
    setErr(null);
    const grades = [...selectedGrades].sort((a, b) => a - b);
    if (grades.length === 0) {
      setErr("Выберите классы.");
      return;
    }
    if (!checkLessons && !checkTopics && !checkMarks) {
      setErr("Выберите хотя бы один тип проверки.");
      return;
    }
    let resolvedFrom = lessonFrom.trim();
    let resolvedTo = lessonTo.trim();
    if (periodMode === "quarter") {
      const q = quarters.find((x) => x.index === selectedQuarter);
      if (!q) {
        setErr("Выберите четверть.");
        return;
      }
      resolvedFrom = q.startDate;
      resolvedTo = q.endDate;
    } else {
      if (!resolvedFrom || !resolvedTo) {
        setErr("Укажите период с/по.");
        return;
      }
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(scheduledLocal).toISOString();
      await api.analyticsRevisionJournal(token, {
        grades,
        excludedKeys: [...excludedKeys],
        scheduledAt,
        lessonDateFrom: resolvedFrom,
        lessonDateTo: resolvedTo,
        checks: { lessons: checkLessons, topics: checkTopics, marks: checkMarks },
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: ED_Z_MODAL_GLOBAL }}
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Ревизия журнала</div>
            <div className="mt-1 text-xs text-slate-600">Проверка полноты уроков, заполнения тем и наличия оценок за выбранный период.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
            ✕
          </button>
        </div>
        {loading ? <div className="mt-4 text-sm text-slate-500">Загрузка…</div> : null}
        {err ? <div className="mt-3 text-sm text-rose-700">{err}</div> : null}
        {!loading ? (
          <div className="mt-4 space-y-6">
            <div>
              <div className="text-xs font-medium text-slate-700">Классы</div>
              <div className="mt-2 space-y-2">
                {classes.map((c) => {
                  const open = expanded.has(c.grade);
                  const gradeOn = selectedGrades.has(c.grade);
                  return (
                    <div key={c.grade} className="rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={gradeOn}
                          onChange={(e) => toggleGrade(c.grade, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <button
                          type="button"
                          className="flex-1 text-left text-sm font-medium text-slate-900"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.grade)) next.delete(c.grade);
                              else next.add(c.grade);
                              return next;
                            })
                          }
                        >
                          {c.label} {open ? "▼" : "▶"}
                        </button>
                      </div>
                      {open ? (
                        <div className="border-t border-slate-100 px-3 py-2 pl-9">
                          {c.rows.length === 0 ? (
                            <div className="text-xs text-slate-500">Нет привязанных дисциплин.</div>
                          ) : (
                            c.rows.map((r) => {
                              const included = !excludedKeys.has(r.key);
                              return (
                                <label key={r.key} className="mt-1 flex cursor-pointer items-start gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                                    checked={included && gradeOn}
                                    disabled={!gradeOn}
                                    onChange={(e) => toggleRow(r.key, e.target.checked)}
                                  />
                                  <span className="text-slate-800">
                                    {r.disciplineName} — {r.teacherFio}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700">Период</div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="journal-revision-period"
                    checked={periodMode === "quarter"}
                    onChange={() => setPeriodMode("quarter")}
                  />
                  По четверти
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="journal-revision-period"
                    checked={periodMode === "range"}
                    onChange={() => setPeriodMode("range")}
                  />
                  Произвольный диапазон
                </label>
              </div>
              {periodMode === "quarter" ? (
                <label className="mt-3 block text-sm">
                  <div className="text-slate-600">Четверть</div>
                  <select
                    value={selectedQuarter}
                    onChange={(e) =>
                      setSelectedQuarter(
                        e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4) : "",
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="">Выберите четверть</option>
                    {quarters.map((q) => (
                      <option key={q.index} value={q.index}>
                        {q.index} четверть ({q.startDate} - {q.endDate})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <div className="text-slate-600">Период: с</div>
                    <input
                      type="date"
                      value={lessonFrom}
                      onChange={(e) => setLessonFrom(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <div className="text-slate-600">Период: по</div>
                    <input
                      type="date"
                      value={lessonTo}
                      onChange={(e) => setLessonTo(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </label>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700">Тип проверки</div>
              <div className="mt-2 space-y-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={checkLessons} onChange={(e) => setCheckLessons(e.target.checked)} />
                  Проверить наличие уроков
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={checkTopics} onChange={(e) => setCheckTopics(e.target.checked)} />
                  Проверить темы уроков
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={checkMarks} onChange={(e) => setCheckMarks(e.target.checked)} />
                  Проверить оценки
                </label>
              </div>
            </div>

            <label className="block text-sm">
              <div className="text-slate-600">Время запуска</div>
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-dedus-id="journal.revisionButton"
                disabled={saving}
                onClick={() => void onSubmit()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? "…" : "Провести ревизию журнала"}
              </button>
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function MetricTable({
  title,
  rows,
  thresholds,
}: {
  title: string;
  rows: Array<{ key: string; label: string; avg: number | null; att: number | null }>;
  thresholds: { minAvg: number; minAtt: number };
}) {
  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 overflow-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="border-b border-slate-200 px-2 py-2 font-medium">Сущность</th>
              <th className="border-b border-slate-200 px-2 py-2 font-medium">Средний</th>
              <th className="border-b border-slate-200 px-2 py-2 font-medium">Посещаемость</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="text-sm">
                <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{r.label}</td>
                <td className={["border-b border-slate-100 px-2 py-2", riskColor({ avg: r.avg, att: r.att, ...thresholds })].join(" ")}>
                  {fmtAvg(r.avg)}
                </td>
                <td className={["border-b border-slate-100 px-2 py-2", riskColor({ avg: r.avg, att: r.att, ...thresholds })].join(" ")}>
                  {fmtPct(r.att)}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-sm text-slate-600" colSpan={3}>
                  Нет данных.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeacherAnalytics({ data }: { data: any }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const panels = (data.panels ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5">
        <div className="text-sm text-slate-500">Связки «класс + предмет»</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {panels.map((p) => {
            const key = `${p.grade}:${p.disciplineCode}`;
            const active = openKey === key;
            return (
              <button
                key={key}
                onClick={() => setOpenKey((prev) => (prev === key ? null : key))}
                className={[
                  "rounded-2xl border p-4 text-left shadow-sm transition",
                  active ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                <div className="text-xs text-slate-500">Класс</div>
                <div className="mt-0.5 text-base font-semibold text-slate-900">{p.grade}</div>
                <div className="mt-2 text-xs text-slate-500">Предмет</div>
                <div className="mt-0.5 text-sm font-medium text-slate-900">{p.disciplineName ?? p.disciplineCode}</div>
                <div className="mt-2 text-xs text-slate-500">
                  Средний: <span className="text-slate-900">{fmtAvg(p.averageMark ?? null)}</span> • Посещаемость:{" "}
                  <span className="text-slate-900">{fmtPct(p.attendancePercent ?? null)}</span>
                </div>
              </button>
            );
          })}
          {panels.length === 0 ? <div className="text-sm text-slate-600">Нет данных.</div> : null}
        </div>
      </div>

      {openKey ? (
        <div className="ed-panel ed-panel-hover p-5">
          <div className="text-sm text-slate-500">Ученики</div>
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[780px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-2 font-medium">ФИО</th>
                  <th className="border-b border-slate-200 px-2 py-2 font-medium">Группа</th>
                  <th className="border-b border-slate-200 px-2 py-2 font-medium">Средний</th>
                  <th className="border-b border-slate-200 px-2 py-2 font-medium">Итог</th>
                  <th className="border-b border-slate-200 px-2 py-2 font-medium">Посещаемость</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const panel = panels.find((p) => `${p.grade}:${p.disciplineCode}` === openKey);
                  const students = (panel?.students ?? []) as any[];
                  return students.map((s) => (
                    <tr key={s.studentUserId} className="text-sm">
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{s.fio}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{s.groupNumber}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{fmtAvg(s.average ?? null)}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{s.finalMark ?? "—"}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{fmtPct(s.attendancePercent ?? null)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

