import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type StudentFinancePayload = {
  ok: boolean;
  schoolAccount: { balanceRub: number; currency: string; accountLabel: string };
  recent: Array<{ at: string; title: string; deltaRub: number }>;
  note: string;
};

/**
 * Ученический финансовый контур — школьный счёт, не оплаты родителя.
 */
export function StudentFinancePage() {
  const auth = useAuth();
  const token = auth.accessToken;
  const [data, setData] = useState<StudentFinancePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await api.financeStudentOverview(token);
      setData(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "LOAD_FAILED");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 px-6 pb-10">
      <header>
        <div className="text-xs text-slate-500">Школьный счёт</div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Мои финансы</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Баланс школьного счёта и операции ученика. Это не кабинет родителя и не внутренняя бухгалтерия школы.
        </p>
      </header>

      {err ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{err}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Загрузка…</div>
      ) : null}

      {!loading && data ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{data.schoolAccount.accountLabel}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
              {data.schoolAccount.balanceRub.toLocaleString("ru-RU")} {data.schoolAccount.currency}
            </div>
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="mt-4 text-sm font-medium text-sky-800 underline"
            >
              Как устроен счёт
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Операции</h2>
            {data.recent.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Пока нет операций по счёту (демо-режим).</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {data.recent.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span>{r.title}</span>
                    <span className={r.deltaRub < 0 ? "text-rose-700" : "text-emerald-700"}>
                      {r.deltaRub > 0 ? "+" : ""}
                      {r.deltaRub} ₽
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-slate-500">{data.note}</p>
        </>
      ) : !loading && !err ? (
        <div className="text-sm text-slate-500">Нет данных.</div>
      ) : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Школьный счёт</div>
            <p className="mt-2 text-sm text-slate-600">
              Здесь будет отображаться начисление стипендий, внутришкольных баллов и сервисных операций. Данные ниже —
              демонстрационный каркас API.
            </p>
            <button
              type="button"
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() => setDetailOpen(false)}
            >
              Понятно
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
