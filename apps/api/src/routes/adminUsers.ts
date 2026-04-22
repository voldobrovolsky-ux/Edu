import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { classStore } from "../store/classStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { partToGroupNumber, resolveClassGroup } from "../services/schoolStructure.js";
import { makeStudentCode } from "../utils/codes.js";
import { isPrimaryRole, isSecondaryRole } from "../types/roles.js";
import type { PrimaryRole, SecondaryRole } from "../types/roles.js";
import { toPublicUser, type StoredUser, type TeacherQualificationCategory } from "../types/user.js";
import { parentChildStore } from "../store/parentChildStore.js";
import { clearAllApplicationData } from "../services/clearDatabase.js";
import { ensureWelcomeDirectChatWithBot } from "../services/systemBotWelcome.js";
import { SYSTEM_BOT_USERNAME } from "../store/userStore.js";
import { messengerStore } from "../store/messengerStore.js";
import {
  canAccessSchoolUserManagement,
  canClearEntireDatabase,
  isSysAdminUser,
} from "../auth/viewerRoles.js";
import { formatClassTeachingLabel } from "../utils/classLabels.js";

export const adminUsersRouter = Router();

function getViewer(req: AuthedRequest) {
  const userId = req.auth?.userId;
  if (!userId) return null;
  return userStore.findById(userId) ?? null;
}

/** Учётные записи системного уровня: не меняет завуч/директор без прав sysadmin. */
function isSysadminProtectedTarget(target: StoredUser): boolean {
  return target.primaryRole === "sysadmin" || target.username.trim().toLowerCase() === "admin";
}

function syncSystemChatGroups(): void {
  const bot = userStore.findSystemBot();
  if (!bot) return;
  messengerStore.syncSystemGroups(userStore.list(), bot.id);
}

adminUsersRouter.get("/users", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });

  const users = userStore.list().map((u) => toPublicUser(u));
  return res.json({ users });
});

adminUsersRouter.get("/users/:id/details", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });
  const userId = String(req.params.id ?? "");
  const user = userStore.findById(userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
  const teachingAssignments = teacherLoadStore.listByTeacher(userId).map((x) => {
    const discipline = disciplineStore.findByCode(x.disciplineCode);
    return {
      disciplineCode: x.disciplineCode,
      disciplineName: discipline?.name ?? x.disciplineCode,
      grade: x.grade,
      groupNumber: x.groupNumber,
      classLabel: formatClassTeachingLabel(x.grade, x.groupNumber),
      part: x.groupNumber == null ? "whole_class" : x.groupNumber === 1 ? "group1" : "group2",
    };
  });
  const byClass = new Map<string, { classLabel: string; disciplineCodes: string[]; disciplineNames: string[] }>();
  for (const a of teachingAssignments) {
    const key = `${a.grade}|${a.groupNumber ?? "whole"}`;
    const cur = byClass.get(key) ?? { classLabel: a.classLabel, disciplineCodes: [], disciplineNames: [] };
    if (!cur.disciplineCodes.includes(a.disciplineCode)) {
      cur.disciplineCodes.push(a.disciplineCode);
      cur.disciplineNames.push(a.disciplineName);
    }
    byClass.set(key, cur);
  }
  const teachingClassCards = [...byClass.values()];
  const childrenUserIds = parentChildStore.listByParent(userId).map((x) => x.studentUserId);
  return res.json({ user: toPublicUser(user), teachingAssignments, teachingClassCards, childrenUserIds });
});

