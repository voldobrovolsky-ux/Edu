"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

const QUICK_ACTIONS = [
  {
    label: "Я заболел(а)",
    text: "я заболел(а)",
    hint: "Сценарий замены на сегодня (как в чате с ботом)",
  },
  {
    label: "Проверить часы работы",
    text: "проверить часы работы",
    hint: "Сводка уроков за неделю",
  },
  {
    label: "Провести саморевизию",
    text: "провести саморевизию",
    hint: "Проверка документов по урокам",
  },
] as const;

/**
 * Кнопки отправляют те же тексты, что и ручной ввод в direct-чат с @system_bot
 * (см. runBotQuickActionForText в apps/api/src/routes/chats.ts).
 */
export function CommunitoriaAssistantPane({ onClose }: { onClose: () => void }) {
  const { accessToken: token } = useAuth();
  const [botId, setBotId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sendBusy, setSendBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadErr("Войдите в систему, чтобы писать ассистенту.");
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const r = await api.chats.users(token, "system");
        if (cancelled) return;
        const bot = r.users.find((u) => u.username === "system_bot");
        setBotId(bot?.id ?? null);
        if (!bot) setLoadErr("Учётная запись ассистента (@system_bot) не найдена.");
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Не удалось загрузить список пользователей чата.");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const send = useCallback(
    async (text: string, label: string) => {
      if (!token || !botId) return;
      setSendBusy(label);
      setFeedback(null);
      try {
        await api.chats.sendMessage(token, { toUserId: botId, text });
        setFeedback({
          kind: "ok",
          text: `Отправлено «${label}». Ответ ассистента появится в том же диалоге в списке чатов.`,
        });
        window.dispatchEvent(new CustomEvent("edumed:chat-unread-refresh"));
      } catch (e) {
        setFeedback({ kind: "err", text: e instanceof Error ? e.message : "Ошибка отправки" });
      } finally {
        setSendBusy(null);
      }
    },
    [token, botId],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50 shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Ассистент</div>
          <div className="text-xs text-slate-500">@system_bot</div>
        </div>
        <button type="button" className="text-sm text-sky-700 hover:underline" onClick={onClose}>
          Закрыть
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Полный диалог — в мессенджере: откройте чат{" "}
          <span className="font-medium text-slate-800">«Ассистент EduMed»</span> в списке слева (тот же поток сообщений).
        </p>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Быстрые действия</p>
          <div className="flex flex-col gap-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.text}
                type="button"
                disabled={!botId || Boolean(sendBusy)}
                title={a.hint}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/80 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void send(a.text, a.label)}
              >
                <span className="block">{a.label}</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">{a.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {loadErr ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
            {loadErr}
          </p>
        ) : null}

        {feedback ? (
          <p
            className={
              feedback.kind === "ok"
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                : "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
            }
            role="status"
          >
            {feedback.text}
          </p>
        ) : null}

        {sendBusy ? <p className="text-xs text-slate-500">Отправка: {sendBusy}…</p> : null}

        <div className="mt-auto border-t border-slate-200 pt-3">
          <Link
            to="/florium"
            className="text-sm font-medium text-sky-700 hover:underline"
            onClick={onClose}
          >
            Открыть мессенджер Communitoria →
          </Link>
        </div>
      </div>
    </div>
  );
}
