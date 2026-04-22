/**
 * Сайдбар слушает эти события для бейджей Fmail / Rivi.
 * Не вызывайте положительный счёт из мок-данных при монтировании модулей — бейдж «загорается» от открытия вкладки.
 * Положительный `dispatch…` — только когда с хоста пришли новые письма/события (poll, WebSocket, push).
 * При открытии модуля Fmail/Rivi хост сбрасывает счёт через `dispatch…(0)`.
 */

export const FLORIUM_FMAIL_BADGE_EVENT = "edumed:florium-fmail-badge";
export const FLORIUM_RIVI_BADGE_EVENT = "edumed:florium-rivi-badge";

export function dispatchFloriumFmailBadgeCount(count: number): void {
  if (typeof window === "undefined") return;
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  window.dispatchEvent(new CustomEvent(FLORIUM_FMAIL_BADGE_EVENT, { detail: n }));
}

export function dispatchFloriumRiviBadgeCount(count: number): void {
  if (typeof window === "undefined") return;
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  window.dispatchEvent(new CustomEvent(FLORIUM_RIVI_BADGE_EVENT, { detail: n }));
}