adminUsersRouter.post("/users", requireAuth, async (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });

  const { lastName, firstName, patronymic, username, password, primaryRole, grade, group, teachingAssignments } =
    req.body ?? {};

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

  if (primaryRole === "bot") {
    return res.status(400).json({ error: "INVALID_PRIMARY_ROLE" });
  }

  if (primaryRole === "sysadmin" && !isSysAdminUser(viewer)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  if (userStore.findByUsername(username)) {
    return res.status(409).json({ error: "USERNAME_TAKEN" });
  }

  let studentCode: string | null = null;
  let studentMeta:
    | {
        grade: number;
        groupNumber: number;
        classGroupId: string | null;
      }
    | null = null;
  let validatedTeachingAssignments:
    | Array<{ disciplineCode: string; grade: number; groupNumber: number | null; classGroupId: string | null }>
    | null = null;

  if (primaryRole === "teacher") {
    if (!Array.isArray(teachingAssignments) || teachingAssignments.length === 0) {
      return res
        .status(400)
        .json({ error: "Для учителя обязательны связки «Преподаёт» (предмет + класс + часть класса)." });
    }

    validatedTeachingAssignments = [];
    for (const raw of teachingAssignments) {
      const a = raw ?? {};
      const disciplineCode = typeof a.disciplineCode === "string" ? a.disciplineCode : null;
      const gradeNum = typeof a.grade === "number" ? a.grade : typeof a.grade === "string" ? Number(a.grade) : null;
      const part = typeof a.part === "string" ? a.part : null;

      if (
        !disciplineCode ||
        !Number.isFinite(gradeNum) ||
        !Number.isInteger(gradeNum) ||
        (gradeNum as number) <= 0 ||
        !part
      ) {
        return res.status(400).json({ error: "INVALID_TEACHING_ASSIGNMENT" });
      }

      if (!classStore.findByGrade(gradeNum as number)) {
        return res.status(400).json({ error: `Класс ${gradeNum} не найден.` });
      }

      const discipline = disciplineStore.findByCode(disciplineCode);
      if (!discipline) {
        return res.status(400).json({ error: `Предмет «${disciplineCode}» не найден.` });
      }
      if (discipline.grade !== gradeNum) {
        return res
          .status(400)
          .json({ error: `Предмет «${disciplineCode}» не относится к классу ${gradeNum}.` });
      }

      if (part !== "whole_class" && part !== "group1" && part !== "group2") {
        return res.status(400).json({ error: "INVALID_TEACHING_PART" });
      }

      const groupNumber = partToGroupNumber(part);
      const classGroup =
        groupNumber == null
          ? null
          : resolveClassGroup({
              grade: gradeNum as number,
              groupNumber,
              autoCreateDefault: true,
            });

      if (groupNumber != null && !classGroup) {
        return res.status(400).json({ error: `Группа ${groupNumber} не найдена для класса ${gradeNum}.` });
      }

      validatedTeachingAssignments.push({
        disciplineCode,
        grade: gradeNum as number,
        groupNumber,
        classGroupId: classGroup?.id ?? null,
      });
    }
  }

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
    // При создании через админку по заданному алгоритму secondaryRoles выставляются пустыми.
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

  if (validatedTeachingAssignments) {
    for (const a of validatedTeachingAssignments) {
      teacherLoadStore.upsert({
        teacherUserId: user.id,
        disciplineCode: a.disciplineCode,
        grade: a.grade,
        groupNumber: a.groupNumber,
        classGroupId: a.classGroupId,
      });
    }
  }

  ensureWelcomeDirectChatWithBot({ id: user.id, firstName: user.firstName });
  syncSystemChatGroups();

  return res.status(201).json({ user: toPublicUser(user) });
});

adminUsersRouter.patch("/users/:id/roles", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });

  const userId = String(req.params.id ?? "");
  if (!userId) return res.status(400).json({ error: "INVALID_USER_ID" });

  const target = userStore.findById(userId);
  if (target && target.username.toLowerCase() === SYSTEM_BOT_USERNAME.toLowerCase()) {
    return res.status(403).json({ error: "SYSTEM_USER_PROTECTED" });
  }
  if (target && isSysadminProtectedTarget(target) && !isSysAdminUser(viewer)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const { primaryRole, secondaryRoles } = req.body ?? {};
  if (typeof primaryRole !== "string") return res.status(400).json({ error: "INVALID_INPUT" });

  if (!isPrimaryRole(primaryRole)) {
    return res.status(400).json({ error: "INVALID_PRIMARY_ROLE" });
  }

  if (primaryRole === "bot") {
    return res.status(400).json({ error: "INVALID_PRIMARY_ROLE" });
  }

  if (primaryRole === "sysadmin" && !isSysAdminUser(viewer)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  if (!Array.isArray(secondaryRoles)) return res.status(400).json({ error: "INVALID_INPUT" });
  const parsedSecondary = (secondaryRoles as unknown[])
    .filter((r): r is string => typeof r === "string")
    .filter(isSecondaryRole);

  // Правило: primaryRole не может быть одновременно в secondaryRoles.
  const dedupSecondary: SecondaryRole[] = Array.from(new Set(parsedSecondary)).filter(
    (r) => r !== (primaryRole as SecondaryRole),
  );

  const updated = userStore.updateRolesById(userId, {
    primaryRole,
    secondaryRoles: dedupSecondary,
  });

  if (!updated) return res.status(404).json({ error: "USER_NOT_FOUND" });
  syncSystemChatGroups();
  return res.json({ user: toPublicUser(updated) });
});

