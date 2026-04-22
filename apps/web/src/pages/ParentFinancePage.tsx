import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type ParentFinancePayload = {
  ok: boolean;
  summary: { totalPaidRub: number; totalDueRub: number; currency: string };
  byChild: Array<{ childLabel: string; paidRub: number; dueRub: number }>;
  byService: Array<{ serviceName: string; amountRub: number }>;
  recentPayments: Array<{ at: string; title: string; amountRub: number }>;
  note: string;
};

export function ParentFinancePage() {
  const auth = useAuth();
  const token = auth.accessToken;
  const [data, setData] = useState<ParentFinancePayload | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await api.financeParentOverview(token);
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
        <div className="text-xs text-slate-500">Финансы семьи</div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Мои финансы</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Оплата школьных сервисов и обучения. Внутренние бухгалтерские экраны школы здесь не отображаются.
        </p>
      </header>

      {err ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{err}</div> : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Загрузка данных…</div>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setModal("paid")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300"
            >
              <div className="text-xs text-slate-500">Оплачено</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.summary.totalPaidRub.toLocaleString("ru-RU")} {data.summary.currency}
              </div>
              <div className="mt-2 text-xs text-sky-700">Подробнее →</div>
            </button>
            <button
              type="button"
              onClick={() => setModal("due")}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-300"
            >
              <div className="text-xs text-slate-500">Задолженность / начислено</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.summary.totalDueRub.toLocaleString("ru-RU")} {data.summary.currency}
              </div>
              <div className="mt-2 text-xs text-amber-800">Подробнее →</div>
            </button>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
              {data.note}
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">По детям</h2>
            {data.byChild.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Нет данных по детям (демо-режим).</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {data.byChild.map((c) => (
                  <li key={c.childLabel} className="flex justify-between py-2 text-sm">
                    <span>{c.childLabel}</span>
                    <span className="tabular-nums text-slate-700">
                      оплачено {c.paidRub} ₽ / к оплате {c.dueRub} ₽
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">По услугам</h2>
            {data.byService.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Нет разбивки по услугам (демо-режим).</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.byService.map((s) => (
                  <button
                    key={s.serviceName}
                    type="button"
                    onClick={() => setModal(`service:${s.serviceName}`)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:border-sky-300"
                  >
                    {s.serviceName}: {s.amountRub} ₽
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Последние операции</h2>
            {data.recentPayments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Пока нет операций (демо-режим).</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {data.recentPayments.map((p, i) => (
                  <li key={`${p.at}-${i}`} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <span>{p.title}</span>
                    <span className="tabular-nums text-slate-800">{p.amountRub} ₽</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : !loading && !err ? (
        <div className="text-sm text-slate-500">Нет данных.</div>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          aria-label="Детализация"
        >
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Детализация</div>
            <p className="mt-2 text-sm text-slate-600">
              {modal.startsWith("service:") ? `Услуга: ${modal.replace("service:", "")}` : "Сводные данные по выбранному блоку."}{" "}
              Полные банковские выписки и интеграции появятся в следующих релизах.
            </p>
            <button
              type="button"
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={() => setModal(null)}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
