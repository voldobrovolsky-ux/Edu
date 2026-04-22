import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./communitoria-motion.css";
import { useAuth } from "../state/auth";
import { CommunitoriaAssistantPane } from "./CommunitoriaAssistantPane";
import { CommunitoriaChatContextMenuHost, type CommunitoriaChatMenuState } from "./CommunitoriaChatContextMenu";
import { CommunitoriaChatList } from "./CommunitoriaChatList";
import { CommunitoriaFolderBar } from "./CommunitoriaFolderBar";
import { CommunitoriaMessagePane } from "./CommunitoriaMessagePane";
import { CommunitoriaCommunityScreen } from "./CommunitoriaCommunityScreen";
import { CommunitoriaToolPanel } from "./CommunitoriaToolPanel";
import type { CommunitoriaFolderId } from "./communitoriaFolders";
import { filterChatsForFolder } from "./communitoriaFolders";
import type { ChatKind, ChatSummary } from "./domain/chatTypes";
import { sortChatSummariesTelegram, useCommunitoriaChats } from "./data/useCommunitoriaChats";

type CenterMode = "idle" | "chat" | "assistant" | "community";

function syntheticSummary(id: string, kind: ChatKind): ChatSummary {
  const title =
    kind === "direct" ? "Диалог" : kind === "channel" ? "Канал" : "Группа";
  return {
    id,
    kind,
    title,
    lastMessagePreview: "",
    lastMessageAt: null,
    unreadCount: 0,
  };
}

/**
 * Communitoria: 30% инструменты | 50% диалог | 20% папки + список чатов.
 */
