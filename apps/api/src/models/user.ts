import type { PrimaryRole, SecondaryRole } from "../types/roles.js";

export type User = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  username: string;
  passwordHash: string;
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];

  // Заглушки связей (GENERAL DESCRIPTION: /auth/me возвращает полный объект,
  // включая классы/детей — пока пустыми массивами).
  classes: unknown[];
  children: unknown[];
};

export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(u: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

