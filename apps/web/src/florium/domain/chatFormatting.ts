import { createElement, type ReactNode } from "react";

/** Время в списке чатов (как в мессенджерах: сегодня — часы, иначе дата). */
export function formatChatListTime(iso: string | null, locale = "ru-RU"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

export function formatMessageTime(iso: string, locale = "ru-RU"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Ключ календарного дня для группировки сообщений (локальная дата). */
export function calendarDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Подпись разделителя даты: «Сегодня», «Вчера» или 29 марта. */
export function formatDateSeparatorLabel(iso: string, locale = "ru-RU"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sd = startOfLocalDay(d);
  const sNow = startOfLocalDay(now);
  const diffDays = Math.round((sNow.getTime() - sd.getTime()) / 86_400_000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long" });
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/gi;

/**
 * Оборачивает http(s) URL в ссылки. Остальной текст — как есть (совместимо с whitespace-pre-wrap).
 */
export function autoLinkText(text: string, linkClassName: string): ReactNode {
  if (!text) return null;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_IN_TEXT_RE.source, URL_IN_TEXT_RE.flags);
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const href = m[0];
    nodes.push(
      createElement(
        "a",
        {
          key: `u-${m.index}-${href.length}`,
          href,
          target: "_blank",
          rel: "noopener noreferrer",
          className: linkClassName,
        },
        href,
      ),
    );
    last = m.index + href.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  if (nodes.length === 0) return text;
  if (nodes.length === 1) return nodes[0];
  return createElement("span", { className: "inline" }, ...nodes);
}
