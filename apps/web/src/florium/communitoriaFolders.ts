import type { ChatSummary } from "./domain/chatTypes";

export type CommunitoriaFolderId = "all" | "classes" | "parents" | "teams" | "channels";

/**
 * Эвристики до появления явных тегов / ролей с backend.
 * TODO(backend): поля вроде audience: "parents" | "class" | "staff", groupPurpose, chatTags[].
 */

const ASSISTANT_TITLE_RE = /ассистент|edumed|edümed|бот|bot|ai\s*assistant/i;

/** Личный чат с ассистентом/ботом (не показывать в «Родители» как обычный диалог). */
export function isAssistantLikeDirect(chat: ChatSummary): boolean {
  if (chat.kind !== "direct") return false;
  return ASSISTANT_TITLE_RE.test(chat.title);
}

/** Чаты, похожие на классные (название / номер класса). */
export function isClassLikeChat(chat: ChatSummary): boolean {
  const t = chat.title;
  if (/\bкласс\b/i.test(t)) return true;
  if (/\b\d{1,2}\s*[«"']?[а-яa-zё]{1,3}[»"']?/i.test(t)) return true;
  if (/\b(5|6|7|8|9|10|11)\s*[-–]?\s*[а-яa-zё]{1,2}\b/i.test(t)) return true;
  return false;
}

/** Диалоги в зоне «родители» (по названию; без ассистента). */
export function isParentsAudienceDirect(chat: ChatSummary): boolean {
  if (chat.kind !== "direct") return false;
  if (isAssistantLikeDirect(chat)) return false;
  const t = chat.title.toLowerCase();
  if (/родител|род\.|семь|мама|папа|опекун|законн/.test(t)) return true;
  return false;
}

/** Группы «команды / администрация» — не классные группы. */
export function isTeamLikeGroup(chat: ChatSummary): boolean {
  if (chat.kind !== "group") return false;
  return !isClassLikeChat(chat);
}

/**
 * Фильтр папок Communitoria.
 * — Все: весь inbox.
 * — Классы: группы/каналы с классной семантикой в названии.
 * — Родители: личные чаты с эвристикой «родители», без ассистента.
 * — Команды: группы (не каналы), не классные по названию.
 * — Каналы: kind === channel.
 */
export function filterChatsForFolder(chats: ChatSummary[], folder: CommunitoriaFolderId): ChatSummary[] {
  switch (folder) {
    case "all":
      return chats;
    case "channels":
      return chats.filter((c) => c.kind === "channel");
    case "teams":
      return chats.filter((c) => isTeamLikeGroup(c));
    case "parents":
      return chats.filter((c) => isParentsAudienceDirect(c));
    case "classes":
      return chats.filter(
        (c) => (c.kind === "group" || c.kind === "channel") && isClassLikeChat(c),
      );
    default:
      return chats;
  }
}
