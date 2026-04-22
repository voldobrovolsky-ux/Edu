import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { playServiceSound } from "../audio/systemSounds";
import { api } from "../lib/api";

export type BroadcastGroupRow = { groupId: string; title: string; isAnnouncement: boolean };

/**
 * Массовое оповещение по группам сообщества. Закрытие только по кнопкам (не по клику на фон).
 */
export function CommunitoriaCommunityBroadcastModal({
  open,
  onClose,
  token,
  communityId,
  communityName,
  groups,
  announcementGroupId,
  botEnabled,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  communityId: string;
  communityName: string;
  groups: BroadcastGroupRow[];
  announcementGroupId: string;
  botEnabled: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sender, setSender] = useState<"user" | "bot">("user");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allIds = useMemo(() => groups.map((g) => g.groupId), [groups]);

  useEffect(() => {
    if (!open) return;
    setText("");
    setErr(null);
    setSender("user");
    setSelected(new Set(allIds.length ? allIds : announcementGroupId ? [announcementGroupId] : []));
  }, [open, allIds, announcementGroupId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectOnlyAnnouncement = useCallback(() => {
    if (announcementGroupId) setSelected(new Set([announcementGroupId]));
  }, [announcementGroupId]);

  const selectAll = useCallback(() => {
    setSelected(new Set(allIds));
  }, [allIds]);

  const submit = useCallback(async () => {
    const t = text.trim();
    if (!t || selected.size === 0) return;
    setErr(null);
    setSending(true);
    try {
      await api.chats.broadcastCommunity(token, communityId, {
        text: t,
        groupIds: [...selected],
        sender: sender === "bot" && botEnabled ? "bot" : "user",
      });
      playServiceSound("success");
      onSent();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось отправить");
      playServiceSound("error");
    } finally {
      setSending(false);
    }
  }, [text, selected, token, communityId, sender, botEnabled, onSent, onClose]);

  if (!open) return null;

  const layer = (
    <div className="fixed inset-0 z-[10055] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[6px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="comm-broadcast-title"
        className="relative z-[10056] flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 id="comm-broadcast-title" className="text-base font-semibold text-slate-900">
            Оповещение по сообществу
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-xs text-slate-600">
            Сообщение будет отправлено в выбранные чаты сообщества «{communityName}».
          </p>
          <label className="block text-xs font-medium text-slate-600">
            Текст объявления
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-2"
              placeholder="Введите текст…"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50" onClick={selectAll}>
              Выбрать все
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={selectOnlyAnnouncement}
            >
              Только анонс-чат
            </button>
          </div>

          <div className="text-xs font-medium text-slate-600">Куда отправить</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
            {groups.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-slate-500">Нет доступных групп</li>
            ) : (
              groups.map((g) => (
                <li key={g.groupId}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <input type="checkbox" checked={selected.has(g.groupId)} onChange={() => toggle(g.groupId)} />
                    <span className="text-sm">
                      {g.isAnnouncement ? "📣 " : ""}
                      {g.title}
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>

          {botEnabled ? (
            <fieldset className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <legend className="px-1 text-xs font-medium text-slate-600">Отправитель</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="broadcast-sender"
                  checked={sender === "user"}
                  onChange={() => setSender("user")}
                />
                От имени администратора (я)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="broadcast-sender"
                  checked={sender === "bot"}
                  onChange={() => setSender("bot")}
                />
                От имени бота-ассистента
              </label>
            </fieldset>
          ) : null}

          {err ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {err}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            disabled={sending || !text.trim() || selected.size === 0}
            className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm disabled:opacity-50"
            onClick={() => void submit()}
          >
            {sending ? "Отправка…" : "Отправить оповещение"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(layer, document.body);
}
