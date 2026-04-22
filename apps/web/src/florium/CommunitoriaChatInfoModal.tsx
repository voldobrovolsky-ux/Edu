import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { NOTIFICATION_SOUND_ID_LIST, type NotificationSoundId } from "../audio/systemSoundConfig";
import { playIncomingNotificationSample } from "../audio/systemSounds";
import { api } from "../lib/api";
import { useUiPreferences } from "../state/uiPreferences";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";
import type { ChatSummary } from "./domain/chatTypes";
import type { ChatTopic, CommunitoriaGroupPanelState } from "./data/useChatMessages";
import { addChatLinkObjectToRiviSpace, loadRiviState } from "./riviStorage";

function addMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function CommunitoriaChatInfoModal({
  open,
  onClose,
  chat,
  token,
  convKey,
  peerUserId: _peerUserId,
  groupId,
  groupPanel,
  topics,
  memberCount,
  myId: _myId,
  myGroupRole,
  initialPrefs,
  onPrefsUpdated,
  onLeaveComplete,
  onOpenManage,
}: {
  open: boolean;
  onClose: () => void;
  chat: ChatSummary;
  token: string | null;
  convKey: string;
  peerUserId?: string;
  groupId?: string;
  groupPanel: CommunitoriaGroupPanelState | null;
  topics: ChatTopic[];
  memberCount: number;
  myId: string;
  myGroupRole: string | null;
  initialPrefs: { muted: boolean; muteExpiresAt: string | null; incomingSoundId: string | null };
  onPrefsUpdated: () => void;
  onLeaveComplete: () => void;
  onOpenManage: () => void;
}) {
  const navigate = useNavigate();
  const uiPrefs = useUiPreferences();
  const [notifOpen, setNotifOpen] = useState(false);
  const [muteSubOpen, setMuteSubOpen] = useState(false);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([]);
  const [leaveStep, setLeaveStep] = useState<"idle" | "confirm">("idle");
  const [customUntil, setCustomUntil] = useState("");

  const canManage = Boolean(groupId && (myGroupRole === "owner" || myGroupRole === "admin"));
  const isOwner = myGroupRole === "owner";

  const patch = useCallback(
    async (body: Omit<Parameters<typeof api.chats.patchPrefs>[1], "convKey">) => {
      if (!token) return;
      await api.chats.patchPrefs(token, { ...body, convKey });
      onPrefsUpdated();
    },
    [token, convKey, onPrefsUpdated],
  );

  const pickSound = useCallback(
    async (id: NotificationSoundId) => {
      playIncomingNotificationSample(id);
      await patch({ incomingSoundId: id });
    },
    [patch],
  );

  const title = chat.title;
  const subtitle =
    chat.kind === "direct"
      ? "Личный чат"
      : chat.kind === "channel"
        ? "Канал"
        : "Группа";

  const avatarSrc = chat.avatarUrl ?? groupPanel?.avatarImageUrl ?? null;
  const emoji = groupPanel?.avatarEmoji ?? null;

  useEffect(() => {
    if (!open) {
      setNotifOpen(false);
      setMuteSubOpen(false);
      setSpacesOpen(false);
      setSelectedSpaceIds([]);
      setLeaveStep("idle");
    }
  }, [open]);

  const handleLeave = useCallback(async () => {
    if (!token || !groupId) return;
    await api.chats.leaveGroup(token, groupId, { mode: "leave" });
    onLeaveComplete();
    navigate("/florium?m=communitoria", { replace: true });
    onClose();
  }, [token, groupId, onLeaveComplete, navigate, onClose]);

  const handleDeleteGroup = useCallback(async () => {
    if (!token || !groupId) return;
    await api.chats.leaveGroup(token, groupId, { mode: "delete_all" });
    onLeaveComplete();
    navigate("/florium?m=communitoria", { replace: true });
    onClose();
  }, [token, groupId, onLeaveComplete, navigate, onClose]);

  const mainGrid = useMemo(
    () => (
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setNotifOpen(true)}
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
        >
          <span className="text-2xl" aria-hidden>
            🔔
          </span>
          Уведомления
        </button>
        <button
          type="button"
          onClick={() => setSpacesOpen(true)}
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
        >
          <span className="text-2xl" aria-hidden>
            🧩
          </span>
          Добавить в пространства
        </button>
        {chat.kind !== "direct" ? (
          <button
            type="button"
            onClick={() => setLeaveStep("confirm")}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-5 text-sm font-medium text-slate-800 transition-colors hover:bg-rose-50"
          >
            <span className="text-2xl" aria-hidden>
              🚪
            </span>
            Покинуть
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
            Покинуть недоступно в личном чате
          </div>
        )}
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              onOpenManage();
              onClose();
            }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
          >
            <span className="text-2xl" aria-hidden>
              ⚙️
            </span>
            Управлять
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">
            Управлять могут админы
          </div>
        )}
      </div>
    ),
    [canManage, chat.kind, onClose, onOpenManage],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[6px]"
      role="presentation"
      aria-hidden
    >
      <div className="relative max-h-[min(90vh,640px)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <button type="button" className="absolute right-4 top-4 text-slate-500 hover:text-slate-800" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        {!notifOpen ? (
          <>
            <div className="flex flex-col items-center text-center">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-24 w-24 rounded-full object-cover shadow-md" />
              ) : (
                <div
                  className={[
                    "flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold text-white shadow-md",
                    communitoriaColorClassForKey(chat.id),
                  ].join(" ")}
                >
                  {emoji || communitoriaInitials(title)}
                </div>
              )}
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
              <p className="text-sm text-slate-500">{subtitle}</p>
              {chat.kind !== "direct" ? (
                <p className="mt-1 text-xs text-slate-400">
                  {memberCount} участник{memberCount === 1 ? "" : memberCount < 5 ? "а" : "ов"}
                  {topics.length > 1 ? ` · ${topics.length} темы` : ""}
                </p>
              ) : null}
            </div>
            <div className="mt-8">{mainGrid}</div>
          </>
        ) : (
          <div className="pr-6">
            <button type="button" className="mb-4 text-sm text-sky-700 hover:underline" onClick={() => setNotifOpen(false)}>
              ← Назад
            </button>
            <h3 className="text-base font-semibold text-slate-900">Уведомления</h3>
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Выбрать звук</div>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
                {NOTIFICATION_SOUND_ID_LIST.map((id) => {
                  const fallback = uiPrefs.incomingNotificationSound;
                  const active =
                    initialPrefs.incomingSoundId === id ||
                    (initialPrefs.incomingSoundId == null && id === fallback);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => void pickSound(id)}
                        className={[
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          active ? "bg-sky-100 font-medium text-sky-950" : "hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span className="text-sky-600" aria-hidden>
                          ♪
                        </span>
                        {id}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => void patch({ muted: true, muteExpiresAt: null, incomingSoundId: null })}
              >
                Выключить звук
              </button>
              <div className="relative">
                <button
                  type="button"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => setMuteSubOpen((v) => !v)}
                >
                  Выключить на… ▾
                </button>
                {muteSubOpen ? (
                  <div className="absolute left-0 right-0 z-10 mt-1 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {(
                      [
                        ["1 ч", () => addMs(3600_000)],
                        ["8 ч", () => addMs(8 * 3600_000)],
                        ["1 день", () => addMs(86400_000)],
                        ["1 неделя", () => addMs(7 * 86400_000)],
                      ] as const
                    ).map(([lab, iso]) => (
                      <button
                        key={lab}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          void patch({ muted: false, muteExpiresAt: iso() });
                          setMuteSubOpen(false);
                        }}
                      >
                        {lab}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => void patch({ muted: true, muteExpiresAt: null })}
                    >
                      До включения вручную
                    </button>
                    <div className="border-t border-slate-100 px-3 py-2">
                      <label className="block text-xs text-slate-600">Свой срок</label>
                      <input
                        type="datetime-local"
                        value={customUntil}
                        onChange={(e) => setCustomUntil(e.target.value)}
                        className="mt-1 w-full rounded border px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        className="mt-2 w-full rounded-lg bg-sky-600 py-1.5 text-sm text-white"
                        onClick={() => {
                          if (!customUntil) return;
                          const d = new Date(customUntil);
                          if (Number.isNaN(d.getTime())) return;
                          void patch({ muted: false, muteExpiresAt: d.toISOString() });
                          setMuteSubOpen(false);
                        }}
                      >
                        Применить дату
                      </button>
                    </div>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                      onClick={() => void patch({ muted: true, muteExpiresAt: null })}
                    >
                      Выключить навсегда
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {spacesOpen
          ? createPortal(
              <div className="fixed inset-0 z-[10065] flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
                <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
                  <p className="text-base font-semibold text-slate-900">Добавить в пространство Rivi</p>
                  <p className="mt-1 text-sm text-slate-600">Выберите пространства для «{chat.title}».</p>
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
                            checked={selectedSpaceIds.includes(space.id)}
                            onChange={(e) =>
                              setSelectedSpaceIds((prev) =>
                                e.target.checked ? [...prev, space.id] : prev.filter((id) => id !== space.id),
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
                      onClick={() => {
                        setSpacesOpen(false);
                        setSelectedSpaceIds([]);
                      }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={selectedSpaceIds.length === 0}
                      className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                      onClick={() => {
                        selectedSpaceIds.forEach((spaceId) =>
                          addChatLinkObjectToRiviSpace(spaceId, {
                            chatId: chat.id,
                            title: chat.title,
                            subtitle: chat.lastMessagePreview,
                            communityName: chat.communityName ?? "",
                            kind: chat.kind === "direct" ? "direct" : "group",
                          }),
                        );
                        setSpacesOpen(false);
                        setSelectedSpaceIds([]);
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

        {leaveStep === "confirm"
          ? createPortal(
              <div className="fixed inset-0 z-[10065] flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
                <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
                  <p className="text-sm text-slate-800">
                    {isOwner
                      ? "Вы — создатель группы. Удалить группу для всех участников или просто выйти?"
                      : "Вы действительно хотите покинуть эту группу?"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isOwner ? (
                      <>
                        <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm text-white" onClick={() => void handleDeleteGroup()}>
                          Удалить группу для всех
                        </button>
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => void handleLeave()}>
                          Просто выйти из группы
                        </button>
                        <button type="button" className="rounded-xl px-4 py-2 text-sm text-slate-600" onClick={() => setLeaveStep("idle")}>
                          Отмена
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="rounded-xl bg-rose-600 px-4 py-2 text-sm text-white" onClick={() => void handleLeave()}>
                          Покинуть группу
                        </button>
                        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm" onClick={() => setLeaveStep("idle")}>
                          Отмена
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>,
    document.body,
  );
}
