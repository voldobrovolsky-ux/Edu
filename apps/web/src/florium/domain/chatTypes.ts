/**
 * Доменная модель мессенджера Communitoria (ориентир — Telegram UX, не протокол).
 * Расширять можно; поля интерфейсов не сокращать без согласования.
 */

export type ChatKind = "direct" | "group" | "channel";

export interface ChatSummary {
  id: string;
  kind: ChatKind;
  title: string;
  /** TODO: заполнять из профиля / inbox, когда API отдаёт URL аватара для direct. */
  avatarUrl?: string | null;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  unreadCount: number;
  isMuted?: boolean;
  /**
   * Сейчас маппится с inbox `important`.
   * TODO(backend): отдельное поле isPinned, если семантика отличается от «важного».
   */
  isPinned?: boolean;
  /** Если группа входит в сообщество Communitoria */
  communityId?: string | null;
  communityName?: string | null;
}

export type MessageAuthorKind = "me" | "other" | "system" | "bot";

/** Для исходящих; соответствие полям delivery backend — см. TODO в маппере. */
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMessage {
  id: string;
  chatId: string;
  authorId: string;
  authorDisplayName: string;
  authorKind: MessageAuthorKind;
  text: string;
  createdAt: string;
  editedAt?: string;
  /** Только для authorKind === "me"; для оптимистичных отправок. */
  status?: MessageStatus;
  isReplyToMessageId?: string;
  /** Текст цитируемого сообщения, если API отдал вложенный replyTo (иначе ищем в ленте по id). */
  replyToSnippet?: string;
  isService?: boolean;
  reactions?: Array<{
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }>;
  /** Сообщение удалено у всех (показ «пустышки»). */
  deletedForAll?: boolean;
  /** Видно модератору как удалённое. */
  modVisible?: boolean;
}
