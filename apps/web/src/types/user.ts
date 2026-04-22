import type { PrimaryRole, SecondaryRole } from "./roles";

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
  showOnlineStatus: boolean;
  theme: "light" | "dark";
  fontSize: "normal" | "large";
  dateTimeFormat: "ru_ddmmyyyy_24" | "intl_ddmmyyyy_24";
};

export type User = {
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
  teacherCompensation?: {
    currentPcRate: number | null;
    rateHistory: Array<{ effectiveFrom: string; pcRate: number }>;
  } | null;
  teacherQuality?: {
    sourceCandidateId?: string | null;
    manualBranchCode?: string | null;
    manualBranchTitle?: string | null;
    interview: { discipline0to5: number | null; parents0to5: number | null };
    standards: {
      readiness0to10: number | null;
      observationAttitudeScore0to5: number | null;
      documentationExperienceScore0to5: number | null;
    };
    lessonObservations: Array<{ id: string; date: string; score0to5: number; comment?: string }>;
    diagnostics: Array<{ id: string; date: string; successPercent: number; comment?: string }>;
    qualityIndex?: number | null;
    qualityCalculatedAt?: string | null;
  } | null;
};
