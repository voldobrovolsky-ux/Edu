import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../state/auth";
import type { ChatKind, ChatSummary } from "../domain/chatTypes";

export type { ChatKind, ChatSummary } from "../domain/chatTypes";

export interface UseCommunitoriaChatsResult {
  chats: ChatSummary[];
  loading: boolean;
  error: Error | null;
  /** @param silent если true — обновить данные без полноэкранного loading (для фонового refresh после read/reaction) */
  refetch: (opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * TODO(backend): inbox item should expose explicit `groupType: "group" | "channel"`.
 */
function inboxGroupToKind(item: { groupId: string; groupType?: "group" | "channel" }): ChatKind {
  if (item.groupType === "channel") return "channel";
  return "group";
}

function inboxGroupToId(item: { groupId: string; groupType?: "group" | "channel" }): string {
  return inboxGroupToKind(item) === "channel" ? `channel:${item.groupId}` : `group:${item.groupId}`;
}

function mapInboxItemToSummary(
  item:
    | {
        kind: "direct";
        peerUserId: string;
        title: string;
        username?: string;
        lastMessagePreview: string;
        lastMessageAt: string;
        unread: number;
        important: boolean;
        muted: boolean;
      }
    | {
        kind: "group";
        groupId: string;
        title: string;
        lastMessagePreview: string;
        lastMessageAt: string;
        unread: number;
        important: boolean;
        muted: boolean;
        avatarImageUrl?: string | null;
        groupType?: "group" | "channel";
        communityId?: string | null;
        communityName?: string | null;
      },
): ChatSummary {
  if (item.kind === "direct") {
    return {
      id: `direct:${item.peerUserId}`,
      kind: "direct",
      title: item.title,
      avatarUrl: null,
      lastMessagePreview: item.lastMessagePreview ?? "",
      lastMessageAt: item.lastMessageAt || null,
      unreadCount: typeof item.unread === "number" ? item.unread : 0,
      isMuted: Boolean(item.muted),
      isPinned: Boolean(item.important),
    };
  }
  const kind = inboxGroupToKind(item);
  return {
    id: inboxGroupToId(item),
    kind,
    title: item.title,
    avatarUrl: item.avatarImageUrl ?? null,
    lastMessagePreview: item.lastMessagePreview ?? "",
    lastMessageAt: item.lastMessageAt || null,
    unreadCount: typeof item.unread === "number" ? item.unread : 0,
    isMuted: Boolean(item.muted),
    isPinned: Boolean(item.important),
    communityId: item.communityId ?? null,
    communityName: item.communityName ?? null,
  };
}

function mapApiInboxItem(
  it:
    | {
        kind: "direct";
        peerUserId: string;
        title: string;
        username?: string;
        lastMessagePreview: string;
        lastMessageAt: string;
        unread: number;
        important: boolean;
        muted: boolean;
      }
    | {
        kind: "group";
        groupId: string;
        title: string;
        lastMessagePreview: string;
        lastMessageAt: string;
        unread: number;
        important: boolean;
        muted: boolean;
        avatarImageUrl?: string | null;
        groupType?: "group" | "channel";
        communityId?: string | null;
        communityName?: string | null;
      },
): ChatSummary {
  if (it.kind === "direct") return mapInboxItemToSummary(it);
  const groupType = (it as { groupType?: "group" | "channel" }).groupType;
  const avatarImageUrl = (it as { avatarImageUrl?: string | null }).avatarImageUrl;
  const communityId = (it as { communityId?: string | null }).communityId;
  const communityName = (it as { communityName?: string | null }).communityName;
  return mapInboxItemToSummary({ ...it, groupType, avatarImageUrl, communityId, communityName });
}

/**
 * Как в Telegram: закреплённые сверху, затем по времени последнего сообщения (новые выше).
 * TODO: локальные пины без сервера (user prefs) при отдельном флаге isPinned с backend.
 */
export function sortChatSummariesTelegram(chats: ChatSummary[]): ChatSummary[] {
  return [...chats].sort((a, b) => {
    const ap = a.isPinned ? 1 : 0;
    const bp = b.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ta = a.lastMessageAt || "";
    const tb = b.lastMessageAt || "";
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return tb.localeCompare(ta);
  });
}

/**
 * Host hook: GET /api/chats/inbox → ChatSummary[].
 */
export function useCommunitoriaChats(): UseCommunitoriaChatsResult {
  const { accessToken } = useAuth();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async (opts?: { silent?: boolean }) => {
    const token = accessToken;
    if (!token) {
      setChats([]);
      setLoading(false);
      setError(null);
      return;
    }
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const r = await api.chats.inbox(token);
      const items = r.items ?? [];
      setChats(items.map((it) => mapApiInboxItem(it as Parameters<typeof mapApiInboxItem>[0])));
    } catch (e) {
      if (!silent) {
        setChats([]);
      }
      setError(e instanceof Error ? e : new Error("INBOX_FAILED"));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onRefresh = () => void refetch({ silent: true });
    window.addEventListener("edumed:chat-unread-refresh", onRefresh);
    return () => window.removeEventListener("edumed:chat-unread-refresh", onRefresh);
  }, [refetch]);

  useEffect(() => {
    const onPatch = (ev: Event) => {
      const ce = ev as CustomEvent<{ chatId: string; patch: Partial<ChatSummary> }>;
      const d = ce.detail;
      if (!d?.chatId) return;
      setChats((prev) =>
        prev.map((c) => (c.id === d.chatId ? { ...c, ...d.patch } : c)),
      );
    };
    window.addEventListener("edumed:chat-summary-patch", onPatch);
    return () => window.removeEventListener("edumed:chat-summary-patch", onPatch);
  }, []);

  /** Локальное обновление превью последнего сообщения после загрузки истории в Communitoria (inbox иногда без preview для групп). */
  useEffect(() => {
    const onPreview = (ev: Event) => {
      const ce = ev as CustomEvent<{ chatId: string; preview: string; at: string }>;
      const d = ce.detail;
      if (!d?.chatId || !d.at) return;
      setChats((prev) =>
        prev.map((c) =>
          c.id === d.chatId
            ? { ...c, lastMessagePreview: d.preview || c.lastMessagePreview, lastMessageAt: d.at || c.lastMessageAt }
            : c,
        ),
      );
    };
    window.addEventListener("edumed:chat-preview-update", onPreview);
    return () => window.removeEventListener("edumed:chat-preview-update", onPreview);
  }, []);

  return { chats, loading, error, refetch };
}

/** @deprecated используйте sortChatSummariesTelegram */
export const sortCommunitoriaChats = sortChatSummariesTelegram;
