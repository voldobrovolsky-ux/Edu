import { useMemo, useState } from "react";
import {
  playPrefGatedSound,
  playServiceSound,
  primeServiceAudioFromUserGesture,
} from "../audio/systemSounds";
import { api } from "../lib/api";
import type { ChatSummary } from "./domain/chatTypes";

/**
 * Пересылка текста в выбранные чаты.
 * TODO: отдельный тип forward в API; для групп/каналов нужна тема — пока только direct безопасно.
 */
export function CommunitoriaForwardModal({
  token,
  chats,
  textToForward,
  excludeChatId,
  onClose,
  onSent,
}: {
  token: string;
  chats: ChatSummary[];
  textToForward: string;
  excludeChatId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const directTargets = useMemo(
    () => chats.filter((c) => c.kind === "direct" && c.id !== excludeChatId),
    [chats, excludeChatId],
  );

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const confirm = async () => {
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) return;
    primeServiceAudioFromUserGesture();
    playPrefGatedSound("sending", "outgoing");
    const body = `[Переслано]\n${textToForward}`;
    setBusy(true);
    try {
      for (const id of ids) {
        const peer = id.startsWith("direct:") ? id.slice("direct:".length) : "";
        if (!peer) continue;
        await api.chats.sendMessage(token, { toUserId: peer, text: body });
      }
      onSent();
      onClose();
    } catch {
      playServiceSound("error");
      window.alert("Не удалось переслать сообщение. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[min(480px,80vh)] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Переслать сообщение</h3>
          <p className="mt-1 text-xs text-slate-500">
            Выберите личные чаты получателей. Группы и каналы —{" "}
            <span className="font-medium text-slate-600">TODO: выбор темы и API forward</span>.
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto p-2">
          {directTargets.length === 0 ? (
            <li className="px-2 py-4 text-center text-sm text-slate-500">Нет других личных чатов</li>
          ) : (
            directTargets.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[c.id])}
                    onChange={() => toggle(c.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="truncate text-sm text-slate-800">{c.title}</span>
                </label>
              </li>
            ))
          )}
        </ul>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || directTargets.length === 0}
            onClick={() => void confirm()}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Отправка…" : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  );
}