adminUsersRouter.patch("/users/:id", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });

  const userId = String(req.params.id ?? "");
  if (!userId) return res.status(400).json({ error: "INVALID_USER_ID" });

  const current = userStore.findById(userId);
  if (!current) return res.status(404).json({ error: "USER_NOT_FOUND" });

  if (current.username.toLowerCase() === SYSTEM_BOT_USERNAME.toLowerCase()) {
    return res.status(403).json({ error: "SYSTEM_USER_PROTECTED" });
  }
  if (isSysadminProtectedTarget(current) && !isSysAdminUser(viewer)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const patch: Record<string, unknown> = {};
  if (req.body?.lastName != null) patch.lastName = String(req.body.lastName);
  if (req.body?.firstName != null) patch.firstName = String(req.body.firstName);
  if (req.body?.patronymic != null) patch.patronymic = String(req.body.patronymic);

  if (req.body?.username != null) {
    const username = String(req.body.username).trim();
    if (username.length < 5) return res.status(400).json({ error: "USERNAME_TOO_SHORT" });
    const existing = userStore.findByUsername(username);
    if (existing && existing.id !== userId) return res.status(409).json({ error: "USERNAME_TAKEN" });
    patch.username = username;
  }

  if (req.body?.primaryRole != null) {
    if (!isPrimaryRole(req.body.primaryRole)) return res.status(400).json({ error: "INVALID_PRIMARY_ROLE" });
    if (req.body.primaryRole === "sysadmin" && !isSysAdminUser(viewer)) return res.status(403).json({ error: "FORBIDDEN" });
    patch.primaryRole = req.body.primaryRole;
  }
  if (req.body?.secondaryRoles != null) {
    if (!Array.isArray(req.body.secondaryRoles)) return res.status(400).json({ error: "INVALID_INPUT" });
    const parsedSecondary = (req.body.secondaryRoles as unknown[])
      .filter((r): r is string => typeof r === "string")
      .filter(isSecondaryRole);
    patch.secondaryRoles = Array.from(new Set(parsedSecondary));
  }
  if (req.body?.password != null) {
    const pwd = String(req.body.password);
    if (!pwd.trim()) return res.status(400).json({ error: "INVALID_PASSWORD" });
    patch.passwordHash = bcrypt.hashSync(pwd, 10);
  }

  if ("homeroomGrade" in (req.body ?? {})) {
    const v = (req.body as { homeroomGrade?: unknown }).homeroomGrade;
    if (v === null) patch.homeroomGrade = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: "INVALID_INPUT" });
      patch.homeroomGrade = n;
    }
  }
  if ("homeroomGroupNumber" in (req.body ?? {})) {
    const v = (req.body as { homeroomGroupNumber?: unknown }).homeroomGroupNumber;
    if (v === null) patch.homeroomGroupNumber = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: "INVALID_INPUT" });
      patch.homeroomGroupNumber = n;
    }
  }
  if ("pedagogicalExperienceYears" in (req.body ?? {})) {
    const v = (req.body as { pedagogicalExperienceYears?: unknown }).pedagogicalExperienceYears;
    if (v === null) patch.pedagogicalExperienceYears = null;
    else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "INVALID_INPUT" });
      patch.pedagogicalExperienceYears = Math.floor(n);
    }
  }
  if ("teacherQualificationCategory" in (req.body ?? {})) {
    const v = (req.body as { teacherQualificationCategory?: unknown }).teacherQualificationCategory;
    if (v === null) patch.teacherQualificationCategory = null;
    else if (v === "highest" || v === "first" || v === "second" || v === "none") {
      patch.teacherQualificationCategory = v as TeacherQualificationCategory;
    } else return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const nextPrimary = (patch.primaryRole as PrimaryRole | undefined) ?? current.primaryRole;
  const mergedSecondary: SecondaryRole[] = Array.isArray(patch.secondaryRoles)
    ? (patch.secondaryRoles as SecondaryRole[])
    : current.secondaryRoles;
  const nextSecondary = mergedSecondary.filter((r: SecondaryRole) => r !== (nextPrimary as SecondaryRole));
  const allRoles = new Set<string>([nextPrimary, ...nextSecondary]);

  let validatedTeachingAssignments:
    | Array<{ disciplineCode: string; grade: number; groupNumber: number | null; classGroupId: string | null }>
    | null = null;
  if (allRoles.has("teacher")) {
    const raw = req.body?.teachingAssignments;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: "TEACHING_ASSIGNMENTS_REQUIRED" });
    }
    validatedTeachingAssignments = [];
    for (const item of raw) {
      const disciplineCode = typeof item?.disciplineCode === "string" ? item.disciplineCode.trim() : "";
      const grade = Number(item?.grade);
      const part = String(item?.part ?? "");
      if (!disciplineCode || !Number.isInteger(grade) || grade <= 0) return res.status(400).json({ error: "INVALID_TEACHING_ASSIGNMENT" });
      if (!classStore.findByGrade(grade)) return res.status(400).json({ error: `Класс ${grade} не найден.` });
      const discipline = disciplineStore.findByCode(disciplineCode);
      if (!discipline) return res.status(400).json({ error: `Предмет «${disciplineCode}» не найден.` });
      if (discipline.grade !== grade) return res.status(400).json({ error: `Предмет «${disciplineCode}» не относится к классу ${grade}.` });
      if (part !== "whole_class" && part !== "group1" && part !== "group2") return res.status(400).json({ error: "INVALID_TEACHING_PART" });
      const groupNumber = partToGroupNumber(part as any);
      const classGroup =
        groupNumber == null
          ? null
          : resolveClassGroup({
              grade,
              groupNumber,
              autoCreateDefault: true,
            });
      if (groupNumber != null && !classGroup) return res.status(400).json({ error: `Группа ${groupNumber} не найдена для класса ${grade}.` });
      validatedTeachingAssignments.push({
        disciplineCode,
        grade,
        groupNumber,
        classGroupId: classGroup?.id ?? null,
      });
    }
  }

  let validatedChildren: string[] | null = null;
  if (allRoles.has("parent")) {
    const raw = req.body?.childrenUserIds;
    if (!Array.isArray(raw)) return res.status(400).json({ error: "CHILDREN_REQUIRED" });
    const parsed = raw.filter((x: unknown): x is string => typeof x === "string");
    for (const studentUserId of parsed) {
      const student = userStore.findById(studentUserId);
      if (!student || student.primaryRole !== "student") return res.status(400).json({ error: "INVALID_CHILD" });
      if (!studentProfileStore.findByUserId(studentUserId)) return res.status(400).json({ error: "STUDENT_PROFILE_NOT_FOUND" });
    }
    validatedChildren = Array.from(new Set(parsed));
  }

  const updated = userStore.updateById(userId, {
    ...(patch as Parameters<typeof userStore.updateById>[1]),
    secondaryRoles: nextSecondary,
  });
  if (!updated) return res.status(404).json({ error: "USER_NOT_FOUND" });
  if (allRoles.has("teacher")) {
    teacherLoadStore.replaceByTeacher(
      userId,
      validatedTeachingAssignments ?? [],
    );
  } else {
    teacherLoadStore.replaceByTeacher(userId, []);
  }
  if (allRoles.has("parent")) {
    parentChildStore.replaceChildren(userId, validatedChildren ?? []);
  } else {
    parentChildStore.removeByParent(userId);
  }
  syncSystemChatGroups();
  return res.json({ user: toPublicUser(updated) });
});

