import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import type { PrimaryRole, SecondaryRole } from "../types/roles.js";
import type { StoredUser, TeacherQualificationCategory, UserProfilePrefs } from "../types/user.js";

type CreateUserInput = {
  lastName: string;
  firstName: string;
  patronymic: string;
  username: string;
  passwordHash: string;
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "users.json");

/**
 * Bootstrap-админ для первого входа в систему.
 *
 * Login: `admin`
 * Password: `Admin123!`
 *
 * Этот пользователь нужен только как "точка входа" (bootstrap):
 * после настройки админов в UI пароль можно изменить или пользователя удалить;
 * при следующем запуске/инициализации (если пользователя нет) он будет создан заново.
 */
const BOOTSTRAP_USERNAME = "admin";
const BOOTSTRAP_PASSWORD = "Admin123!";
const BOOTSTRAP_PRIMARY_ROLE: PrimaryRole = "sysadmin";

/** Системный бот-ассистент: создаётся вместе с админом, не удаляется очисткой БД. */
export const SYSTEM_BOT_USERNAME = "system_bot";

function looksLikeBcryptHash(hash: string): boolean {
  // Пример: $2a$10$...
  return /^\$2[abyxy]\$\d{1,2}\$/.test(hash.trim());
}

function ensureDataFile(): void {
  const dir = dirname(DATA_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(DATA_PATH)) writeFileSync(DATA_PATH, "[]", "utf-8");
}

function ensureBootstrapUser(users: StoredUser[]): { users: StoredUser[]; changed: boolean } {
  let changed = false;

  const bootstrapNeedle = BOOTSTRAP_USERNAME.toLowerCase();
  const bootstrap = users.find((u) => u.username.toLowerCase() === bootstrapNeedle);

  if (!bootstrap) {
    const desiredPasswordHash = bcrypt.hashSync(BOOTSTRAP_PASSWORD, 10);
    users.push({
      id: randomUUID(),
      // Тестовые ФИО — при необходимости можно заменить через UI.
      lastName: "Тестов",
      firstName: "Админ",
      patronymic: "Александрович",
      username: BOOTSTRAP_USERNAME,
      passwordHash: desiredPasswordHash,
      primaryRole: BOOTSTRAP_PRIMARY_ROLE,
      secondaryRoles: [],
      createdAt: new Date().toISOString(),
    });
    changed = true;
  } else {
    // Не перетираем существующие изменения, если passwordHash выглядит валидно.
    if (!bootstrap.passwordHash || !looksLikeBcryptHash(bootstrap.passwordHash)) {
      bootstrap.passwordHash = bcrypt.hashSync(BOOTSTRAP_PASSWORD, 10);
      changed = true;
    }

    // Учётная запись bootstrap — всегда системный администратор.
    if (bootstrap.primaryRole !== "sysadmin") {
      bootstrap.primaryRole = BOOTSTRAP_PRIMARY_ROLE;
      bootstrap.secondaryRoles = [];
      changed = true;
    }
  }

  return { users, changed };
}

function ensureBootstrapBotUser(users: StoredUser[]): { users: StoredUser[]; changed: boolean } {
  let changed = false;
  const needle = SYSTEM_BOT_USERNAME.toLowerCase();
  const existing = users.find((u) => u.username.toLowerCase() === needle);
  if (!existing) {
    users.push({
      id: randomUUID(),
      lastName: "Ассистент",
      firstName: "EduMed",
      patronymic: "Системный",
      username: SYSTEM_BOT_USERNAME,
      passwordHash: bcrypt.hashSync(randomBytes(32).toString("hex"), 10),
      primaryRole: "bot",
      secondaryRoles: [],
      createdAt: new Date().toISOString(),
    });
    changed = true;
  } else if (existing.primaryRole !== "bot") {
    existing.primaryRole = "bot";
    existing.secondaryRoles = [];
    changed = true;
  }
  return { users, changed };
}

function load(): StoredUser[] {
  ensureDataFile();
  try {
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    let users = Array.isArray(parsed) ? (parsed as StoredUser[]) : [];

    const ensuredAdmin = ensureBootstrapUser(users);
    users = ensuredAdmin.users;
    const ensuredBot = ensureBootstrapBotUser(users);
    users = ensuredBot.users;
    if (ensuredAdmin.changed || ensuredBot.changed) save(users);
    return users;
  } catch {
    let users: StoredUser[] = [];
    const ensuredAdmin = ensureBootstrapUser(users);
    users = ensuredAdmin.users;
    const ensuredBot = ensureBootstrapBotUser(users);
    users = ensuredBot.users;
    if (ensuredAdmin.changed || ensuredBot.changed) save(users);
    return users;
  }
}

function save(users: StoredUser[]): void {
  ensureDataFile();
  writeFileSync(DATA_PATH, JSON.stringify(users, null, 2), "utf-8");
}

class FileUserStore {
  private cache: StoredUser[] | null = null;

  private getAll(): StoredUser[] {
    if (!this.cache) this.cache = load();
    return this.cache;
  }

  list(): StoredUser[] {
    return [...this.getAll()];
  }

