import type { MouseEvent } from "react";
import { formatChatListTime } from "./domain/chatFormatting";
import type { ChatSummary } from "./domain/chatTypes";
import { useUiPreferences } from "../state/uiPreferences";

function initialsFromTitle(title: string): string {
  const t = title.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  const s = `${a}${b}`.toUpperCase();
  return s || t.slice(0, 2).toUpperCase();
}

function formatUnread(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  if (n > 9) return "9+";
  return String(n);
}

function ChatRowAvatar({
  chat,
  compact,
  iconAccent,
}: {
  chat: ChatSummary;
  compact?: boolean;
  iconAccent?: boolean;
}) {
  const box = compact ? "h-9 w-9 text-sm" : "h-11 w-11 text-lg";
  const accentRing = iconAccent ? " ring-2 ring-sky-400 ring-offset-2 ring-offset-[var(--ed-surface,#fff)]" : "";
  if (chat.avatarUrl) {
    return (
      <img
        src={chat.avatarUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-2 ring-white${accentRing} ${compact ? "h-9 w-9" : "h-11 w-11"}`}
      />
    );
  }
  if (chat.kind === "group") {
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-full bg-sky-100 ring-2 ring-sky-200/80${accentRing} ${box}`}
      >
        👥
      </div>
    );
  }
  if (chat.kind === "channel") {
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-full bg-indigo-100 ring-2 ring-indigo-200/80${accentRing} ${box}`}
      >
        📣
      </div>
    );
  }
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700 ring-2 ring-white${accentRing} ${compact ? "h-9 w-9 text-[10px]" : "h-11 w-11 text-xs"}`}
    >
      {initialsFromTitle(chat.title)}
    </div>
  );
}

