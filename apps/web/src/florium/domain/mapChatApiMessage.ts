import type { ChatApiMessage } from "../../lib/api";
import type { ChatMessage, MessageAuthorKind, MessageStatus } from "./chatTypes";

function reactionsFromApi(raw: unknown, myId: string): ChatMessage["reactions"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: NonNullable<ChatMessage["reactions"]> = [];
  for (const [emoji, arr] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    const userIds = arr.filter((x): x is string => typeof x === "string");
    if (userIds.length === 0) continue;
    out.push({
      emoji,
      count: userIds.length,
      reactedByMe: userIds.includes(myId),
    });
  }
  return out.length ? out : undefined;
}

function mapDeliveryToStatus(m: ChatApiMessage, authorKind: MessageAuthorKind): MessageStatus | undefined {
  if (authorKind !== "me") return undefined;
  const ds = String(m.deliveryStatus ?? "").toLowerCase();
  // TODO(backend): единый enum + различение delivered vs read; при отсутствии полей — консервативно «sent» (одна серая галочка).
  if (m.isRead || ds === "read") return "read";
  if (ds === "delivered") return "delivered";
  return "sent";
}

/**
 * Маппинг ответа API → ChatMessage.
 * TODO(backend): явные поля sending/failed и единый enum статуса исходящих.
 */
export function mapChatApiMessageToChatMessage(
  m: ChatApiMessage,
  ctx: {
    chatId: string;
    myId: string;
    authorLabel: (userId: string) => string;
    botUserIds?: Set<string>;
  },
): ChatMessage {
  const kind = String(m.kind ?? "text");
  const fromId = String(m.fromUserId ?? m.senderUserId ?? "");
  const deletedForAll = Boolean(m.deletedForAll);
  const isSystem = kind === "system" || kind === "service";
  let authorKind: MessageAuthorKind = "other";
  if (isSystem) authorKind = "system";
  else if (fromId === ctx.myId) authorKind = "me";
  else if (fromId && ctx.botUserIds?.has(fromId)) authorKind = "bot";

  let text = String(m.text ?? "").trim();
  if (kind === "poll" && m.poll && typeof m.poll === "object") {
    const q = String((m.poll as { question?: string }).question ?? "");
    text = text || `📊 ${q || "Опрос"}`;
  }
  const atts = m.attachments as { fileName?: string }[] | undefined;
  if (Array.isArray(atts) && atts.length > 0) {
    const names = atts.map((a) => a.fileName).filter(Boolean).join(", ");
    if (names) text = text ? `${text}\n📎 ${names}` : `📎 ${names}`;
  }

  let isReplyToMessageId: string | undefined;
  let replyToSnippet: string | undefined;
  if (m.replyTo && typeof m.replyTo === "object") {
    const rt = m.replyTo as { messageId?: string; text?: string; textPreview?: string; snippet?: string };
    if (rt.messageId != null) isReplyToMessageId = String(rt.messageId);
    const sn = rt.textPreview ?? rt.snippet ?? rt.text;
    if (sn != null && String(sn).trim()) {
      const s = String(sn).trim().replace(/\s+/g, " ");
      replyToSnippet = s.length > 120 ? `${s.slice(0, 117)}…` : s;
    }
  }

  const modVisible = Boolean(m.modVisible);
  return {
    id: String(m.id),
    chatId: ctx.chatId,
    authorId: fromId || "system",
    authorDisplayName:
      authorKind === "system" || authorKind === "me"
        ? authorKind === "me"
          ? "Вы"
          : "Система"
        : ctx.authorLabel(fromId),
    authorKind,
    text: deletedForAll && !modVisible ? "" : text,
    createdAt: String(m.createdAt ?? new Date().toISOString()),
    editedAt: (m as { editedAt?: string }).editedAt != null ? String((m as { editedAt?: string }).editedAt) : undefined,
    status: mapDeliveryToStatus(m, authorKind),
    isReplyToMessageId,
    replyToSnippet,
    isService: isSystem,
    reactions: reactionsFromApi(m.reactions, ctx.myId),
    deletedForAll,
    modVisible,
  };
}
