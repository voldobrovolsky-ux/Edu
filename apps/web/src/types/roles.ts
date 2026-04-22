export const PRIMARY_ROLES = [
  "director",
  "head_teacher",
  "teacher",
  "parent",
  "student",
  "sysadmin",
  "bot",
] as const;

export type PrimaryRole = (typeof PRIMARY_ROLES)[number];

export const SECONDARY_ROLES = ["teacher", "parent"] as const;
export type SecondaryRole = (typeof SECONDARY_ROLES)[number];