adminUsersRouter.delete("/users/:id", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });
  const userId = String(req.params.id ?? "");
  const confirmPhrase = typeof req.body?.confirmPhrase === "string" ? req.body.confirmPhrase.trim() : "";
  if (confirmPhrase !== "УДАЛИТЬ") return res.status(400).json({ error: "CONFIRM_PHRASE_REQUIRED" });
  const target = userStore.findById(userId);
  if (!target) return res.status(404).json({ error: "USER_NOT_FOUND" });
  if (target.username.toLowerCase() === SYSTEM_BOT_USERNAME.toLowerCase()) return res.status(403).json({ error: "SYSTEM_USER_PROTECTED" });
  if (isSysadminProtectedTarget(target) && !isSysAdminUser(viewer)) return res.status(403).json({ error: "SYSTEM_USER_PROTECTED" });
  parentChildStore.removeByParent(userId);
  parentChildStore.removeByStudent(userId);
  teacherLoadStore.replaceByTeacher(userId, []);
  studentProfileStore.removeByUserId(userId);
  messengerStore.removeUserEverywhere(userId);
  userStore.deleteById(userId);
  syncSystemChatGroups();
  return res.json({ ok: true });
});

adminUsersRouter.delete("/parents/:parentUserId/children/:studentUserId", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canAccessSchoolUserManagement(viewer)) return res.status(403).json({ error: "FORBIDDEN" });
  const parentUserId = String(req.params.parentUserId ?? "");
  const studentUserId = String(req.params.studentUserId ?? "");
  parentChildStore.removeLink(parentUserId, studentUserId);
  return res.json({ ok: true });
});

const CLEAR_DB_CONFIRM = "ОЧИСТИТЬ";

adminUsersRouter.post("/clear-database", requireAuth, (req: AuthedRequest, res) => {
  const viewer = getViewer(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!canClearEntireDatabase(viewer)) return res.status(403).json({ error: "FORBIDDEN" });

  const confirmPhrase = typeof req.body?.confirmPhrase === "string" ? req.body.confirmPhrase.trim() : "";
  if (confirmPhrase !== CLEAR_DB_CONFIRM) {
    return res.status(400).json({ error: "CONFIRM_PHRASE_REQUIRED" });
  }

  try {
    clearAllApplicationData();
    return res.json({ ok: true, message: "DATABASE_CLEARED" });
  } catch (e) {
    return res.status(500).json({ error: "CLEAR_DATABASE_FAILED" });
  }
});