  create(input: CreateUserInput): StoredUser {
    const id = randomUUID();
    const user: StoredUser = {
      id,
      lastName: input.lastName,
      firstName: input.firstName,
      patronymic: input.patronymic,
      username: input.username,
      passwordHash: input.passwordHash,
      primaryRole: input.primaryRole,
      secondaryRoles: input.secondaryRoles,
      createdAt: new Date().toISOString(),
    };
    const users = this.getAll();
    users.push(user);
    this.cache = users;
    save(users);
    return user;
  }

  findById(id: string): StoredUser | undefined {
    return this.getAll().find((u) => u.id === id);
  }

  findByUsername(username: string): StoredUser | undefined {
    const needle = username.toLowerCase();
    return this.getAll().find((u) => u.username.toLowerCase() === needle);
  }

  updateRolesById(
    id: string,
    roles: {
      primaryRole: PrimaryRole;
      secondaryRoles: SecondaryRole[];
    },
  ): StoredUser | undefined {
    const users = this.getAll();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return undefined;
    const next: StoredUser = { ...users[idx]!, primaryRole: roles.primaryRole, secondaryRoles: roles.secondaryRoles };
    users[idx] = next;
    this.cache = users;
    save(users);
    return next;
  }

  /**
   * Полная перезапись пользователей одним bootstrap-админом (`admin` / `Admin123!`).
   * Используется при очистке базы.
   */
  resetToBootstrapOnly(): void {
    const users: StoredUser[] = [];
    const ensuredAdmin = ensureBootstrapUser(users);
    const ensuredBot = ensureBootstrapBotUser(ensuredAdmin.users);
    this.cache = ensuredBot.users;
    save(ensuredBot.users);
  }

  /** Пользователь системного бота (личные сообщения ассистента). */
  findSystemBot(): StoredUser | undefined {
    return this.findByUsername(SYSTEM_BOT_USERNAME);
  }

  invalidateCache(): void {
    this.cache = null;
  }

  updateById(
    id: string,
    patch: {
      lastName?: string;
      firstName?: string;
      patronymic?: string;
      username?: string;
      primaryRole?: PrimaryRole;
      secondaryRoles?: SecondaryRole[];
      passwordHash?: string;
      avatarFileName?: string | null;
      email?: string | null;
      phone?: string | null;
      locale?: "ru" | "en";
      timezone?: string;
      profilePrefs?: UserProfilePrefs;
      homeroomGrade?: number | null;
      homeroomGroupNumber?: number | null;
      pedagogicalExperienceYears?: number | null;
      teacherQualificationCategory?: TeacherQualificationCategory | null;
      teacherCompensation?: StoredUser["teacherCompensation"];
      teacherQuality?: StoredUser["teacherQuality"];
    },
  ): StoredUser | undefined {
    const users = this.getAll();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return undefined;
    const prev = users[idx]!;
    const next: StoredUser = {
      ...prev,
      lastName: patch.lastName ?? prev.lastName,
      firstName: patch.firstName ?? prev.firstName,
      patronymic: patch.patronymic ?? prev.patronymic,
      username: patch.username ?? prev.username,
      primaryRole: patch.primaryRole ?? prev.primaryRole,
      secondaryRoles: patch.secondaryRoles ?? prev.secondaryRoles,
      passwordHash: patch.passwordHash ?? prev.passwordHash,
      avatarFileName: patch.avatarFileName !== undefined ? patch.avatarFileName : prev.avatarFileName,
      email: patch.email !== undefined ? (patch.email ?? "") : prev.email,
      phone: patch.phone !== undefined ? (patch.phone ?? "") : prev.phone,
      locale: patch.locale !== undefined ? patch.locale : prev.locale,
      timezone: patch.timezone !== undefined ? patch.timezone : prev.timezone,
      profilePrefs: patch.profilePrefs !== undefined ? patch.profilePrefs : prev.profilePrefs,
      homeroomGrade: patch.homeroomGrade !== undefined ? patch.homeroomGrade : prev.homeroomGrade,
      homeroomGroupNumber:
        patch.homeroomGroupNumber !== undefined ? patch.homeroomGroupNumber : prev.homeroomGroupNumber,
      pedagogicalExperienceYears:
        patch.pedagogicalExperienceYears !== undefined
          ? patch.pedagogicalExperienceYears
          : prev.pedagogicalExperienceYears,
      teacherQualificationCategory:
        patch.teacherQualificationCategory !== undefined
          ? patch.teacherQualificationCategory
          : prev.teacherQualificationCategory,
      teacherCompensation: patch.teacherCompensation !== undefined ? patch.teacherCompensation : prev.teacherCompensation,
      teacherQuality: patch.teacherQuality !== undefined ? patch.teacherQuality : prev.teacherQuality,
    };
    users[idx] = next;
    this.cache = users;
    save(users);
    return next;
  }

  deleteById(id: string): StoredUser | undefined {
    const users = this.getAll();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return undefined;
    const removed = users[idx]!;
    users.splice(idx, 1);
    this.cache = users;
    save(users);
    return removed;
  }
}

export const userStore = new FileUserStore();
