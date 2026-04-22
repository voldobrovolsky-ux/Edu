import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { classStore } from "../store/classStore.js";
import { classGroupStore } from "../store/classGroupStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import {
  createSchoolClassWithGroups,
  ensureDefaultGroupsForGrade,
  listClassesWithGroups,
  listExistingGroupsForStudentCodes,
} from "../services/schoolStructure.js";
import { parseStudentCode } from "../utils/codes.js";

export const schoolRouter = Router();

function requireStaff(req: AuthedRequest): { userId: string; role: string } | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const u = userStore.findById(userId);
  if (!u) return null;
  if (
    u.primaryRole === "director" ||
    u.primaryRole === "head_teacher" ||
    u.primaryRole === "teacher" ||
    u.primaryRole === "sysadmin"
  ) {
    return { userId: u.id, role: u.primaryRole };
  }
  return null;
}

function requireHeadTeacher(req: AuthedRequest): { userId: string } | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const user = userStore.findById(userId);
  if (!user) return null;
  return user.primaryRole === "head_teacher" ||
    user.primaryRole === "director" ||
    user.primaryRole === "sysadmin"
    ? { userId }
    : null;
}

schoolRouter.get("/classes", requireAuth, (_req, res) => {
  return res.json({ classes: listClassesWithGroups() });
});

schoolRouter.get("/teachers", requireAuth, (req: AuthedRequest, res) => {
  if (!requireStaff(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const teachers = userStore
    .list()
    .filter((u) => u.primaryRole === "teacher" || u.secondaryRoles.includes("teacher"))
    .map((u) => ({
      id: u.id,
      fio: `${u.lastName} ${u.firstName} ${u.patronymic}`.trim(),
      primaryRole: u.primaryRole,
      secondaryRoles: u.secondaryRoles,
    }))
    .sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  return res.json({ teachers });
});

schoolRouter.post("/classes", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const { grade } = req.body ?? {};
  if (typeof grade !== "number") return res.status(400).json({ error: "INVALID_INPUT" });
  try {
    const schoolClass = createSchoolClassWithGroups(grade);
    return res.status(201).json({ class: schoolClass });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

schoolRouter.get("/classes/:grade/groups", requireAuth, (req, res) => {
  const grade = Number(req.params.grade);
  if (!Number.isFinite(grade)) return res.status(400).json({ error: "INVALID_GRADE" });
  if (!classStore.findByGrade(grade)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
  ensureDefaultGroupsForGrade(grade);
  return res.json({ groups: classGroupStore.listByGrade(grade) });
});

schoolRouter.post("/classes/:grade/groups", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const grade = Number(req.params.grade);
  const { groupNumber } = req.body ?? {};
  if (!Number.isFinite(grade) || typeof groupNumber !== "number") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  if (!classStore.findByGrade(grade)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
  try {
    const grp = classGroupStore.create({ grade, groupNumber });
    return res.status(201).json({ group: grp });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

schoolRouter.get("/students/resolve", requireAuth, (_req, res) => {
  const code = String(_req.query.code ?? "");
  try {
    const groups = listExistingGroupsForStudentCodes();
    const parsed = parseStudentCode({ code, existingGroups: groups });
    return res.json({ parsed });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

schoolRouter.get("/students/by-code/:studentCode", requireAuth, (req, res) => {
  const studentCode = String(req.params.studentCode ?? "");
  const profile = studentProfileStore.findByStudentCode(studentCode);
  if (!profile) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ student: profile });
});

