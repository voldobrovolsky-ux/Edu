import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Panel = { studentUserId: string; fio: string; grade: number; groupNumber: number };

export function DiaryEntryPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const token = auth.accessToken;
  const user = auth.user;

  const isParent = Boolean(user && (user.primaryRole === "parent" || user.secondaryRoles.includes("parent")));
  const isStudent = Boolean(user && user.primaryRole === "student");

  const [panels, setPanels] = useState<Panel[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !isParent) return;
    setError(null);
    setPanels(null);
    void api
      .diaryPanels(token)
      .then((r) => {
        setPanels(r.panels);
        if (r.panels.length === 1) {
          nav(`/section/diary/${encodeURIComponent(r.panels[0]!.studentUserId)}`, { replace: true });
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [token, isParent, nav]);

  const sorted = useMemo(() => {
    const arr = panels ?? [];
    return [...arr].sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  }, [panels]);

  if (isStudent) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-500">Раздел • Дневник</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Дневник</h2>
        <div className="mt-3">
          <button
            onClick={() => nav("/section/diary/me")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Открыть
          </button>
        </div>
      </div>
    );
  }

  if (!isParent) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-500">Раздел • Дневник</div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Дневник</h2>
        <div className="mt-4 text-sm text-slate-600">Дневник доступен ученику или родителю.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">Раздел • Дневник</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Дневник</h2>
      <div className="mt-1 text-sm text-slate-600">Выберите ребёнка.</div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      {!error && panels == null && <div className="mt-4 text-sm text-slate-500">Загружаем…</div>}

      {panels && panels.length === 0 && <div className="mt-4 text-sm text-slate-500">Дети не привязаны.</div>}

      {sorted.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => (
            <button
              key={p.studentUserId}
              onClick={() => nav(`/section/diary/${encodeURIComponent(p.studentUserId)}`)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="text-xs text-slate-500">Ребёнок</div>
              <div className="mt-0.5 text-base font-semibold text-slate-900">{p.fio}</div>
              <div className="mt-2 text-xs text-slate-500">Класс</div>
              <div className="mt-0.5 text-sm font-medium text-slate-900">
                {p.grade} • гр {p.groupNumber}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

