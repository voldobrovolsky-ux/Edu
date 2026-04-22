import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  playPrefGatedSound,
  playServiceSound,
  primeServiceAudioFromUserGesture,
} from "../../audio/systemSounds";
import { api, type ChatApiMessage } from "../../lib/api";
import { useAuth } from "../../state/auth";
import { mapChatApiMessageToChatMessage } from "../domain/mapChatApiMessage";
import type { ChatMessage, ChatSummary } from "../domain/chatTypes";

const FETCH_TIMEOUT_MS = 25_000;

/** Сообщение об ошибке загрузки группы (темы / история) для UI */
export const GROUP_MESSAGES_LOAD_ERROR =
  "Не удалось загрузить сообщения этой группы. Попробуйте обновить страницу или перейти в чат позже.";

function parseChatId(summary: ChatSummary): { peerUserId?: string; groupId?: string } {
  if (summary.id.startsWith("direct:")) return { peerUserId: summary.id.slice("direct:".length) };
  if (summary.id.startsWith("group:")) return { groupId: summary.id.slice("group:".length) };
  if (summary.id.startsWith("channel:")) return { groupId: summary.id.slice("channel:".length) };
  return {};
}

function notifyChatUnreadRefresh() {
  window.dispatchEvent(new CustomEvent("edumed:chat-unread-refresh"));
}

function dispatchChatPreviewUpdate(detail: { chatId: string; preview: string; at: string }) {
  window.dispatchEvent(new CustomEvent("edumed:chat-preview-update", { detail }));
}

function previewFromApiMessage(m: ChatApiMessage | undefined): { preview: string; at: string } {
  if (!m) return { preview: "", at: "" };
  const text = String(m.text ?? "").trim().replace(/\s+/g, " ");
  return {
    preview: text.length > 160 ? `${text.slice(0, 157)}…` : text,
    at: String(m.createdAt ?? ""),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface ChatTopic {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
}

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🎉", "👏"] as const;

export type CommunitoriaGroupPanelState = {
  title: string;
  description: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
  createdByUserId: string | null;
  inviteToken: string | null;
  permissions: {
    sendMessages: "all" | "admins";
    sendDocuments: boolean;
    addMembers: boolean;
    pinMessages: boolean;
    changeGroupSettings: boolean;
    changeGroupInfo: boolean;
  };
  groupType: "standard" | "announcements";
  historyForNewMembers: "full" | "month" | "hidden";
  inviteLinks: Array<{ id: string; label?: string; token: string; createdAt: string; hasPassword?: boolean }>;
};

function defaultGroupPanelFromApi(g: Record<string, unknown>): CommunitoriaGroupPanelState {
  const gm = (g.groupMeta ?? {}) as Record<string, unknown>;
  const perms = (gm.permissions ?? {}) as Record<string, unknown>;
  const rawLinks = Array.isArray(gm.inviteLinks) ? gm.inviteLinks : [];
  const inviteLinks = rawLinks
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.token === "string")
    .map((x) => ({
      id: String(x.id ?? ""),
      label: typeof x.label === "string" ? x.label : undefined,
      token: String(x.token),
      createdAt: String(x.createdAt ?? ""),
      hasPassword: Boolean(x.hasPassword ?? x.password),
    }));
  return {
    title: String(g.title ?? ""),
    description: (g.description as string | null) ?? null,
    avatarEmoji: (g.avatarEmoji as string | null) ?? null,
    avatarImageUrl: (g.avatarImageUrl as string | null) ?? null,
    createdByUserId: (g.createdByUserId as string | null) ?? null,
    inviteToken: (g.inviteToken as string | null) ?? null,
    permissions: {
      sendMessages: perms.sendMessages === "admins" ? "admins" : "all",
      sendDocuments: perms.sendDocuments !== false,
      addMembers: perms.addMembers !== false,
      pinMessages: perms.pinMessages !== false,
      changeGroupSettings: perms.changeGroupSettings !== false,
      changeGroupInfo: perms.changeGroupInfo !== false,
    },
    groupType: gm.groupType === "announcements" ? "announcements" : "standard",
    historyForNewMembers:
      gm.historyForNewMembers === "month" || gm.historyForNewMembers === "hidden"
        ? gm.historyForNewMembers
        : "full",
    inviteLinks,
  };
}

type GroupTopicsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; topics: ChatTopic[] }
  | { kind: "error"; message: string };

