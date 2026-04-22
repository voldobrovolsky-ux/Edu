import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

export function JournalClassPage() {
  const navigate = useNavigate();
  const { grade: gradeParam } = useParams();
  const auth = useAuth();
  const token = auth.accessToken;
  const [error, setError] = useState<string | null>(null);

  const grade = Number(gradeParam);

  useEffect(() => {
    if (!token || !Number.isFinite(grade)) return;
    setError(null);
    void api
      .methospaceDisciplinesList(token)
      .then((r) => {
        const list = (r.disciplines ?? [])
          .filter((d) => d.grade === grade)
          .sort((a, b) => a.name.localeCompare(b.name, "ru"));
        if (list.length === 0) {
          setError("Для этого класса нет предметов.");
          return;
        }
        navigate(`/section/journal/${grade}/${encodeURIComponent(list[0].code)}`, { replace: true });
      })
      .catch((e) => setError((e as Error).message));
  }, [token, grade, navigate]);

  return (
    <div className="ed-panel ed-panel-hover p-5">
      <div className="text-sm text-slate-500">Раздел • Журнал</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
        {Number.isFinite(grade) ? `${grade} класс` : "Класс"}
      </h2>
      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      {!error && <div className="mt-4 text-sm text-slate-500">Открываем журнал…</div>}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => navigate("/section/journal")}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          ← К выбору класса
        </button>
      </div>
    </div>
  );
}
