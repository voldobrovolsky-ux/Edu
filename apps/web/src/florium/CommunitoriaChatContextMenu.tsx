import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import type { ChatSummary } from "./domain/chatTypes";
import { chatSummaryToConvKey } from "./domain/chatConvKey";
import { VIEWPORT_GUTTER, scrollDownToFullyReveal } from "./popoverViewport";
import { addChatLinkObjectToRiviSpace, loadRiviState } from "./riviStorage";

const PREMIUM_CLEAR_FOR_BOTH = true;

export type CommunitoriaChatMenuState = {
  chat: ChatSummary;
  x: number;
  y: number;
} | null;

function MenuBtn({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
        danger ? "text-rose-700 hover:bg-rose-50" : "text-slate-800 hover:bg-slate-100",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="block font-medium">{label}</span>
      <span className="mt-0.5 block text-[11px] font-normal leading-snug text-slate-500">{hint}</span>
    </button>
  );
}

export function CommunitoriaChatContextMenuHost({
  token,
  menu,
  onClose,
  onPatched,
}: {
  token: string | null;
  menu: CommunitoriaChatMenuState;
  onClose: () => void;
  onPatched: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [clearDialog, setClearDialog] = useState<ChatSummary | null>(null);
  const [riviModal, setRiviModal] = useState<null | { chat: ChatSummary; selectedSpaceIds: string[] }>(null);

  useLayoutEffect(() => {
    if (!menu) return;
    const el = popRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    let left = menu.x;
    let top = menu.y;
    if (left + w + VIEWPORT_GUTTER > window.innerWidth) left = window.innerWidth - w - VIEWPORT_GUTTER;
    if (left < VIEWPORT_GUTTER) left = VIEWPORT_GUTTER;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      scrollDownToFullyReveal(rect, document.elementFromPoint(menu.x, menu.y) as HTMLElement | null);
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPtr = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPtr);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPtr);
    };
  }, [menu, onClose]);

  const patchPrefs = async (chat: ChatSummary, body: { muted?: boolean; important?: boolean }) => {
    if (!token) {
      window.alert("Нет сессии.");
      return;
    }
    try {
      await api.chats.patchPrefs(token, { convKey: chatSummaryToConvKey(chat), ...body });
      onPatched();
      onClose();
    } catch {
      window.alert("Не удалось сохранить настройки чата.");
    }
  };

  const runClear = (chat: ChatSummary, scope: "self" | "all") => {
    window.dispatchEvent(
      new CustomEvent("edumed:chat-clear-request", {
        detail: { chatId: chat.id, scope },
      }),
    );
    setClearDialog(null);
    onClose();
    if (scope === "self") {
      window.alert("Очистка истории у вас (демо): запрос зарегистрирован.");
    } else {
      window.alert("Очистка у всех (демо): запрос зарегистрирован.");
    }
  };

  if (!menu) return null;

  const chat = menu.chat;
  const isDirect = chat.kind === "direct";

  const content = (
    <div
      ref={popRef}
      className="fixed z-[500] w-[min(100vw-16px,320px)] rounded-xl border border-slate-200 bg-white py-1 shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
      style={{ left: 0, top: 0 }}
      role="menu"
    >
      <div className="max-h-[min(70vh,420px)] overflow-y-auto px-1 py-1">
        <MenuBtn
          label={chat.isPinned ? "Открепить чат" : "Закрепить чат"}
          hint={
            chat.isPinned
              ? "Вернуть чат в обычный список по времени активности."
              : "Переместить чат в верхнюю часть списка, чтобы он всегда был под рукой."
          }
          onClick={() => void patchPrefs(chat, { important: !chat.isPinned })}
        />
        <MenuBtn
          label={chat.isMuted ? "Включить уведомления" : "Выключить уведомления"}
          hint={
            chat.isMuted
              ? "Снова разрешить уведомления и звуки для этого чата."
              : "Не показывать уведомления и звуки для этого чата."
          }
          onClick={() => void patchPrefs(chat, { muted: !chat.isMuted })}
        />
        {isDirect ? (
          <MenuBtn
            label="Заблокировать пользователя"
            hint="Пользователь не сможет писать вам новые сообщения в этом чате."
            onClick={() => {
              window.alert("Блокировка пользователя будет доступна при подключении API.");
              onClose();
            }}
          />
        ) : null}
        {isDirect ? (
          <MenuBtn
            label="Разблокировать пользователя"
            hint="Снять блокировку и вернуть возможность общения."
            onClick={() => {
              window.alert("Разблокировка будет доступна при подключении API.");
              onClose();
            }}
          />
        ) : null}
        <MenuBtn
          label="Добавить в пространство Rivi"
          hint="Создать объект группы или чата на визуальном поле Rivi."
          onClick={() => {
            const suggested = loadRiviState().lastOpenedSpaceId;
            setRiviModal({ chat, selectedSpaceIds: suggested ? [suggested] : [] });
          }}
        />
        <MenuBtn
          label="Очистить чат"
          hint="Удалить историю сообщений в этом чате у вас. Содержимое у собеседника не изменится."
          danger
          onClick={() => {
            if (PREMIUM_CLEAR_FOR_BOTH) setClearDialog(chat);
            else runClear(chat, "self");
          }}
        />
        <MenuBtn
          label={chat.unreadCount > 0 ? "Снять метку непрочитанного" : "Пометить как непрочитанный"}
          hint={
            chat.unreadCount > 0
              ? "Убрать индикатор непрочитанного и считать чат просмотренным."
              : "Сделать вид, что новые сообщения ещё не просмотрены. Чат снова появится с индикатором."
          }
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("edumed:chat-summary-patch", {
                detail: {
                  chatId: chat.id,
                  patch: { unreadCount: chat.unreadCount > 0 ? 0 : 1 },
                },
              }),
            );
            onClose();
          }}
        />
      </div>
    </div>
  );

  const clearModal =
    clearDialog && PREMIUM_CLEAR_FOR_BOTH ? (
      <div
        className="fixed inset-0 z-[520] flex items-center justify-center bg-slate-900/45 p-4"
        role="dialog"
        aria-modal
        aria-label="Очистка чата"
      >
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-base font-semibold text-slate-900">Очистить чат</p>
          <p className="mt-2 text-sm text-slate-600">Выберите, как удалить историю для «{clearDialog.title}».</p>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm hover:bg-slate-50"
              onClick={() => runClear(clearDialog, "self")}
            >
              <span className="font-medium text-slate-900">Очистить только у меня</span>
              <span className="mt-1 block text-xs text-slate-500">Сообщения исчезнут только в вашем интерфейсе.</span>
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-left text-sm hover:bg-rose-50"
              onClick={() => runClear(clearDialog, "all")}
            >
              <span className="font-medium text-rose-900">Очистить у всех</span>
              <span className="mt-1 block text-xs text-rose-800/90">
                Сообщения будут удалены и у вас, и у собеседника (если поддерживается политикой чата).
              </span>
            </button>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => setClearDialog(null)}
          >
            Отмена
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {createPortal(content, document.body)}
      {clearModal ? createPortal(clearModal, document.body) : null}
      {riviModal
        ? createPortal(
            <div className="fixed inset-0 z-[530] flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal>
              <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="text-base font-semibold text-slate-900">Добавить в пространство Rivi</div>
                <p className="mt-1 text-sm text-slate-600">Выберите пространства для «{riviModal.chat.title}».</p>
                <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto">
                  {loadRiviState().spaces.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      Пока нет пространств Rivi. Сначала создайте пространство в модуле `Rivi`.
                    </div>
                  ) : (
                    loadRiviState().spaces.map((space) => (
                      <label
                        key={space.id}
                        className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={riviModal.selectedSpaceIds.includes(space.id)}
                          onChange={(e) =>
                            setRiviModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    selectedSpaceIds: e.target.checked
                                      ? [...prev.selectedSpaceIds, space.id]
                                      : prev.selectedSpaceIds.filter((id) => id !== space.id),
                                  }
                                : prev,
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-slate-900">{space.title}</span>
                          <span className="mt-1 block text-xs text-slate-500">{space.description || "Без описания"}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
                    onClick={() => setRiviModal(null)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={riviModal.selectedSpaceIds.length === 0}
                    className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    onClick={() => {
                      const target = riviModal;
                      target.selectedSpaceIds.forEach((spaceId) =>
                        addChatLinkObjectToRiviSpace(spaceId, {
                          chatId: target.chat.id,
                          title: target.chat.title,
                          subtitle: target.chat.lastMessagePreview,
                          communityName: target.chat.communityName ?? "",
                          kind: target.chat.kind === "direct" ? "direct" : "group",
                        }),
                      );
                      setRiviModal(null);
                      onClose();
                    }}
                  >
                    Добавить
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