export function CommunitoriaChatList({
  chats,
  activeId,
  onSelect,
  loading,
  error,
  compact = false,
  listTransitionKey = "default",
  onRowContextMenu,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (chat: ChatSummary) => void;
  loading: boolean;
  error: Error | null;
  compact?: boolean;
  /** Смена ключа даёт мягкий пересчёт списка при смене папки/фильтра */
  listTransitionKey?: string;
  onRowContextMenu?: (e: MouseEvent, chat: ChatSummary) => void;
}) {
  const ui = useUiPreferences();
  const listMountClass = ui.listAppear === "none" ? "" : "communitoria-chat-list-mount";
  const rowEnterClass = ui.listAppear === "none" ? "" : "communitoria-chat-row-enter";
  const rowDelay = (index: number) =>
    ui.listAppear === "stagger" ? `${40 + index * 45}ms` : "0ms";

  const loadingSkeleton = ui.sectionLoading === "skeleton";
  const loadingSpinner = ui.sectionLoading === "spinner";
  const loadingNone = ui.sectionLoading === "none";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--ed-surface,#fff)]">
      {loading && loadingSkeleton ? (
        <div className="flex flex-1 flex-col gap-2 p-3" aria-busy="true" aria-label="Загрузка списка чатов">
          <div className="communitoria-skeleton-shimmer h-4 w-2/3 rounded bg-slate-200" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`flex rounded-2xl border border-slate-100 p-2 ${rowEnterClass} ${compact ? "gap-2" : "gap-3"}`}
              style={{ animationDelay: rowDelay(i) }}
            >
              <div
                className={`communitoria-skeleton-shimmer shrink-0 rounded-full bg-slate-200 ${compact ? "h-9 w-9" : "h-11 w-11"}`}
              />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="communitoria-skeleton-shimmer h-3 w-1/2 rounded bg-slate-200" />
                <div className="communitoria-skeleton-shimmer h-3 w-full rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {loading && loadingSpinner ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-sm text-slate-500" aria-busy="true">
          <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          Загрузка чатов…
        </div>
      ) : null}
      {loading && loadingNone ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-slate-500" aria-busy="true">
          Загрузка…
        </div>
      ) : null}

      {error && !loading ? (
        <div className="m-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">
          <strong className="font-semibold">Не удалось загрузить список чатов.</strong>
          <div className="mt-1 text-rose-700">{error.message}</div>
        </div>
      ) : null}

      {!loading && !error && chats.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-base font-medium text-slate-800">Пока нет чатов</p>
          <p className="mt-2 max-w-[240px] text-sm text-slate-600">
            Когда появятся диалоги и каналы, они будут показаны здесь.
          </p>
        </div>
      ) : null}

      {!loading && !error && chats.length > 0 ? (
        <ul
          key={listTransitionKey}
          className={`${listMountClass} flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2`}
        >
          {chats.map((chat, index) => {
            const active = chat.id === activeId;
            const unread = chat.unreadCount > 0;
            const activeRow =
              !active
                ? "border-slate-100 bg-white"
                : ui.listActive === "border"
                  ? "border-sky-500 bg-white shadow-md ring-2 ring-sky-100"
                  : ui.listActive === "background"
                    ? "border-sky-300 bg-sky-50 shadow-[0_6px_20px_rgba(14,165,233,0.12)] ring-1 ring-sky-200/60"
                    : ui.listActive === "icon_only"
                      ? "border-slate-100 bg-white shadow-sm"
                      : "border-sky-300 bg-sky-50 shadow-[0_6px_20px_rgba(14,165,233,0.12)] ring-1 ring-sky-200/60";
            return (
              <li
                key={chat.id}
                className={`${rowEnterClass} list-none`}
                style={{
                  animationDelay: ui.listAppear === "stagger" ? `${Math.min(index, 12) * 38}ms` : "0ms",
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(chat)}
                  onContextMenu={
                    onRowContextMenu
                      ? (e) => {
                          e.preventDefault();
                          onRowContextMenu(e, chat);
                        }
                      : undefined
                  }
                  className={[
                    "flex w-full items-start rounded-xl border text-left shadow-sm",
                    "transition-all duration-200 ease-out",
                    "hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-slate-50/90 hover:shadow-md",
                    compact ? "gap-2 px-2.5 py-2.5" : "gap-3 px-3 py-3",
                    activeRow,
                  ].join(" ")}
                >
                  <div className="relative shrink-0">
                    <ChatRowAvatar
                      chat={chat}
                      compact={compact}
                      iconAccent={active && ui.listActive === "icon_only"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        {chat.isPinned ? (
                          <span title="Закреплён" className="text-sky-600">
                            📌
                          </span>
                        ) : null}
                        {chat.isMuted ? (
                          <span title="Без звука" className="text-slate-400">
                            🔕
                          </span>
                        ) : null}
                        <span className={`truncate font-medium text-slate-900 ${compact ? "text-xs" : ""}`}>{chat.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {unread ? (
                          <span
                            className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm"
                            title={`Непрочитано: ${chat.unreadCount}`}
                          >
                            {formatUnread(chat.unreadCount)}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-slate-400">{formatChatListTime(chat.lastMessageAt)}</span>
                      </div>
                    </div>
                    {chat.kind === "channel" ? (
                      <div
                        className={`font-medium uppercase tracking-wide text-indigo-600 ${compact ? "text-[9px]" : "mt-0.5 text-[11px]"}`}
                      >
                        канал
                      </div>
                    ) : null}
                    {chat.communityName ? (
                      <div
                        className={`truncate font-medium text-violet-700 ${compact ? "text-[9px]" : "mt-0.5 text-[11px]"}`}
                        title={chat.communityName}
                      >
                        🏛 {chat.communityName}
                      </div>
                    ) : null}
                    {chat.kind === "direct" ? (
                      <div className={`text-slate-400 ${compact ? "text-[9px]" : "text-[11px]"}`}>личный чат</div>
                    ) : null}
                    <div className={`truncate text-slate-500 ${compact ? "text-[11px]" : "text-sm"}`}>
                      {chat.lastMessagePreview || " "}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
