import fs from "fs";
import path from "path";
import type { PrismaClient } from "@/generated/prisma";
import { toTitleCaseRu } from "@/lib/format-name";

/**
 * Пользователи основного EDUMED хранятся в JSON (`StoredUser`), не в Prisma payroll.
 * Синхронизация создаёт/обновляет строки `Person`, привязанные к `systemUserId` = `StoredUser.id`.
 */

type StoredUserJson = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  username: string;
  primaryRole: string;
  secondaryRoles: string[];
  email?: string;
  phone?: string;
};

function resolveUsersJsonPath(): string | null {
  const env = process.env.EDUMED_USERS_JSON_PATH?.trim();
  if (env && fs.existsSync(env)) return env;
  const fromPayroll = path.resolve(process.cwd(), "..", "api", "data", "users.json");
  if (fs.existsSync(fromPayroll)) return fromPayroll;
  const fromRepoRoot = path.resolve(process.cwd(), "apps", "api", "data", "users.json");
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;
  return null;
}

function fullName(u: StoredUserJson): string {
  return [u.lastName, u.firstName, u.patronymic].filter(Boolean).join(" ").trim();
}

/** Кадры, которым имеет смысл завести карточку в бухгалтерском модуле. */
function isStaffForPayroll(u: StoredUserJson): boolean {
  if (u.primaryRole === "bot") return false;
  const primaryStaff = ["director", "head_teacher", "teacher", "sysadmin"];
  if (primaryStaff.includes(u.primaryRole)) return true;
  return u.secondaryRoles?.includes("teacher") ?? false;
}

/** Кто может получать строки «учебные часы» по умолчанию. */
function canReceiveHourEntriesDefault(u: StoredUserJson): boolean {
  if (u.primaryRole === "teacher" || u.primaryRole === "head_teacher" || u.primaryRole === "director") return true;
  return u.secondaryRoles?.includes("teacher") ?? false;
}

export type SyncEdumedUsersResult = {
  ok: boolean;
  /** Сколько учёток из users.json обработано (upsert). */
  upserted: number;
  /** Путь к файлу или причина пропуска. */
  detail: string;
};

/**
 * Идемпотентно: безопасно вызывать при загрузке страниц «Люди» / «Часы».
 * Не трогает карточки без systemUserId (кандидаты, созданные вручную в payroll).
 */
export async function syncEdumedStaffIntoPersonTable(prisma: PrismaClient): Promise<SyncEdumedUsersResult> {
  const jsonPath = resolveUsersJsonPath();
  if (!jsonPath) {
    return {
      ok: false,
      upserted: 0,
      detail: "Файл users.json не найден (задайте EDUMED_USERS_JSON_PATH или запускайте из монорепо рядом с apps/api).",
    };
  }

  let users: StoredUserJson[];
  try {
    users = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as StoredUserJson[];
  } catch {
    return { ok: false, upserted: 0, detail: `Не удалось прочитать ${jsonPath}` };
  }

  const pk0 = await prisma.pKLevel.findFirst({ orderBy: { sortOrder: "asc" } });
  const pr1 = await prisma.pRLevel.findFirst({ orderBy: { sortOrder: "asc" } });
  const op1 = await prisma.oPLevel.findFirst({ orderBy: { sortOrder: "asc" } });
  const ocNone = await prisma.categoryOfficial.findFirst({ where: { code: "none" } });
  const icNo = await prisma.categoryInternal.findFirst({ where: { code: "no_category" } });
  if (!pk0 || !pr1 || !op1 || !ocNone || !icNo) {
    return {
      ok: false,
      upserted: 0,
      detail: "Справочники payroll не заполнены (сначала npm run db:seed).",
    };
  }

  let upserted = 0;
  for (const u of users) {
    if (!isStaffForPayroll(u)) continue;
    const name = toTitleCaseRu(fullName(u));
    if (!name) continue;
    const hourOk = canReceiveHourEntriesDefault(u);

    await prisma.person.upsert({
      where: { systemUserId: u.id },
      create: {
        systemUserId: u.id,
        systemUsername: u.username,
        fullName: name,
        email: u.email?.trim() || null,
        phone: u.phone?.trim() || null,
        status: "active",
        employmentType: "no_labor_contract",
        workFormat: "staff",
        officialCategoryId: ocNone.id,
        internalCategoryId: icNo.id,
        currentPKLevelId: pk0.id,
        prLevelId: pr1.id,
        opLevelId: op1.id,
        isVisibleInAccounting: true,
        canReceiveHourEntries: hourOk,
        notes: "Синхронизация из EDUMED (users.json)",
      },
      update: {
        fullName: name,
        email: u.email?.trim() || null,
        phone: u.phone?.trim() || null,
        systemUsername: u.username,
        canReceiveHourEntries: hourOk,
      },
    });
    upserted++;
  }

  return { ok: true, upserted, detail: jsonPath };
}
