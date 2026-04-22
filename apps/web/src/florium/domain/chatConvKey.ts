import type { ChatSummary } from "./chatTypes";

/** Ключ для `PATCH /api/chats/prefs` (совпадает с бэкендом messengerStore). */
export function chatSummaryToConvKey(chat: ChatSummary): string {
  if (chat.kind === "direct") return chat.id;
  const raw = chat.id.includes(":") ? (chat.id.split(":")[1] ?? "") : chat.id;
  return `group:${raw}`;
}
