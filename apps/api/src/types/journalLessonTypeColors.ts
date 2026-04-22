export const JOURNAL_LESSON_TYPE_COLOR_KEYS = [
  "light_blue",
  "light_green",
  "light_yellow",
  "light_orange",
  "light_pink",
  "light_purple",
  "neutral_blue_gray",
] as const;

export type JournalLessonTypeColorKey = (typeof JOURNAL_LESSON_TYPE_COLOR_KEYS)[number];

/** Светлые тона для заливки колонок журнала */
export const JOURNAL_LESSON_TYPE_COLOR_HEX: Record<JournalLessonTypeColorKey, string> = {
  light_blue: "#e0f2fe",
  light_green: "#dcfce7",
  light_yellow: "#fef9c3",
  light_orange: "#ffedd5",
  light_pink: "#fce7f3",
  light_purple: "#ede9fe",
  neutral_blue_gray: "#e2e8f0",
};

export function isJournalLessonTypeColorKey(v: string): v is JournalLessonTypeColorKey {
  return (JOURNAL_LESSON_TYPE_COLOR_KEYS as readonly string[]).includes(v);
}
