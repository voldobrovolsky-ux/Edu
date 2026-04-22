import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import {
  autoLinkText,
  calendarDayKey,
  formatDateSeparatorLabel,
  formatMessageTime,
} from "./domain/chatFormatting";
import type { ChatMessage, ChatSummary } from "./domain/chatTypes";
import { REACTION_EMOJIS, useChatMessages } from "./data/useChatMessages";
import {
  buildCommunitoriaMessageLink,
  CommunitoriaMessageContextMenu,
  copyTextToClipboard,
  type ContextMenuItem,
} from "./CommunitoriaMessageContextMenu";
import { CommunitoriaForwardModal } from "./CommunitoriaForwardModal";
import { CommunitoriaComposerEmojiPopover } from "./CommunitoriaComposerEmojiPopover";
import { COMMUNITORIA_MESSAGE_TIGHT_GAP_MS } from "./communitoriaConstants";
import { CommunitoriaChatInfoModal } from "./CommunitoriaChatInfoModal";
import { CommunitoriaGroupManageModal } from "./CommunitoriaGroupManageModal";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";
import type { ChatMessageDensity, ChatSendAnimation } from "../state/uiPersonalization";
import { useUiPreferences } from "../state/uiPreferences";

const SCROLL_NEAR_BOTTOM_PX = 96;

function messageClusterKey(m: ChatMessage): string | null {
  if (m.authorKind === "system" || m.isService) return null;
  if (m.authorKind === "me") return "me";
  return m.authorId;
}

function gapClassBetween(
  prev: ChatMessage | undefined,
  curr: ChatMessage,
  density: ChatMessageDensity,
): string {
  // Keep messages visually dense: minimal gaps between bubbles.
  const pack = density === "spacious" ? "mt-1" : "mt-0.5";
  const br = density === "spacious" ? "mt-2" : "mt-1.5";
  if (curr.authorKind === "system" || curr.isService) return br;
  if (!prev) return "";
  if (prev.authorKind === "system" || prev.isService) return br;

  const prevKey = messageClusterKey(prev);
  const currKey = messageClusterKey(curr);
  const dt = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  const samePack =
    prevKey != null &&
    currKey != null &&
    prevKey === currKey &&
    dt >= 0 &&
    dt < COMMUNITORIA_MESSAGE_TIGHT_GAP_MS;
  return samePack ? pack : br;
}

function bubbleEnterClass(shouldAnim: boolean, mine: boolean, mode: ChatSendAnimation): string {
  if (!shouldAnim || mode === "none") return "";
  if (mode === "fade") return mine ? "communitoria-msg-anim-out" : "communitoria-msg-anim-in";
  return mine ? "communitoria-bubble-launch-out" : "communitoria-bubble-in-soft";
}

function snippetPreview(text: string, max = 100): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Сообщение";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function DeliveryStatusIcon({ status }: { status?: ChatMessage["status"] }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [status]);

  let inner: ReactNode;
  if (status === "sending")
    inner = <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white/70" title="Отправка…" />;
  else if (status === "failed")
    inner = (
      <span className="text-rose-200 transition-colors duration-200" title="Ошибка">
        !
      </span>
    );
  else if (status === "read")
    inner = (
      <span className="text-sky-200" title="Прочитано">
        ✓✓
      </span>
    );
  else if (status === "delivered")
    inner = (
      <span className="text-white/55" title="Доставлено">
        ✓✓
      </span>
    );
  else
    inner = (
      <span className="text-white/45" title="Отправлено">
        ✓
      </span>
    );

  return (
    <span
      className={[
        "communitoria-status-icon inline-flex min-h-[14px] min-w-[14px] items-center justify-center text-[11px] leading-none tracking-tight",
        visible ? "communitoria-status-icon-visible" : "communitoria-status-icon-enter",
      ].join(" ")}
      aria-hidden
    >
      {inner}
    </span>
  );
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 px-1" role="separator">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="ed-caption shrink-0 text-xs text-slate-500">{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function LoadErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="m-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900"
      role="alert"
    >
      <p className="font-medium text-rose-950">Не удалось загрузить переписку</p>
      <p className="mt-2 text-rose-800">{message}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800"
      >
        Повторить
      </button>
    </div>
  );
}

