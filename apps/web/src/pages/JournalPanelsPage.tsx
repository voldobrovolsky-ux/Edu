import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Panel = { grade: number; disciplineCode: string; disciplineName: string };

export function JournalPanelsPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const token = auth.accessToken;
  const isManager =
    auth.user?.primaryRole === "head_teacher" ||
    auth.user?.primaryRole === "director" ||
    auth.user?.primaryRole === "sysadmin" ||
    auth.user?.username?.trim().toLowerCase() === "admin";
  const [classPanels, setClassPanels] = useState<Array<{ grade: number }>>([]);

  const [panels, setPanels] = useState<Panel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (isManager) {
      void api
        .schoolClasses(token)
        .then((r) => setClassPanels((r.classes ?? []).map((x) => ({ grade: x.grade }))))
        .catch((e) => setError((e as Error).message));
      return;
    }
    setError(null);
    setPanels(null);
    void api
      .myTeacherPanels(token)
      .then((r) => setPanels(r.panels))
      .catch((e) => setError((e as Error).message));
  }, [isManager, token]);

  const sorted = useMemo(() => {
    const arr = panels ?? [];
    return [...arr].sort((a, b) => (a.grade !== b.grade ? a.grade - b.grade : a.disciplineName.localeCompare(b.disciplineName, "ru")));
  }, [panels]);

  return (
    <div className="ed-panel ed-panel-hover p-5" data-dedus-id="journal.panelsGrid">
      <div className="text-sm text-slate-500">Раздел • Журнал</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Журнал</h2>
      <div className="mt-1 text-sm text-slate-600">{isManager ? "Выберите класс." : "Выберите связку «класс + предмет»."}</div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

      {!error && panels == null && <div className="mt-4 text-sm text-slate-500">Загружаем панели…</div>}

      {!isManager && panels && panels.length === 0 && <div className="mt-4 text-sm text-slate-500">За вами не закреплены дисциплины (TeacherLoad).</div>}

      {isManager && classPanels.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {classPanels
            .sort((a, b) => a.grade - b.grade)
            .map((p) => (
              <button
                key={p.grade}
                onClick={() => nav(`/section/journal/class/${p.grade}`)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="text-xs text-slate-500">Класс</div>
                <div className="mt-0.5 text-base font-semibold text-slate-900">{p.grade}</div>
              </button>
            ))}
        </div>
      )}

      {!isManager && sorted.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => (
            <button
              key={`${p.grade}:${p.disciplineCode}`}
              onClick={() => nav(`/section/journal/${p.grade}/${encodeURIComponent(p.disciplineCode)}`)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="text-xs text-slate-500">Класс</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">{p.grade}</div>
              <div className="mt-2 text-xs text-slate-500">Предмет</div>
              <div className="mt-0.5 text-sm font-medium text-slate-900">{p.disciplineName}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