export function useChatMessages(chat: ChatSummary | null) {
  const auth = useAuth();
  const token = auth.accessToken;
  const myId = auth.user?.id ?? "";

  const [groupTopicsState, setGroupTopicsState] = useState<GroupTopicsState>({ kind: "idle" });
  const [topicId, setTopicId] = useState("");
  const [rawMessages, setRawMessages] = useState<ChatApiMessage[]>([]);
  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ioTick, setIoTick] = useState(0);
  const [groupMembers, setGroupMembers] = useState<
    Array<{ userId: string; fio: string; username: string; role: string }>
  >([]);
  const [userMeta, setUserMeta] = useState<Record<string, { fio: string; username: string }>>({});
  const [groupPanel, setGroupPanel] = useState<CommunitoriaGroupPanelState | null>(null);

  const { peerUserId, groupId } = useMemo(() => (chat ? parseChatId(chat) : {}), [chat]);

  const topics: ChatTopic[] = groupTopicsState.kind === "ok" ? groupTopicsState.topics : [];

  const isGroup = Boolean(groupId);
  const myGroupRole = useMemo(
    () => (isGroup ? groupMembers.find((m) => m.userId === myId)?.role ?? null : null),
    [isGroup, groupMembers, myId],
  );

  const channelRightsLoaded = chat?.kind !== "channel" || groupMembers.length > 0;
  const isChannelAdmin = myGroupRole === "owner" || myGroupRole === "admin";
  const isGroupElevated = myGroupRole === "owner" || myGroupRole === "admin";
  const groupSendAdminsOnly =
    Boolean(groupId) &&
    (chat?.kind === "group" || chat?.kind === "channel") &&
    (groupPanel?.permissions.sendMessages ?? "all") === "admins" &&
    !isGroupElevated;
  const channelComposerBlocked =
    (chat?.kind === "channel" && (!channelRightsLoaded || !isChannelAdmin)) || groupSendAdminsOnly;
  const channelComposerLoading = chat?.kind === "channel" && !channelRightsLoaded;
  const groupComposerAdminsOnly = groupSendAdminsOnly;

  const authorLabel = useCallback(
    (uid: string) => {
      if (uid === myId) return "Вы";
      const gm = groupMembers.find((g) => g.userId === uid);
      if (gm) return gm.fio;
      const u = userMeta[uid];
      if (u) return u.fio;
      return uid.slice(0, 8);
    },
    [groupMembers, myId, userMeta],
  );

  const botUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of groupMembers) {
      if (m.username === "system_bot") s.add(m.userId);
    }
    for (const [id, u] of Object.entries(userMeta)) {
      if (u.username === "system_bot") s.add(id);
    }
    return s;
  }, [groupMembers, userMeta]);

  const domainMessages: ChatMessage[] = useMemo(() => {
    if (!chat) return [];
    const mapped = rawMessages.map((m) =>
      mapChatApiMessageToChatMessage(m, {
        chatId: chat.id,
        myId,
        authorLabel,
        botUserIds,
      }),
    );
    return [...mapped, ...optimistic].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [chat, rawMessages, myId, authorLabel, botUserIds, optimistic]);

  const domainMessagesRef = useRef(domainMessages);
  domainMessagesRef.current = domainMessages;

  /** Темы группы / канала */
  useEffect(() => {
    if (!token || !groupId) {
      setGroupTopicsState((prev) => (prev.kind === "idle" ? prev : { kind: "idle" }));
      setTopicId((t) => (t === "" ? t : ""));
      return;
    }
    setGroupTopicsState({ kind: "loading" });
    let cancelled = false;
    void api.chats
      .groupTopics(token, groupId)
      .then((r) => {
        if (cancelled) return;
        const t = (r.topics ?? [])
          .filter((x) => !x.archived)
          .map((x) => ({
            id: x.id,
            name: x.name,
            emoji: x.emoji,
            isDefault: x.isDefault,
          }));
        setGroupTopicsState({ kind: "ok", topics: t });
        const def = t.find((x) => x.isDefault) ?? t[0];
        setTopicId((prev) => (prev && t.some((x) => x.id === prev) ? prev : def?.id ?? ""));
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "TOPICS_FAILED";
        setGroupTopicsState({ kind: "error", message: msg });
        setTopicId("");
      });
    return () => {
      cancelled = true;
    };
  }, [token, groupId, ioTick]);

  /** Карточка группы (права, мета) */
  useEffect(() => {
    if (!token || !groupId) {
      setGroupPanel(null);
      return;
    }
    let cancelled = false;
    void api.chats.getGroup(token, groupId).then(
      (r) => {
        if (cancelled) return;
        setGroupPanel(defaultGroupPanelFromApi(r.group as Record<string, unknown>));
      },
      () => {
        if (!cancelled) setGroupPanel(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, groupId, ioTick]);

  /** Участники группы / канала */
  useEffect(() => {
    if (!token || !groupId) {
      setGroupMembers([]);
      return;
    }
    let cancelled = false;
    void api.chats.groupMembers(token, groupId).then((r) => {
      if (cancelled) return;
      setGroupMembers(
        (r.members ?? []).map((m) => ({
          userId: m.userId,
          fio: m.fio,
          username: m.username,
          role: m.role,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [token, groupId]);

  /** batch пользователей для подписей в direct + боты */
  useEffect(() => {
    if (!token || !chat) return;
    const ids = new Set<string>();
    if (myId) ids.add(myId);
    if (peerUserId) ids.add(peerUserId);
    for (const m of rawMessages) {
      const u = String(m.fromUserId ?? m.senderUserId ?? "");
      if (u) ids.add(u);
    }
    const list = [...ids].sort();
    if (list.length === 0) return;
    let cancelled = false;
    void api.chats.usersBatch(token, list).then((r) => {
      if (cancelled) return;
      const next: Record<string, { fio: string; username: string }> = {};
      for (const u of r.users ?? []) {
        next[u.id] = { fio: u.fio, username: u.username };
      }
      setUserMeta(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token, chat?.id, peerUserId, myId, rawMessages]);

  /** Загрузка истории (direct или группа по topicId) */
  useEffect(() => {
    if (!token || !chat) {
      setRawMessages([]);
      setOptimistic([]);
      setError(null);
      setLoading(false);
      return;
    }

    const chatId = chat.id;

    if (peerUserId) {
      setLoading(true);
      setError(null);
      let cancelled = false;
      void (async () => {
        try {
          const r = await withTimeout(api.chats.messages(token, { userId: peerUserId }), FETCH_TIMEOUT_MS);
          if (cancelled) return;
          const list = r.messages ?? [];
          setRawMessages(list);
          const last = list.at(-1);
          const { preview, at } = previewFromApiMessage(last);
          if (preview) dispatchChatPreviewUpdate({ chatId, preview, at });
          /* Не блокируем UI ожиданием markAsRead (зависание read = вечный скелетон). */
          void api.chats
            .markAsRead(token, { userId: peerUserId })
            .then(() => notifyChatUnreadRefresh())
            .catch(() => notifyChatUnreadRefresh());
        } catch (e) {
          if (cancelled) return;
          const msg =
            e instanceof Error && e.message === "REQUEST_TIMEOUT"
              ? "Превышено время ожидания ответа сервера."
              : e instanceof Error
                ? e.message
                : "LOAD_FAILED";
          setError(msg);
          setRawMessages([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!groupId) {
      setLoading(false);
      setError(null);
      return;
    }

    if (groupTopicsState.kind === "loading" || groupTopicsState.kind === "idle") {
      setLoading(true);
      setError(null);
      setRawMessages([]);
      return;
    }

    if (groupTopicsState.kind === "error") {
      setLoading(false);
      setRawMessages([]);
      setError(GROUP_MESSAGES_LOAD_ERROR);
      return;
    }

    const topicsList = groupTopicsState.topics;
    if (topicsList.length === 0 || !topicId) {
      setLoading(false);
      setRawMessages([]);
      setError(GROUP_MESSAGES_LOAD_ERROR);
      return;
    }

    setLoading(true);
    setError(null);
    let cancelled = false;
    void (async () => {
      try {
        const r = await withTimeout(
          api.chats.groupMessages(token, groupId, topicId),
          FETCH_TIMEOUT_MS,
        );
        if (cancelled) return;
        const list = r.messages ?? [];
        setRawMessages(list);
        const last = list.at(-1);
        const { preview, at } = previewFromApiMessage(last);
        if (preview) dispatchChatPreviewUpdate({ chatId, preview, at });
        if (last?.createdAt) {
          void api.chats
            .groupRead(token, groupId, { topicId, at: String(last.createdAt) })
            .then(() => notifyChatUnreadRefresh())
            .catch(() => notifyChatUnreadRefresh());
        } else {
          notifyChatUnreadRefresh();
        }
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof Error && e.message === "REQUEST_TIMEOUT"
            ? "Превышено время ожидания ответа сервера."
            : GROUP_MESSAGES_LOAD_ERROR;
        setError(msg);
        setRawMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, chat?.id, peerUserId, groupId, topicId, groupTopicsState, ioTick]);

  const refetch = useCallback(() => {
    setError(null);
    setIoTick((t) => t + 1);
  }, []);

  const sendText = useCallback(
    async (text: string, opts?: { replyToMessageId?: string; replyToSnippet?: string }) => {
      if (!token || !chat || !text.trim()) return;
      primeServiceAudioFromUserGesture();
      playPrefGatedSound("sending", "outgoing");
      const body = text.trim();
      const replyToMessageId = opts?.replyToMessageId;
      const replyToSnippet = opts?.replyToSnippet;
      const tempId = `local-${Date.now()}`;
      const optimisticRow: ChatMessage = {
        id: tempId,
        chatId: chat.id,
        authorId: myId,
        authorDisplayName: "Вы",
        authorKind: "me",
        text: body,
        createdAt: new Date().toISOString(),
        status: "sending",
        isReplyToMessageId: replyToMessageId,
        replyToSnippet,
      };
      setOptimistic((o) => [...o, optimisticRow]);
      try {
        if (peerUserId) {
          await api.chats.sendMessage(token, {
            toUserId: peerUserId,
            text: body,
            ...(replyToMessageId ? { replyToMessageId } : {}),
          });
        } else if (groupId && topicId) {
          await api.chats.sendGroupMessage(token, groupId, {
            topicId,
            text: body,
            ...(replyToMessageId ? { replyToMessageId } : {}),
          });
        }
        setOptimistic((o) => o.filter((x) => x.id !== tempId));
        if (peerUserId) {
          const r = await withTimeout(api.chats.messages(token, { userId: peerUserId }), FETCH_TIMEOUT_MS);
          setRawMessages(r.messages ?? []);
        } else if (groupId && topicId) {
          const r = await withTimeout(
            api.chats.groupMessages(token, groupId, topicId),
            FETCH_TIMEOUT_MS,
          );
          const list = r.messages ?? [];
          setRawMessages(list);
          const last = list.at(-1);
          const { preview, at } = previewFromApiMessage(last);
          if (preview) dispatchChatPreviewUpdate({ chatId: chat.id, preview, at });
        }
        notifyChatUnreadRefresh();
      } catch (e) {
        playServiceSound("error");
        setOptimistic((o) =>
          o.map((x) => (x.id === tempId ? { ...x, status: "failed" as const } : x)),
        );
      }
    },
    [token, chat, myId, peerUserId, groupId, topicId],
  );

  const retryFailed = useCallback(
    async (messageId: string) => {
      const row = optimistic.find((x) => x.id === messageId && x.status === "failed");
      if (!row || !token) return;
      primeServiceAudioFromUserGesture();
      playPrefGatedSound("sending", "outgoing");
      setOptimistic((o) => o.map((x) => (x.id === messageId ? { ...x, status: "sending" } : x)));
      try {
        if (peerUserId) {
          await api.chats.sendMessage(token, {
            toUserId: peerUserId,
            text: row.text,
            ...(row.isReplyToMessageId ? { replyToMessageId: row.isReplyToMessageId } : {}),
          });
        } else if (groupId && topicId) {
          await api.chats.sendGroupMessage(token, groupId, {
            topicId,
            text: row.text,
            ...(row.isReplyToMessageId ? { replyToMessageId: row.isReplyToMessageId } : {}),
          });
        }
        setOptimistic((o) => o.filter((x) => x.id !== messageId));
        if (peerUserId) {
          const r = await withTimeout(api.chats.messages(token, { userId: peerUserId }), FETCH_TIMEOUT_MS);
          setRawMessages(r.messages ?? []);
        } else if (groupId && topicId) {
          const r = await withTimeout(
            api.chats.groupMessages(token, groupId, topicId),
            FETCH_TIMEOUT_MS,
          );
          setRawMessages(r.messages ?? []);
        }
        notifyChatUnreadRefresh();
      } catch {
        playServiceSound("error");
        setOptimistic((o) =>
          o.map((x) => (x.id === messageId ? { ...x, status: "failed" as const } : x)),
        );
      }
    },
    [optimistic, token, peerUserId, groupId, topicId],
  );

  const reloadRawMessages = useCallback(async () => {
    if (!token) return;
    if (peerUserId) {
      const r = await withTimeout(api.chats.messages(token, { userId: peerUserId }), FETCH_TIMEOUT_MS);
      setRawMessages(r.messages ?? []);
    } else if (groupId && topicId) {
      const r = await withTimeout(api.chats.groupMessages(token, groupId, topicId), FETCH_TIMEOUT_MS);
      setRawMessages(r.messages ?? []);
    }
  }, [token, peerUserId, groupId, topicId]);

  /** Одна реакция на пользователя: смена эмодзи снимает предыдущую. */
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!token || !chat || messageId.startsWith("local-")) return;
      const msg = domainMessagesRef.current.find((x) => x.id === messageId);
      const mineReaction = msg?.reactions?.find((r) => r.reactedByMe);
      try {
        if (mineReaction && mineReaction.emoji !== emoji) {
          if (peerUserId) {
            await api.chats.reactionDirect(token, messageId, mineReaction.emoji);
          } else if (groupId) {
            await api.chats.reactionGroup(token, groupId, messageId, mineReaction.emoji);
          }
        }
        if (peerUserId) {
          await api.chats.reactionDirect(token, messageId, emoji);
        } else if (groupId) {
          await api.chats.reactionGroup(token, groupId, messageId, emoji);
        }
        await reloadRawMessages();
        notifyChatUnreadRefresh();
      } catch {
        // TODO: тост об ошибке
      }
    },
    [token, chat, peerUserId, groupId, reloadRawMessages],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!token || !chat || messageId.startsWith("local-")) return;
      try {
        if (peerUserId) {
          await api.chats.deleteDirectMessage(token, messageId);
        } else if (groupId) {
          await api.chats.deleteGroupMessage(token, groupId, messageId);
        }
        await reloadRawMessages();
        notifyChatUnreadRefresh();
      } catch {
        // TODO: тост
      }
    },
    [token, chat, peerUserId, groupId, reloadRawMessages],
  );

  return {
    messages: domainMessages,
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
    myGroupRole,
    myId,
    peerUserId,
    groupId,
    groupPanel,
    groupComposerAdminsOnly,
    groupMembers,
  };
}
