import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { disciplineStore } from "../store/disciplineStore.js";

export const teacherLoadsRouter = Router();

function canManageTeacherLoads(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  return Boolean(
    user &&
      (user.primaryRole === "head_teacher" ||
        user.primaryRole === "director" ||
        user.primaryRole === "sysadmin"),
  );
}

// Для настройки нагрузки: сначала выбирается grade, затем показываем только дисциплины этого класса.
teacherLoadsRouter.get("/options", requireAuth, (req, res) => {
  const grade = Number(req.query.grade);
  if (!Number.isFinite(grade)) return res.status(400).json({ error: "INVALID_GRADE" });
  const disciplines = disciplineStore.listByGrade(grade).map((d) => ({
    code: d.code, // внутренний ключ
    name: d.name, // человеческое название
    grade: d.grade,
  }));
  return res.json({ disciplines });
});

teacherLoadsRouter.post("/", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageTeacherLoads(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const { teacherUserId, disciplineCode } = req.body ?? {};
  if (typeof teacherUserId !== "string" || typeof disciplineCode !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  const teacher = userStore.findById(teacherUserId);
  if (!teacher) return res.status(400).json({ error: "TEACHER_NOT_FOUND" });
  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });

  // Старый эндпоинт задавал только disciplineCode, поэтому по умолчанию
  // считаем, что учитель ведёт предмет у "всего класса" (wildcard по группам).
  const load = teacherLoadStore.upsert({ teacherUserId, disciplineCode, grade: discipline.grade, groupNumber: null });
  return res.status(201).json({ load });
});

teacherLoadsRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const loads = teacherLoadStore.listByTeacher(userId);
  const panelsByDiscipline = new Map<string, { grade: number; disciplineCode: string; disciplineName: string }>();
  for (const l of loads) {
    const d = disciplineStore.findByCode(l.disciplineCode);
    if (!d) continue;
    if (panelsByDiscipline.has(d.code)) continue;
    panelsByDiscipline.set(d.code, { grade: d.grade, disciplineCode: d.code, disciplineName: d.name });
  }
  const panels = [...panelsByDiscipline.values()];

  return res.json({ panels });
});

teacherLoadsRouter.get("/:teacherUserId", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageTeacherLoads(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const teacherUserId = String(req.params.teacherUserId ?? "");
  const loads = teacherLoadStore.listByTeacher(teacherUserId);
  const panelsByDiscipline = new Map<string, { grade: number; disciplineCode: string; disciplineName: string }>();
  for (const l of loads) {
    const d = disciplineStore.findByCode(l.disciplineCode);
    if (!d) continue;
    if (panelsByDiscipline.has(d.code)) continue;
    panelsByDiscipline.set(d.code, { grade: d.grade, disciplineCode: d.code, disciplineName: d.name });
  }
  const panels = [...panelsByDiscipline.values()];
  return res.json({ panels });
});

