import { useEffect, useState } from "react";

export type FmailMailbox = "inbox" | "sent" | "drafts" | "archive" | "spam" | "trash";

export type FmailBinding = {
  type: "lesson" | "class" | "event" | "journalDecision" | string;
  refId: string;
};

export type FmailLabelId = string;

export interface FmailAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface FmailMessage {
  id: string;
  mailbox: FmailMailbox;
  subject: string;
  from: string;
  to: string[];
  snippet: string;
  body: string;
  attachments: FmailAttachment[];
  isUnread: boolean;
  isPinned: boolean;
  labels: FmailLabelId[];
  bindings: FmailBinding[];
  status: "pending" | "completed" | "unread";
  createdAt: string;
}

export interface UseFmailMessagesResult {
  messages: FmailMessage[];
  loading: boolean;
  error: Error | null;
}

// TODO: Replace mock with GET /api/fmail/messages (or host confirmation channel) when the backend exposes it.

const MOCK_MESSAGES: FmailMessage[] = [
  {
    id: "vault",
    mailbox: "inbox",
    subject: "Vault access confirmation",
    from: "System Bot <noreply@edumed.local>",
    to: ["admin@edumed.local"],
    snippet: "Ваш доступ к Vault подтвержден. Дальнейшие шаги — внутри письма.",
    body: "Ваш доступ к Vault подтвержден.\n\nДальнейшие шаги:\n1) Откройте подтверждающую страницу.\n2) Проверьте настройки доступа.\n\nСпасибо!",
    attachments: [],
    isUnread: true,
    isPinned: true,
    labels: ["important"],
    bindings: [],
    status: "unread",
    createdAt: new Date().toISOString(),
  },
  {
    id: "device",
    mailbox: "inbox",
    subject: "Device pairing approval",
    from: "Security <security@edumed.local>",
    to: ["user@edumed.local"],
    snippet: "Запрос на сопряжение устройства одобрен. Можно продолжать работу.",
    body: "Запрос на сопряжение устройства одобрен.\n\nМожно продолжать работу.\n\n— Security",
    attachments: [{ id: "att1", name: "pairing-details.txt", mimeType: "text/plain", sizeBytes: 1840 }],
    isUnread: false,
    isPinned: false,
    labels: [],
    bindings: [{ type: "class", refId: "class-5a" }],
    status: "completed",
    createdAt: new Date().toISOString(),
  },
  {
    id: "drop",
    mailbox: "inbox",
    subject: "Private document drop",
    from: "Flörium <no-reply@florium.local>",
    to: ["teacher@edumed.local"],
    snippet: "В папке появилось новое вложение. Проверьте содержимое.",
    body: "В папке появилось новое вложение.\n\nНажмите «Открыть», чтобы посмотреть содержимое.\n\nПримечание: это письмо — подтверждение внутри Flörium.",
    attachments: [{ id: "att2", name: "document-preview.pdf", mimeType: "application/pdf" }],
    isUnread: true,
    isPinned: false,
    labels: ["projects"],
    bindings: [{ type: "lesson", refId: "timetable-lesson-12" }],
    status: "unread",
    createdAt: new Date().toISOString(),
  },
  {
    id: "sent-1",
    mailbox: "sent",
    subject: "Draft submitted",
    from: "Вы <user@edumed.local>",
    to: ["support@edumed.local"],
    snippet: "Черновик отправлен в поддержку. Ожидайте подтверждения.",
    body: "Черновик отправлен в поддержку.\n\nОжидайте подтверждения. Спасибо!",
    attachments: [],
    isUnread: false,
    isPinned: false,
    labels: [],
    bindings: [],
    status: "completed",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "draft-1",
    mailbox: "drafts",
    subject: "Reminder: missing documents",
    from: "Вы <user@edumed.local>",
    to: ["parent@edumed.local"],
    snippet: "Подготовлю напоминание о недостающих документах.",
    body: "Подготовлю напоминание о недостающих документах.\n\n(Черновик — пока не отправлено.)",
    attachments: [],
    isUnread: false,
    isPinned: false,
    labels: ["class-5a"],
    bindings: [],
    status: "pending",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: "arch-1",
    mailbox: "archive",
    subject: "Read confirmation",
    from: "System Bot <noreply@edumed.local>",
    to: ["user@edumed.local"],
    snippet: "Подтверждение о прочтении успешно доставлено.",
    body: "Подтверждение о прочтении успешно доставлено.\n\nСтатус обновлен.",
    attachments: [],
    isUnread: false,
    isPinned: false,
    labels: ["important"],
    bindings: [],
    status: "completed",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
  {
    id: "spam-1",
    mailbox: "spam",
    subject: "Suspicious notification (mock)",
    from: "Unknown <unknown@spam.local>",
    to: ["user@edumed.local"],
    snippet: "Это письмо помечено как спам. Игнорируйте, если это ошибка.",
    body: "Это письмо помечено как спам.\n\nИгнорируйте, если это ошибка.",
    attachments: [],
    isUnread: true,
    isPinned: false,
    labels: [],
    bindings: [],
    status: "unread",
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];

export function useFmailMessages(): UseFmailMessagesResult {
  const [messages, setMessages] = useState<FmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = window.setTimeout(() => {
      if (!cancelled) {
        setMessages(MOCK_MESSAGES);
        setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  return { messages, loading, error };
}
