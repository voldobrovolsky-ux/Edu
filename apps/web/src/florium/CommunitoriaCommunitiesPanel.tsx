import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";

function pluralGroupsRu(n: number): string {
  const m = n % 100;
  if (m >= 11 && m <= 14) return "групп";
  const d = n % 10;
  if (d === 1) return "группа";
  if (d >= 2 && d <= 4) return "группы";
  return "групп";
}

type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
  metaType: string;
  linkedGroupCount: number;
  isAdmin: boolean;
};

/**
 * Список сообществ: не закрывается по клику на затемнение — только ✕, Назад или Esc.
 */
export function CommunitoriaCommunitiesPanel({
  open,
  onClose,
  onSelectCommunity,
  onCreateCommunity,
}: {
  open: boolean;
  onClose: () => void;
  onSelectCommunity: (communityId: string) => void;
  onCreateCommunity: () => void;
}) {
  const { accessToken: token } = useAuth();
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) {
      setRows([]);
      setErr("Нет сессии");
      return;
    }
    setLoading(true);
    setErr(null);
    void api.chats
      .communitiesList(token)
      .then((r) => setRows(r.communities ?? []))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Не удалось загрузить"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

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

  if (!open) return null;

  const layer = (
    <div className="fixed inset-0 z-[10040] flex items-stretch justify-start sm:items-center sm:justify-center sm:p-4" role="presentation">
      {/* Затемнение без закрытия по клику */}
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[6px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="communitoria-communities-title"
        className="relative z-[10041] flex h-full w-full max-w-md flex-col overflow-hidden border-slate-200/90 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.2)] sm:max-h-[min(88vh,640px)] sm:rounded-2xl sm:border"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 id="communitoria-communities-title" className="text-base font-semibold text-slate-900">
            Сообщества
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-sky-700 hover:bg-sky-50"
              onClick={onClose}
            >
              Назад
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              onClick={onClose}
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {err ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {err}
            </p>
          ) : null}
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Загрузка…</p> : null}
          {!loading && !err && rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">Пока нет сообществ. Создайте первое ниже.</p>
          ) : null}
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectCommunity(c.id)}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm transition-all hover:border-sky-200 hover:shadow-md"
                >
                  {c.avatarImageUrl ? (
                    <img src={c.avatarImageUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-slate-100" />
                  ) : (
                    <div
                      className={[
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-white ring-2 ring-white",
                        communitoriaColorClassForKey(c.id),
                      ].join(" ")}
                    >
                      {c.avatarEmoji || communitoriaInitials(c.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">{c.name}</span>
                      {c.isAdmin ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                          админ
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-600">{c.description?.trim() || "Без описания"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {c.linkedGroupCount} {pluralGroupsRu(c.linkedGroupCount)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onCreateCommunity}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--ed-radius-md,16px)] border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm font-medium text-sky-950 shadow-[var(--ed-shadow-card,0_8px_24px_rgba(15,23,42,0.06))] transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-[0_20px_48px_rgba(15,23,42,0.14)]"
          >
            <span className="text-xl" aria-hidden>
              ➕
            </span>
            Создать сообщество
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(layer, document.body);
}
