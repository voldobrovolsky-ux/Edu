import type { PrimaryRole, SecondaryRole } from "./roles.js";
import type { TeacherCompensationProfile, TeacherQualityProfile } from "./analytics.js";

/** Категория педагога (приказные данные). */
export type TeacherQualificationCategory = "highest" | "first" | "second" | "none";

export const TEACHER_QUALIFICATION_LABELS: Record<TeacherQualificationCategory, string> = {
  highest: "высшая",
  first: "первая",
  second: "вторая",
  none: "без категории",
};

export type UserProfilePrefs = {
  botNotifications: boolean;
  chatNotificationsDefault: boolean;
  /** Разрешить добавлять себя в группы без пригласительной ссылки (прямое добавление). */
  allowDirectGroupAdd: boolean;
  showOnlineStatus: boolean;
  theme: "light" | "dark";
  fontSize: "normal" | "large";
  dateTimeFormat: "ru_ddmmyyyy_24" | "intl_ddmmyyyy_24";
};

export interface StoredUser {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  username: string;
  passwordHash: string;
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];
  createdAt: string;
  /** Имя файла в каталоге profile-files/avatars */
  avatarFileName?: string | null;
  email?: string;
  phone?: string;
  locale?: "ru" | "en";
  timezone?: string;
  profilePrefs?: Partial<UserProfilePrefs>;
  /** Классное руководство: параллель. */
  homeroomGrade?: number | null;
  homeroomGroupNumber?: number | null;
  pedagogicalExperienceYears?: number | null;
  teacherQualificationCategory?: TeacherQualificationCategory | null;
  teacherCompensation?: TeacherCompensationProfile | null;
  teacherQuality?: TeacherQualityProfile | null;
}

/** Публичный пользователь для API (без пароля) */
export interface PublicUser {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  username: string;
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];
  classes: unknown[];
  children: unknown[];
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  locale: "ru" | "en";
  timezone: string;
  profilePrefs: UserProfilePrefs;
  homeroomGrade?: number | null;
  homeroomGroupNumber?: number | null;
  pedagogicalExperienceYears?: number | null;
  teacherQualificationCategory?: TeacherQualificationCategory | null;
  teacherCompensation?: TeacherCompensationProfile | null;
  teacherQuality?: TeacherQualityProfile | null;
}

export function publicAvatarUrl(avatarFileName: string | null | undefined): string | null {
  if (!avatarFileName?.trim()) return null;
  return `/profile-files/avatars/${encodeURIComponent(avatarFileName.trim())}`;
}

export function defaultProfilePrefs(p?: Partial<UserProfilePrefs>): UserProfilePrefs {
  return {
    botNotifications: p?.botNotifications ?? true,
    chatNotificationsDefault: p?.chatNotificationsDefault ?? true,
    allowDirectGroupAdd: p?.allowDirectGroupAdd ?? true,
    showOnlineStatus: p?.showOnlineStatus ?? true,
    theme: p?.theme === "dark" ? "dark" : "light",
    fontSize: p?.fontSize === "large" ? "large" : "normal",
    dateTimeFormat:
      p?.dateTimeFormat === "intl_ddmmyyyy_24" ? "intl_ddmmyyyy_24" : "ru_ddmmyyyy_24",
  };
}

export function toPublicUser(u: StoredUser): PublicUser {
  const avatarFileName = u.avatarFileName ?? null;
  return {
    id: u.id,
    lastName: u.lastName,
    firstName: u.firstName,
    patronymic: u.patronymic,
    username: u.username,
    primaryRole: u.primaryRole,
    secondaryRoles: [...u.secondaryRoles],
    classes: [],
    children: [],
    avatarUrl: publicAvatarUrl(avatarFileName),
    email: typeof u.email === "string" ? u.email : null,
    phone: typeof u.phone === "string" ? u.phone : null,
    locale: u.locale === "en" ? "en" : "ru",
    timezone: typeof u.timezone === "string" && u.timezone.trim() ? u.timezone.trim() : "Europe/Moscow",
    profilePrefs: defaultProfilePrefs(u.profilePrefs),
    homeroomGrade: typeof u.homeroomGrade === "number" && Number.isFinite(u.homeroomGrade) ? u.homeroomGrade : null,
    homeroomGroupNumber:
      typeof u.homeroomGroupNumber === "number" && Number.isInteger(u.homeroomGroupNumber) ? u.homeroomGroupNumber : null,
    pedagogicalExperienceYears:
      typeof u.pedagogicalExperienceYears === "number" && Number.isFinite(u.pedagogicalExperienceYears)
        ? u.pedagogicalExperienceYears
        : null,
    teacherQualificationCategory:
      u.teacherQualificationCategory === "highest" ||
      u.teacherQualificationCategory === "first" ||
      u.teacherQualificationCategory === "second" ||
      u.teacherQualificationCategory === "none"
        ? u.teacherQualificationCategory
        : null,
    teacherCompensation: u.teacherCompensation ?? null,
    teacherQuality: u.teacherQuality ?? null,
  };
}
