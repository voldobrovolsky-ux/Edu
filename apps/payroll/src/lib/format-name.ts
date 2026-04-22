/** Нормализация ФИО для отображения: каждое слово с заглавной буквы. */
export function toTitleCaseRu(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => {
      if (!w.length) return w;
      const first = w[0].toLocaleUpperCase("ru-RU");
      const rest = w.slice(1).toLocaleLowerCase("ru-RU");
      return first + rest;
    })
    .join(" ");
}
