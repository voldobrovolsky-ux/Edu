import { defaultProfilePrefs, type UserProfilePrefs } from "../types/user.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  const t = s.trim();
  return t.length <= 320 && EMAIL_RE.test(t);
}

/** Допускаем пустую строку, +7 и цифры, произвольную длину для международных форматов */
export function isValidPhone(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.length > 40) return false;
  return /^[+0-9()\s\-]+$/.test(t);
}

export function mergeProfilePrefs(
  prev: Partial<UserProfilePrefs> | undefined,
  patch: Partial<UserProfilePrefs> | undefined,
): UserProfilePrefs {
  const base = defaultProfilePrefs(prev);
  if (!patch) return base;
  return defaultProfilePrefs({ ...base, ...patch });
}