export function CommunitoriaModule() {
  const { accessToken } = useAuth();
  const { chats: rawChats, loading, error, refetch } = useCommunitoriaChats();
  const [chatCtxMenu, setChatCtxMenu] = useState<CommunitoriaChatMenuState>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [folder, setFolder] = useState<CommunitoriaFolderId>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [centerMode, setCenterMode] = useState<CenterMode>("idle");
  const [communityViewId, setCommunityViewId] = useState<string | null>(null);
  /** Навигация «назад к сообществу» при открытии группы с экрана сообщества. */
  const [communityReturn, setCommunityReturn] = useState<{ id: string; name: string } | null>(null);
  /** Пока чата нет в inbox (например выбор из хаба «Новый чат»), храним полный summary с заголовком. */
  const [pendingSynthetic, setPendingSynthetic] = useState<ChatSummary | null>(null);

  const sorted = useMemo(() => sortChatSummariesTelegram(rawChats), [rawChats]);
  const filtered = useMemo(() => filterChatsForFolder(sorted, folder), [sorted, folder]);

  const activeChat = useMemo((): ChatSummary | null => {
    if (!activeId) return null;
    const found = rawChats.find((c) => c.id === activeId);
    if (found) return found;
    if (pendingSynthetic && pendingSynthetic.id === activeId) return pendingSynthetic;
    if (activeId.startsWith("direct:")) return syntheticSummary(activeId, "direct");
    if (activeId.startsWith("channel:")) return syntheticSummary(activeId, "channel");
    if (activeId.startsWith("group:")) return syntheticSummary(activeId, "group");
    return null;
  }, [rawChats, activeId, pendingSynthetic]);

  const applySelection = useCallback(
    (chat: ChatSummary, fromCommunity: { id: string; name: string } | null = null) => {
      setCommunityReturn(fromCommunity);
      setCenterMode("chat");
      setActiveId(chat.id);
      const known = rawChats.some((c) => c.id === chat.id);
      setPendingSynthetic(known ? null : chat);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (chat.kind === "group" || chat.kind === "channel") {
          const gid = chat.id.split(":")[1] ?? "";
          if (gid) next.set("g", gid);
        } else {
          next.delete("g");
        }
        return next;
      }, { replace: true });
    },
    [rawChats, setSearchParams],
  );

  /** Убрать ?g=, чтобы эффект синхронизации URL не перебивал экран сообщества. */
  const clearGroupQueryParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        if (!prev.get("g")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("g");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const restoreGroupQueryForActiveChat = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!activeId || (!activeId.startsWith("group:") && !activeId.startsWith("channel:"))) {
          next.delete("g");
          return next;
        }
        const gid = activeId.split(":")[1] ?? "";
        if (gid) next.set("g", gid);
        return next;
      },
      { replace: true },
    );
  }, [activeId, setSearchParams]);

  useEffect(() => {
    const onDirect = (e: Event) => {
      const d = (e as CustomEvent<{ peerUserId: string; title?: string }>).detail;
      if (!d?.peerUserId) return;
      const id = `direct:${d.peerUserId}`;
      const base = syntheticSummary(id, "direct");
      applySelection({ ...base, title: d.title ?? base.title });
    };
    const onOpenGroup = (e: Event) => {
      const d = (e as CustomEvent<{ groupId: string; title?: string }>).detail;
      if (!d?.groupId) return;
      void refetch({ silent: true });
      const id = `group:${d.groupId}`;
      applySelection({
        id,
        kind: "group",
        title: d.title ?? "Группа",
        lastMessagePreview: "",
        lastMessageAt: null,
        unreadCount: 0,
      });
    };
    const onAssistant = () => setCenterMode("assistant");
    const onOpenCommunity = (e: Event) => {
      const d = (e as CustomEvent<{ communityId: string }>).detail;
      if (!d?.communityId) return;
      void refetch({ silent: true });
      setCommunityReturn(null);
      setCommunityViewId(d.communityId);
      setCenterMode("community");
      clearGroupQueryParam();
    };
    window.addEventListener("edumed:communitoria-start-direct", onDirect);
    window.addEventListener("edumed:communitoria-open-group", onOpenGroup);
    window.addEventListener("edumed:communitoria-open-assistant", onAssistant);
    window.addEventListener("edumed:communitoria-open-community", onOpenCommunity);
    return () => {
      window.removeEventListener("edumed:communitoria-start-direct", onDirect);
      window.removeEventListener("edumed:communitoria-open-group", onOpenGroup);
      window.removeEventListener("edumed:communitoria-open-assistant", onAssistant);
      window.removeEventListener("edumed:communitoria-open-community", onOpenCommunity);
    };
  }, [applySelection, refetch, clearGroupQueryParam]);

  useEffect(() => {
    if (!pendingSynthetic) return;
    if (rawChats.some((c) => c.id === pendingSynthetic.id)) {
      setPendingSynthetic(null);
    }
  }, [rawChats, pendingSynthetic]);

  useEffect(() => {
    const g = searchParams.get("g");
    if (!g) return;
    const match = rawChats.find(
      (c) => (c.kind === "group" || c.kind === "channel") && c.id.split(":")[1] === g,
    );
    if (match) {
      setCommunityReturn(null);
      setActiveId(match.id);
      setCenterMode("chat");
    } else if (!loading) {
      setCommunityReturn(null);
      setActiveId(`group:${g}`);
      setCenterMode("chat");
    }
  }, [searchParams, rawChats, loading]);

  useEffect(() => {
    if (!activeId) return;
    window.dispatchEvent(
      new CustomEvent("edumed:chat-summary-patch", {
        detail: { chatId: activeId, patch: { unreadCount: 0 } },
      }),
    );
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const inFolder = filtered.some((c) => c.id === activeId);
    const isPendingOnly = Boolean(pendingSynthetic && pendingSynthetic.id === activeId);
    if (!inFolder && !isPendingOnly) {
      setActiveId(null);
      setCenterMode("idle");
      setPendingSynthetic(null);
      setCommunityReturn(null);
    }
  }, [filtered, activeId, pendingSynthetic]);

  return (
    <>
    <CommunitoriaChatContextMenuHost
      token={accessToken}
      menu={chatCtxMenu}
      onClose={() => setChatCtxMenu(null)}
      onPatched={() => void refetch({ silent: true })}
    />
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 gap-4 overflow-hidden">
      <div className="flex min-h-0 min-w-[260px] max-w-[380px] basis-[30%] flex-col overflow-hidden">
        <CommunitoriaToolPanel />
      </div>

      <div className="flex min-h-0 min-w-[360px] basis-[50%] flex-col overflow-hidden">
        {centerMode === "assistant" ? (
          <CommunitoriaAssistantPane onClose={() => setCenterMode(activeId ? "chat" : "idle")} />
        ) : centerMode === "community" && communityViewId && accessToken ? (
          <CommunitoriaCommunityScreen
            communityId={communityViewId}
            token={accessToken}
            onBack={() => {
              setCommunityViewId(null);
              setCenterMode(activeId ? "chat" : "idle");
              if (activeId) restoreGroupQueryForActiveChat();
            }}
            onOpenGroup={(groupId, title, fromCommunity) => {
              setCommunityViewId(null);
              void refetch({ silent: true });
              applySelection(
                {
                  id: `group:${groupId}`,
                  kind: "group",
                  title,
                  lastMessagePreview: "",
                  lastMessageAt: null,
                  unreadCount: 0,
                },
                fromCommunity ?? null,
              );
            }}
          />
        ) : activeChat ? (
          <CommunitoriaMessagePane
            chat={activeChat}
            forwardTargetChats={sorted}
            communityReturn={communityReturn}
            onBackToCommunity={
              communityReturn
                ? () => {
                    const id = communityReturn.id;
                    setCommunityReturn(null);
                    void refetch({ silent: true });
                    setCommunityViewId(id);
                    setCenterMode("community");
                  }
                : undefined
            }
          />
        ) : (
          <div className="ed-panel communitoria-idle-center flex min-h-[320px] flex-1 flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
            <span className="mb-3 text-4xl opacity-90" aria-hidden>
              💬
            </span>
            <p className="text-base font-medium text-slate-800">Начните работу</p>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              Выберите чат справа или используйте инструменты слева, чтобы начать.
            </p>
          </div>
        )}
      </div>

      <div className="flex min-h-0 min-w-[220px] basis-[20%] flex-col overflow-hidden rounded-xl border border-slate-200 bg-[var(--ed-surface,#fff)] shadow-sm">
        <CommunitoriaFolderBar activeFolder={folder} onFolderChange={setFolder} />
        <CommunitoriaChatList
          chats={filtered}
          activeId={activeId}
          onSelect={applySelection}
          loading={loading}
          error={error}
          compact
          listTransitionKey={folder}
          onRowContextMenu={(e, chat) => setChatCtxMenu({ chat, x: e.clientX, y: e.clientY })}
        />
      </div>
    </div>
    </>
  );
}