/**
 * Центральная панель: история + composer (Telegram-like).
 * TODO: интерактивные опросы, bot replacement prompts, поиск по чату, панель закреплённых — как в legacy ChatsPage.
 */
export function CommunitoriaMessagePane({
  chat,
  forwardTargetChats = [],
  communityReturn,
  onBackToCommunity,
}: {
  chat: ChatSummary;
  forwardTargetChats?: ChatSummary[];
  /** Если чат открыт из экрана сообщества — показать «Назад к сообществу». */
  communityReturn?: { id: string; name: string } | null;
  onBackToCommunity?: () => void;
}) {
  const { accessToken } = useAuth();
  const {
    messages,
    loading,
    error,
    topics,
    topicId,
    setTopicId,
    sendText,
    retryFailed,
    toggleReaction,
    deleteMessage,
    refetch,
    channelComposerBlocked,
    channelComposerLoading,
    groupComposerAdminsOnly,
    peerUserId,
    groupId,
    myGroupRole,
    myId,
    groupPanel,
    groupMembers,
  } = useChatMessages(chat);

  const uiPrefs = useUiPreferences();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [forwardFrom, setForwardFrom] = useState<ChatMessage | null>(null);
  const [stubKind, setStubKind] = useState<"attach" | "translate" | null>(null);
  const [stubTranslateText, setStubTranslateText] = useState("");
  const [flashCopyId, setFlashCopyId] = useState<string | null>(null);
  const [hoverMsgId, setHoverMsgId] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const emojiAnchorRef = useRef<HTMLButtonElement>(null);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const stickBottomRef = useRef(true);
  const listBaselineReadyRef = useRef(false);
  const frozenMessageIdsRef = useRef<Set<string>>(new Set());
  const [, bumpFrozen] = useState(0);
  const [, bumpBaseline] = useState(0);
  const prevMessageLenRef = useRef(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [headerStatus, setHeaderStatus] = useState("");
  const [infoPrefs, setInfoPrefs] = useState<{
    muted: boolean;
    muteExpiresAt: string | null;
    incomingSoundId: string | null;
  }>({ muted: false, muteExpiresAt: null, incomingSoundId: null });

  const convKey = peerUserId ? `direct:${peerUserId}` : groupId ? `group:${groupId}` : "";

  useEffect(() => {
    if (!accessToken) return;
    if (peerUserId) {
      let cancelled = false;
      void api.chats.presence(accessToken, peerUserId).then((p) => {
        if (cancelled) return;
        if (p.presenceHidden) setHeaderStatus("статус скрыт");
        else if (p.online) setHeaderStatus("онлайн");
        else if (p.lastSeenAt) setHeaderStatus(`был(а) в сети ${new Date(p.lastSeenAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`);
        else setHeaderStatus("не в сети");
      });
      return () => {
        cancelled = true;
      };
    }
    if (groupId) {
      setHeaderStatus(`Участников: ${groupMembers.length}${topics.length > 1 ? ` · тем: ${topics.length}` : ""}`);
    } else {
      setHeaderStatus("");
    }
    return undefined;
  }, [accessToken, peerUserId, groupId, groupMembers.length, topics.length]);

  useEffect(() => {
    if (!infoOpen || !accessToken) return;
    if (groupId) {
      void api.chats.getGroup(accessToken, groupId).then((r) => {
        const p = r.prefs as Record<string, unknown>;
        setInfoPrefs({
          muted: Boolean(p.muted),
          muteExpiresAt: (p.muteExpiresAt as string) || null,
          incomingSoundId: (p.incomingSoundId as string) || null,
        });
      });
    } else if (peerUserId) {
      setInfoPrefs({
        muted: Boolean(chat.isMuted),
        muteExpiresAt: null,
        incomingSoundId: null,
      });
    }
  }, [infoOpen, accessToken, groupId, peerUserId, chat.isMuted]);

  const registerMsgRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) msgRefs.current[id] = el;
    else delete msgRefs.current[id];
  }, []);

  const jumpToMessage = useCallback((id: string) => {
    msgRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const updateStickBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_NEAR_BOTTOM_PX;
  }, []);

  const openMsgCtxMenu = useCallback((clientX: number, clientY: number, m: ChatMessage) => {
    setContextMenu({ x: clientX, y: clientY, message: m });
  }, []);

  const buildMenuItems = useCallback(
    (m: ChatMessage): ContextMenuItem[] => {
      const canDelete = m.authorKind === "me" && !m.deletedForAll && !m.id.startsWith("local-");
      const showLink = chat.kind === "group" || chat.kind === "channel";
      const gid = chat.id.split(":")[1] ?? "";
      const items: ContextMenuItem[] = [
        {
          id: "reply",
          icon: "↩",
          label: "Ответить",
          onSelect: () => {
            setReplyTo(m);
            requestAnimationFrame(() => taRef.current?.focus());
          },
        },
        {
          id: "copy",
          icon: "📋",
          label: "Копировать текст",
          disabled: !m.text || Boolean(m.deletedForAll),
          onSelect: () => {
            void (async () => {
              if (!m.text || m.deletedForAll) return;
              const ok = await copyTextToClipboard(m.text);
              if (ok) {
                setFlashCopyId(m.id);
                window.setTimeout(() => setFlashCopyId((id) => (id === m.id ? null : id)), 650);
              } else {
                window.alert("Не удалось скопировать в буфер обмена.");
              }
            })();
          },
        },
        {
          id: "forward",
          icon: "➡️",
          label: "Переслать…",
          disabled: !m.text || Boolean(m.deletedForAll),
          onSelect: () => setForwardFrom(m),
        },
        {
          id: "attach",
          icon: "📎",
          label: "Прикрепить…",
          onSelect: () => setStubKind("attach"),
        },
        {
          id: "translate",
          icon: "🌐",
          label: "Перевести…",
          disabled: !m.text || Boolean(m.deletedForAll),
          onSelect: () => {
            setStubTranslateText(m.text);
            setStubKind("translate");
          },
        },
      ];
      if (showLink && gid) {
        items.push({
          id: "link",
          icon: "🔗",
          label: "Скопировать ссылку на сообщение",
          onSelect: () => {
            void (async () => {
              const url = buildCommunitoriaMessageLink(gid, m.id);
              const ok = await copyTextToClipboard(url);
              if (ok) {
                setFlashCopyId(m.id);
                window.setTimeout(() => setFlashCopyId((id) => (id === m.id ? null : id)), 650);
              } else {
                window.alert("Не удалось скопировать ссылку.");
              }
            })();
          },
        });
      }
      if (canDelete) {
        items.push({
          id: "delete",
          icon: "🗑️",
          label: "Удалить",
          danger: true,
          onSelect: () => {
            if (!window.confirm("Удалить это сообщение?")) return;
            void deleteMessage(m.id);
          },
        });
      }
      return items;
    },
    [chat.id, chat.kind, deleteMessage],
  );

  useEffect(() => {
    setReplyTo(null);
  }, [chat.id]);

  useEffect(() => {
    listBaselineReadyRef.current = false;
    frozenMessageIdsRef.current = new Set();
    stickBottomRef.current = true;
    prevMessageLenRef.current = 0;
  }, [chat.id, topicId]);

  useEffect(() => {
    if (loading || listBaselineReadyRef.current) return;
    listBaselineReadyRef.current = true;
    frozenMessageIdsRef.current = new Set(messages.map((m) => m.id));
    bumpBaseline((n) => n + 1);
  }, [loading, messages, chat.id, topicId]);

  useEffect(() => {
    scrollToBottom("auto");
    stickBottomRef.current = true;
  }, [chat.id, topicId, scrollToBottom]);

  useEffect(() => {
    if (loading) return;
    const len = messages.length;
    const prevLen = prevMessageLenRef.current;
    const grew = len > prevLen;
    if (stickBottomRef.current && len > 0 && (grew || prevLen === 0)) {
      scrollToBottom("smooth");
    }
    prevMessageLenRef.current = len;
  }, [loading, messages.length, scrollToBottom]);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el || channelComposerBlocked) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, channelComposerBlocked]);

  const markMessageAnimatedIn = useCallback((id: string) => {
    frozenMessageIdsRef.current.add(id);
    bumpFrozen((n) => n + 1);
  }, []);

  const trimmedDraft = draft.trim();
  const isComposerEmpty = trimmedDraft.length === 0;

  const submit = useCallback(async () => {
    if (isComposerEmpty) return;
    const t = trimmedDraft;
    setDraft("");
    const rt = replyTo;
    setReplyTo(null);
    stickBottomRef.current = true;
    await sendText(t, {
      replyToMessageId: rt?.id.startsWith("local-") ? undefined : rt?.id,
      replyToSnippet: rt ? snippetPreview(rt.text || rt.replyToSnippet || "") : undefined,
    });
    requestAnimationFrame(() => scrollToBottom("smooth"));
  }, [trimmedDraft, isComposerEmpty, sendText, scrollToBottom, replyTo]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (isComposerEmpty) return;
      e.preventDefault();
      void submit();
    }
  };

  const showAuthorName = chat.kind === "group" || chat.kind === "channel";
  const baselineReady = listBaselineReadyRef.current && !loading;
  const showDeliveryTicks = Boolean(peerUserId || groupId);
  const canAttachDocuments =
    !groupId ||
    !groupPanel ||
    groupPanel.permissions.sendDocuments ||
    myGroupRole === "owner" ||
    myGroupRole === "admin";

  return (
    <>
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100 shadow-sm">
      {communityReturn && onBackToCommunity ? (
        <div className="shrink-0 border-b border-sky-200/80 bg-sky-50 px-3 py-2">
          <button
            type="button"
            onClick={onBackToCommunity}
            className="text-left text-sm font-medium text-sky-900 hover:underline"
          >
            ← Назад к сообществу «{communityReturn.name}»
          </button>
        </div>
      ) : null}
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex w-full min-w-0 items-start gap-3 rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-slate-50"
        >
          {chat.avatarUrl || groupPanel?.avatarImageUrl ? (
            <img
              src={chat.avatarUrl ?? groupPanel?.avatarImageUrl ?? ""}
              alt=""
              className="mt-0.5 h-11 w-11 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className={[
                "mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                communitoriaColorClassForKey(chat.id),
              ].join(" ")}
            >
              {groupPanel?.avatarEmoji || communitoriaInitials(chat.title)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-slate-900">{chat.title}</div>
            <div className="truncate text-xs text-slate-500">
              {chat.kind === "direct" && (headerStatus || "Личный чат")}
              {chat.kind === "group" && (headerStatus || "Группа")}
              {chat.kind === "channel" && (headerStatus || "Канал")}
            </div>
          </div>
        </button>
        {groupId && topics.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {topics.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopicId(t.id)}
                className={[
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
                  topicId === t.id ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                ].join(" ")}
              >
                {t.emoji} {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={updateStickBottom}
      >
        {loading && uiPrefs.sectionLoading === "skeleton" ? (
          <div className="space-y-3 p-2" aria-busy="true" aria-label="Загрузка сообщений">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`communitoria-skeleton-shimmer h-12 rounded-2xl bg-slate-200/90 ${i % 2 === 0 ? "ml-8 mr-0 max-w-[82%]" : "ml-0 mr-8 max-w-[78%]"}`}
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        ) : null}
        {loading && uiPrefs.sectionLoading === "spinner" ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-500" aria-busy="true">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            Загрузка сообщений…
          </div>
        ) : null}
        {loading && uiPrefs.sectionLoading === "none" ? (
          <div className="py-12 text-center text-sm text-slate-500" aria-busy="true">
            Загрузка…
          </div>
        ) : null}

        {!loading && error ? <LoadErrorPanel message={error} onRetry={refetch} /> : null}

        {!loading &&
          !error &&
          messages.map((m, i) => {
            const day = calendarDayKey(m.createdAt);
            const prevDay = i > 0 ? calendarDayKey(messages[i - 1]!.createdAt) : "";
            const showSep = Boolean(day && day !== prevDay);
            const prevMsg = i > 0 ? messages[i - 1] : undefined;
            const gapTop = showSep
              ? uiPrefs.chatDensity === "spacious"
                ? "mt-2"
                : uiPrefs.chatDensity === "compact"
                  ? "mt-0.5"
                  : "mt-1"
              : gapClassBetween(prevMsg, m, uiPrefs.chatDensity);
            return (
              <Fragment key={m.id}>
                {showSep ? <DateSeparator label={formatDateSeparatorLabel(m.createdAt)} /> : null}
                <div ref={(el) => registerMsgRef(m.id, el)} className={gapTop}>
                  <MessageRowView
                    m={m}
                    allMessages={messages}
                    showAuthorName={showAuthorName}
                    showDeliveryTicks={showDeliveryTicks}
                    hoverMsgId={hoverMsgId}
                    setHoverMsgId={setHoverMsgId}
                    onToggleReaction={toggleReaction}
                    onRetry={() => void retryFailed(m.id)}
                    onReply={setReplyTo}
                    onJumpToQuoted={jumpToMessage}
                    shouldAnimateEnter={baselineReady && !frozenMessageIdsRef.current.has(m.id)}
                    onEnterAnimationDone={markMessageAnimatedIn}
                    onOpenCtxMenu={openMsgCtxMenu}
                    flashCopy={flashCopyId === m.id}
                    chatSendAnimation={uiPrefs.chatSendAnimation}
                  />
                </div>
              </Fragment>
            );
          })}
        <div ref={endRef} className="h-1 shrink-0" />
      </div>

      {channelComposerBlocked ? (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-600">
          {channelComposerLoading
            ? "Проверка прав доступа…"
            : groupComposerAdminsOnly
              ? "Писать в этом чате могут только администраторы."
              : "Сообщения в этом канале могут публиковать только администраторы."}
        </div>
      ) : (
        <footer className="shrink-0 border-t border-slate-200 bg-white p-3">
          {replyTo ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/90 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1 border-l-2 border-sky-400 pl-2">
                <div className="text-[10px] font-medium uppercase tracking-wide text-sky-700">
                  Ответ {replyTo.authorKind === "me" ? "себе" : `· ${replyTo.authorDisplayName}`}
                </div>
                <div className="truncate text-slate-700">{snippetPreview(replyTo.text, 140)}</div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:bg-sky-100 hover:text-slate-800"
                title="Отменить ответ"
                aria-label="Отменить ответ"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="mb-1 rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
              title={canAttachDocuments ? "Вложения (скоро)" : "Отправка документов ограничена"}
              disabled={!canAttachDocuments}
            >
              📎
            </button>
            <button
              ref={emojiAnchorRef}
              type="button"
              className="mb-1 rounded-lg p-2 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600"
              title="Эмодзи, стикеры, GIF"
              aria-expanded={emojiPopoverOpen}
              onClick={() => setEmojiPopoverOpen((v) => !v)}
            >
              😊
            </button>
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              rows={1}
              placeholder="Сообщение…"
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-[height,border-color,box-shadow] duration-200 ease-out ring-sky-500/30 focus:border-sky-400 focus:ring-2"
            />
            <button
              type="button"
              disabled={isComposerEmpty}
              onClick={() => void submit()}
              className={[
                "mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform duration-200",
                isComposerEmpty
                  ? "cursor-not-allowed bg-slate-200 text-slate-400"
                  : "bg-sky-600 hover:scale-[1.02] hover:bg-sky-700 active:scale-[0.98]",
              ].join(" ")}
              title="Отправить"
            >
              ➤
            </button>
          </div>
          <CommunitoriaComposerEmojiPopover
            open={emojiPopoverOpen}
            anchorRef={emojiAnchorRef}
            onClose={() => setEmojiPopoverOpen(false)}
          />
          <p
            className={[
              "mt-1 text-center text-[10px] text-slate-400 transition-opacity duration-200 ease-out",
              composerFocused ? "opacity-100" : "pointer-events-none opacity-0",
            ].join(" ")}
          >
            Enter — отправить · Shift+Enter — новая строка
          </p>
        </footer>
      )}
    </div>

      {contextMenu ? (
        <CommunitoriaMessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems(contextMenu.message)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {forwardFrom && accessToken ? (
        <CommunitoriaForwardModal
          token={accessToken}
          chats={forwardTargetChats}
          textToForward={forwardFrom.deletedForAll && !forwardFrom.modVisible ? "" : forwardFrom.text}
          excludeChatId={chat.id}
          onClose={() => setForwardFrom(null)}
          onSent={() => notifyChatUnreadRefresh()}
        />
      ) : null}

      {stubKind === "attach" ? (
        <div
          className="fixed inset-0 z-[205] flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          onClick={(e) => e.target === e.currentTarget && setStubKind(null)}
        >
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Прикрепить контент</h3>
            <p className="mt-2 text-sm text-slate-600">
              TODO: сюда будет прикрепление файлов, ссылок и других типов контента.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
              onClick={() => setStubKind(null)}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      {stubKind === "translate" ? (
        <div
          className="fixed inset-0 z-[205] flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          onClick={(e) => e.target === e.currentTarget && setStubKind(null)}
        >
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Перевод</h3>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">TODO: LLM / API переводчика</p>
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{stubTranslateText}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
              onClick={() => setStubKind(null)}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      <CommunitoriaChatInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        chat={chat}
        token={accessToken}
        convKey={convKey}
        peerUserId={peerUserId}
        groupId={groupId}
        groupPanel={groupPanel}
        topics={topics}
        memberCount={groupMembers.length}
        myId={myId}
        myGroupRole={myGroupRole}
        initialPrefs={infoPrefs}
        onPrefsUpdated={() => {
          if (groupId && accessToken) {
            void api.chats.getGroup(accessToken, groupId).then((r) => {
              const p = r.prefs as Record<string, unknown>;
              setInfoPrefs({
                muted: Boolean(p.muted),
                muteExpiresAt: (p.muteExpiresAt as string) || null,
                incomingSoundId: (p.incomingSoundId as string) || null,
              });
            });
          }
          void refetch();
          notifyChatUnreadRefresh();
        }}
        onLeaveComplete={() => void refetch()}
        onOpenManage={() => setManageOpen(true)}
      />
      {groupId && accessToken ? (
        <CommunitoriaGroupManageModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          token={accessToken}
          groupId={groupId}
          initial={groupPanel}
          topics={topics}
          members={groupMembers}
          myId={myId}
          myRole={myGroupRole}
          onUpdated={() => void refetch()}
        />
      ) : null}
    </>
  );
}

function notifyChatUnreadRefresh() {
  window.dispatchEvent(new CustomEvent("edumed:chat-unread-refresh"));
}

function ReactionPill({
  emoji,
  count,
  reactedByMe,
  onClick,
}: {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  onClick: () => void;
}) {
  const prevCount = useRef<number | null>(null);
  const [countBump, setCountBump] = useState(false);
  const [growIn, setGrowIn] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setGrowIn(false), 260);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (prevCount.current === null) {
      prevCount.current = count;
      return;
    }
    if (prevCount.current !== count) {
      setCountBump(true);
      const t = setTimeout(() => setCountBump(false), 260);
      prevCount.current = count;
      return () => clearTimeout(t);
    }
  }, [count]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-200",
        growIn ? "communitoria-pill-grow" : "",
        reactedByMe ? "border-sky-400 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700",
      ].join(" ")}
    >
      <span>{emoji}</span>
      <span className={`tabular-nums text-slate-500 ${countBump ? "communitoria-reaction-count-pop" : ""}`}>{count}</span>
    </button>
  );
}

function MessageRowView({
  m,
  allMessages,
  showAuthorName,
  showDeliveryTicks,
  hoverMsgId,
  setHoverMsgId,
  onToggleReaction,
  onRetry,
  onReply,
  onJumpToQuoted,
  shouldAnimateEnter,
  onEnterAnimationDone,
  onOpenCtxMenu,
  flashCopy,
  chatSendAnimation,
}: {
  m: ChatMessage;
  allMessages: ChatMessage[];
  showAuthorName: boolean;
  showDeliveryTicks: boolean;
  hoverMsgId: string | null;
  setHoverMsgId: (id: string | null) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onRetry: () => void;
  onReply: (msg: ChatMessage) => void;
  onJumpToQuoted: (messageId: string) => void;
  shouldAnimateEnter: boolean;
  onEnterAnimationDone: (messageId: string) => void;
  onOpenCtxMenu: (clientX: number, clientY: number, message: ChatMessage) => void;
  flashCopy: boolean;
  chatSendAnimation: ChatSendAnimation;
}) {
  const [shakeFailed, setShakeFailed] = useState(false);
  const failedSeenRef = useRef(false);
  const longPressRef = useRef<number | null>(null);

  useEffect(() => {
    if (m.status === "failed" && !failedSeenRef.current) {
      failedSeenRef.current = true;
      setShakeFailed(true);
      const t = window.setTimeout(() => setShakeFailed(false), 480);
      return () => window.clearTimeout(t);
    }
    if (m.status !== "failed") failedSeenRef.current = false;
  }, [m.status, m.id]);

  useEffect(() => {
    if (!shouldAnimateEnter) return;
    const id = m.id;
    const t = window.setTimeout(() => onEnterAnimationDone(id), 480);
    return () => window.clearTimeout(t);
  }, [shouldAnimateEnter, m.id, onEnterAnimationDone]);

  if (m.authorKind === "system" || m.isService) {
    return (
      <div className="flex justify-center px-4 py-0.5">
        <span className="max-w-[90%] text-center text-xs text-slate-500">
          {m.deletedForAll && !m.modVisible ? "Сообщение удалено" : autoLinkText(m.text, "text-sky-700 underline hover:text-sky-900")}
        </span>
      </div>
    );
  }

  const mine = m.authorKind === "me";
  const isHover = hoverMsgId === m.id;
  const bubbleEnter = bubbleEnterClass(shouldAnimateEnter, mine, chatSendAnimation);

  const quoted = m.isReplyToMessageId
    ? allMessages.find((x) => x.id === m.isReplyToMessageId)
    : undefined;
  const quoteLabel =
    m.replyToSnippet ??
    (quoted ? snippetPreview(quoted.text, 100) : m.isReplyToMessageId ? "Сообщение" : null);

  const linkMine = "break-all text-sky-100 underline decoration-sky-200/70 hover:decoration-white";
  const linkTheir = "break-all text-sky-600 underline hover:text-sky-800";

  return (
    <div
      className={mine ? "group flex justify-end" : "group flex justify-start"}
      onMouseEnter={() => setHoverMsgId(m.id)}
      onMouseLeave={() => setHoverMsgId(null)}
    >
      <div className="min-w-0 max-w-[75%]">
        {!mine && showAuthorName ? (
          <div className="mb-0.5 pl-1 text-[11px] font-medium text-slate-500">{m.authorDisplayName}</div>
        ) : null}
        <div
          className={[
            "relative inline-block w-max max-w-full overflow-visible pl-2.5 pr-10 pt-2 pb-2 text-sm shadow-sm transition-[opacity,box-shadow] duration-200",
            mine ? "rounded-2xl rounded-br-md bg-sky-600 text-white" : "rounded-2xl rounded-bl-md border border-slate-200 bg-white text-slate-900",
            m.authorKind === "bot" && !mine ? "border-sky-200 bg-sky-50" : "",
            m.status === "sending" ? "opacity-80" : "",
            m.status === "failed" ? "ring-2 ring-rose-400 ring-offset-0" : "",
            shakeFailed ? "communitoria-bubble-shake" : "",
            flashCopy ? "communitoria-bubble-flash-copy" : "",
            bubbleEnter,
          ].join(" ")}
          onAnimationEnd={(e) => {
            if (e.animationName === "communitoria-shake") setShakeFailed(false);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenCtxMenu(e.clientX, e.clientY, m);
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (!t) return;
            longPressRef.current = window.setTimeout(() => {
              onOpenCtxMenu(t.clientX, t.clientY, m);
            }, 520);
          }}
          onTouchEnd={() => {
            if (longPressRef.current != null) {
              window.clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
          }}
          onTouchCancel={() => {
            if (longPressRef.current != null) {
              window.clearTimeout(longPressRef.current);
              longPressRef.current = null;
            }
          }}
        >
          <button
            type="button"
            aria-label="Меню сообщения"
            className={[
              "absolute right-1 top-1 z-[3] flex h-7 w-7 items-center justify-center rounded-lg border text-xs leading-none shadow-sm transition-opacity hover:bg-white/20",
              mine
                ? "border-white/40 bg-white/15 text-white opacity-100 md:opacity-0 md:group-hover:opacity-100"
                : "border-slate-200/90 bg-white/95 text-slate-600 hover:bg-slate-50 opacity-100 md:opacity-0 md:group-hover:opacity-100",
            ].join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onOpenCtxMenu(r.left, r.bottom + 4, m);
            }}
          >
            ⋯
          </button>
          {m.isReplyToMessageId && quoteLabel ? (
            <button
              type="button"
              onClick={() => onJumpToQuoted(m.isReplyToMessageId!)}
              className={[
                "mb-1 w-full border-l-2 pl-2 text-left text-xs transition-opacity hover:opacity-90",
                mine ? "border-white/50 text-white/90" : "border-sky-400 text-slate-600",
              ].join(" ")}
            >
              <span className="font-medium">В ответ на</span>
              <span className="mt-0.5 line-clamp-2 block opacity-90">{quoteLabel}</span>
            </button>
          ) : null}
          {m.modVisible ? <div className="mb-1 text-xs text-amber-700">Скрыто модерацией</div> : null}
          <div className="flex min-w-0 items-end justify-end gap-x-2">
            <div className="min-w-0 max-w-full flex-[1_1_auto] text-left whitespace-pre-wrap break-words">
              {m.deletedForAll && !m.modVisible
                ? "Сообщение удалено"
                : autoLinkText(m.text, mine ? linkMine : linkTheir)}
            </div>
            <div
              className={[
                "inline-flex shrink-0 select-none items-center gap-1 self-end text-[11px] tabular-nums leading-none",
                mine ? "text-white/75" : "text-slate-400",
              ].join(" ")}
            >
              {mine && m.status === "failed" ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="shrink-0 rounded bg-white/20 px-1 py-0.5 text-white transition-colors duration-200 hover:bg-white/30"
                  title="Повторить отправку"
                >
                  ↻
                </button>
              ) : null}
              <span>{formatMessageTime(m.createdAt)}</span>
              {mine && showDeliveryTicks ? <DeliveryStatusIcon status={m.status} /> : null}
            </div>
          </div>
        </div>

        {!m.isService && !m.deletedForAll && isHover ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] shadow-sm transition-transform duration-150 hover:scale-105 hover:bg-slate-50"
              title="Ответить"
              onClick={() => onReply(m)}
            >
              ↩
            </button>
            {REACTION_EMOJIS.map((em: (typeof REACTION_EMOJIS)[number]) => (
              <button
                key={em}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-xs shadow-sm transition-transform duration-150 hover:scale-105 hover:bg-slate-50"
                title="Реакция"
                onClick={() => void onToggleReaction(m.id, em)}
              >
                {em}
              </button>
            ))}
          </div>
        ) : null}

        {m.reactions && m.reactions.length > 0 ? (
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {m.reactions.map((r) => (
              <ReactionPill
                key={r.emoji}
                emoji={r.emoji}
                count={r.count}
                reactedByMe={r.reactedByMe}
                onClick={() => void onToggleReaction(m.id, r.emoji)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
