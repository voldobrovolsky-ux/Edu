/** Преобразование сообщений редиректа с ошибкой учёта часов в текст для пользователя (без JSON/Zod). */

const KNOWN: Record<string, string> = {
  "Период финализирован. Редактирование заблокировано.":
    "Период уже закрыт бухгалтерским расчётом. Изменить часы или замены нельзя.",
};

export function sanitizeHoursPageError(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (t.length > 280 && (t.includes("{") || t.includes("["))) {
    return "Не удалось выполнить действие. Проверьте поля формы и повторите попытку.";
  }
  return KNOWN[t] ?? t;
}
