import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { isPrimaryRole } from "../types/roles.js";
import { userStore } from "../store/userStore.js";
import { signAccessToken } from "../auth/jwt.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { toPublicUser, type UserProfilePrefs } from "../types/user.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { classStore } from "../store/classStore.js";
import { resolveClassGroup } from "../services/schoolStructure.js";
import { makeStudentCode } from "../utils/codes.js";
import { ensureWelcomeDirectChatWithBot } from "../services/systemBotWelcome.js";
import { officeConfig } from "../config/office.js";
import { getProfileFilesRoot } from "../store/profileFilesRoot.js";
import { isValidEmail, isValidPhone, mergeProfilePrefs } from "../utils/profileValidation.js";

export const authRouter = Router();

const ALLOWED_TIMEZONES = new Set([
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "Asia/Almaty",
  "Asia/Tashkent",
]);

const profileRoot = getProfileFilesRoot();
const avatarsDir = join(profileRoot, "avatars");
mkdirSync(avatarsDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarsDir),
    filename: (_req, file, cb) => {
      const ext = file.mimetype === "image/png" ? ".png" : ".jpg";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") cb(null, true);
    else cb(new Error("INVALID_AVATAR_TYPE"));
  },
});

function trimStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length > max) return null;
  return t;
}

authRouter.post("/register", async (req, res) => {
  const {
    lastName,
    firstName,
    patronymic,
    username,
    password,
    primaryRole,
    grade,
    group,
  } = req.body ?? {};

  if (
    typeof lastName !== "string" ||
    typeof firstName !== "string" ||
    typeof patronymic !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof primaryRole !== "string"
  ) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  if (username.length < 5) {
    return res.status(400).json({ error: "USERNAME_TOO_SHORT" });
  }

  if (!isPrimaryRole(primaryRole)) {
    return res.status(400).json({ error: "INVALID_PRIMARY_ROLE" });
  }

  // По GENERAL DESCRIPTION this endpoint "публичный" и нужен только для self-signup.
  // admin/head_teacher/director создаются через "технический" канал/сидинг.
  const allowedSelfSignupRoles: Array<typeof primaryRole> = ["teacher", "parent", "student"];
  if (!allowedSelfSignupRoles.includes(primaryRole)) {
    return res.status(403).json({ error: "SELF_SIGNUP_NOT_ALLOWED" });
  }

  if (userStore.findByUsername(username)) {
    return res.status(409).json({ error: "USERNAME_TAKEN" });
  }

  // GENERAL DESCRIPTION §2.4: student<username><grade><group>
  // При регистрации ученика обязателен grade+group и должна существовать группа этого класса.
  let studentCode: string | null = null;
  let studentMeta:
    | {
        grade: number;
        groupNumber: number;
        classGroupId: string | null;
      }
    | null = null;
  if (primaryRole === "student") {
    if (typeof grade !== "number" || typeof group !== "number") {
      return res.status(400).json({ error: "STUDENT_GRADE_GROUP_REQUIRED" });
    }
    const cls = classStore.findByGrade(grade);
    if (!cls) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
    const grp = resolveClassGroup({ grade, groupNumber: group, autoCreateDefault: true });
    if (!grp) {
      return res.status(400).json({ error: `Группа ${group} не найдена для класса ${grade}.` });
    }
    studentCode = makeStudentCode({ username, grade, group });
    studentMeta = {
      grade,
      groupNumber: group,
      classGroupId: grp.id,
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = userStore.create({
    lastName,
    firstName,
    patronymic,
    username,
    passwordHash,
    primaryRole,
    // По алгоритму регистрации secondaryRoles на этапе self-signup всегда пустой массив.
    secondaryRoles: [],
  });

  if (studentCode) {
    studentProfileStore.upsert({
      userId: user.id,
      studentCode,
      grade: studentMeta?.grade,
      groupNumber: studentMeta?.groupNumber,
      classGroupId: studentMeta?.classGroupId ?? null,
    });
  }

  ensureWelcomeDirectChatWithBot({ id: user.id, firstName: user.firstName });

  const accessToken = signAccessToken({ userId: user.id, primaryRole: user.primaryRole });
  return res.status(201).json({ accessToken, user: toPublicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const user = userStore.findByUsername(username);
  if (!user) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  if (user.primaryRole === "bot") {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const accessToken = signAccessToken({ userId: user.id, primaryRole: user.primaryRole });
  return res.json({ accessToken, user: toPublicUser(user) });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const user = userStore.findById(userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });

  return res.json({ user: toPublicUser(user) });
});

authRouter.patch("/profile", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = userStore.findById(userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (user.primaryRole === "bot") return res.status(403).json({ error: "FORBIDDEN" });

  const body = req.body ?? {};
  const hasAny = [
    "lastName",
    "firstName",
    "patronymic",
    "email",
    "phone",
    "locale",
    "timezone",
    "profilePrefs",
  ].some((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (!hasAny) return res.status(400).json({ error: "NO_FIELDS" });

  const locks = officeConfig.profileFieldLocks ?? {};

  const patch: Parameters<typeof userStore.updateById>[1] = {};

  if ("lastName" in body) {
    if (locks.lastName) return res.status(403).json({ error: "FIELD_LOCKED" });
    const v = trimStr(body.lastName, 120);
    if (v === null || !v) return res.status(400).json({ error: "INVALID_LAST_NAME" });
    patch.lastName = v;
  }
  if ("firstName" in body) {
    if (locks.firstName) return res.status(403).json({ error: "FIELD_LOCKED" });
    const v = trimStr(body.firstName, 120);
    if (v === null || !v) return res.status(400).json({ error: "INVALID_FIRST_NAME" });
    patch.firstName = v;
  }
  if ("patronymic" in body) {
    if (locks.patronymic) return res.status(403).json({ error: "FIELD_LOCKED" });
    const v = trimStr(body.patronymic, 120);
    if (v === null) return res.status(400).json({ error: "INVALID_PATRONYMIC" });
    patch.patronymic = v;
  }

  if ("email" in body) {
    const raw = body.email;
    if (raw !== null && typeof raw !== "string") return res.status(400).json({ error: "INVALID_EMAIL" });
    const e = typeof raw === "string" ? raw.trim() : "";
    if (e && !isValidEmail(e)) return res.status(400).json({ error: "INVALID_EMAIL" });
    patch.email = e;
  }

  if ("phone" in body) {
    const raw = body.phone;
    if (raw !== null && typeof raw !== "string") return res.status(400).json({ error: "INVALID_PHONE" });
    const p = typeof raw === "string" ? raw.trim() : "";
    if (!isValidPhone(p)) return res.status(400).json({ error: "INVALID_PHONE" });
    patch.phone = p;
  }

  if ("locale" in body) {
    const loc = body.locale;
    if (loc !== "ru" && loc !== "en") return res.status(400).json({ error: "INVALID_LOCALE" });
    patch.locale = loc;
  }

  if ("timezone" in body) {
    const tz = typeof body.timezone === "string" ? body.timezone.trim() : "";
    if (!tz || !ALLOWED_TIMEZONES.has(tz)) return res.status(400).json({ error: "INVALID_TIMEZONE" });
    patch.timezone = tz;
  }

  if ("profilePrefs" in body && body.profilePrefs !== undefined) {
    const pp = body.profilePrefs;
    if (pp !== null && typeof pp !== "object") return res.status(400).json({ error: "INVALID_PROFILE_PREFS" });
    const partial = pp as Partial<UserProfilePrefs>;
    patch.profilePrefs = mergeProfilePrefs(user.profilePrefs, partial);
  }

  const updated = userStore.updateById(userId, patch);
  if (!updated) return res.status(500).json({ error: "UPDATE_FAILED" });
  return res.json({ user: toPublicUser(updated) });
});

authRouter.post("/profile/avatar", requireAuth, (req: AuthedRequest, res, next) => {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("INVALID_AVATAR_TYPE")) return res.status(400).json({ error: "INVALID_AVATAR_TYPE" });
      return res.status(400).json({ error: "AVATAR_UPLOAD_FAILED" });
    }
    next();
  });
}, (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = userStore.findById(userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (user.primaryRole === "bot") return res.status(403).json({ error: "FORBIDDEN" });

  const file = (req as AuthedRequest & { file?: { filename: string } }).file;
  if (!file?.filename) return res.status(400).json({ error: "AVATAR_REQUIRED" });

  const prevName = user.avatarFileName;
  const updated = userStore.updateById(userId, { avatarFileName: file.filename });
  if (!updated) return res.status(500).json({ error: "UPDATE_FAILED" });

  if (prevName && prevName !== file.filename) {
    const oldPath = join(avatarsDir, prevName);
    try {
      if (existsSync(oldPath)) unlinkSync(oldPath);
    } catch {
      // ignore
    }
  }

  return res.json({ user: toPublicUser(updated) });
});

authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  const user = userStore.findById(userId);
  if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (user.primaryRole === "bot") return res.status(403).json({ error: "FORBIDDEN" });

  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
  if (newPassword.length > 200) return res.status(400).json({ error: "PASSWORD_TOO_LONG" });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "CURRENT_PASSWORD_WRONG" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = userStore.updateById(userId, { passwordHash });
  if (!updated) return res.status(500).json({ error: "UPDATE_FAILED" });
  return res.json({ ok: true, user: toPublicUser(updated) });
});

