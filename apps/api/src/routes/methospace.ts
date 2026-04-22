import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { methodPackStore } from "../store/methodPackStore.js";
import { classStore } from "../store/classStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { journalDocumentTypeStore } from "../store/journalDocumentTypeStore.js";
import { journalLessonTypeStore } from "../store/journalLessonTypeStore.js";
import { quarterStore } from "../store/quarterStore.js";
import { documentFolderTreeStore } from "../store/documentFolderTreeStore.js";
import { documentStore } from "../store/documentStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { resolveStudentPlacement } from "../services/schoolStructure.js";
import { ensureAllDisciplineFoldersForBase, ensureDisciplineFolder } from "../services/disciplineDocuments.js";
import { makeDisciplineBaseCode, makeDisciplineCode } from "../utils/codes.js";
import { emptyTagSet } from "../types/documents.js";
import {
  JOURNAL_LESSON_TYPE_COLOR_HEX,
  JOURNAL_LESSON_TYPE_COLOR_KEYS,
  isJournalLessonTypeColorKey,
} from "../types/journalLessonTypeColors.js";

const __dirnameMethospace = dirname(fileURLToPath(import.meta.url));
const LESSON_TYPE_TMP = join(__dirnameMethospace, "..", "..", "data", "tmp");
if (!existsSync(LESSON_TYPE_TMP)) mkdirSync(LESSON_TYPE_TMP, { recursive: true });
const lessonTypeUpload = multer({ dest: LESSON_TYPE_TMP, limits: { fileSize: 25 * 1024 * 1024 } });

export const methospaceRouter = Router();

function requireHeadTeacher(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  return Boolean(user && (user.primaryRole === "head_teacher" || user.primaryRole === "sysadmin"));
}

function requireQuarterManager(req: AuthedRequest): boolean {
  const userId = req.auth?.userId;
  if (!userId) return false;
  const user = userStore.findById(userId);
  return Boolean(user && (user.primaryRole === "head_teacher" || user.primaryRole === "director"));
}

function requireStaff(req: AuthedRequest): { userId: string; role: string } | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const user = userStore.findById(userId);
  if (!user) return null;
  if (
    user.primaryRole === "director" ||
    user.primaryRole === "head_teacher" ||
    user.primaryRole === "teacher" ||
    user.primaryRole === "sysadmin"
  ) {
    return { userId, role: user.primaryRole };
  }
  return null;
}

function buildVacations(quarters: Array<{ startDate: string; endDate: string }>) {
  const vacations: Array<{ from: string; to: string }> = [];
  for (let i = 1; i < quarters.length; i++) {
    vacations.push({
      from: quarters[i - 1]!.endDate,
      to: quarters[i]!.startDate,
    });
  }
  return vacations;
}

function teacherHasDiscipline(teacherUserId: string, disciplineCode: string): boolean {
  return teacherLoadStore
    .listByTeacher(teacherUserId)
    .some((l) => l.disciplineCode === disciplineCode);
}

function isRangesConfigured(ranges: any): boolean {
  // Считаем "настроено", если хоть одно значение отличается от 0.
  if (!ranges || typeof ranges !== "object") return false;
  for (const k of ["1", "2", "3", "4", "5"] as const) {
    const v = (ranges as any)[k];
    if (v && typeof v === "object") {
      const min = typeof v.min === "number" ? v.min : 0;
      const max = typeof v.max === "number" ? v.max : 0;
      if (min !== 0 || max !== 0) return true;
    }
  }
  return false;
}

methospaceRouter.get("/disciplines", requireAuth, (req, res) => {
  const gradeParam = req.query.grade;
  if (gradeParam == null) {
    return res.json({ disciplines: disciplineStore.list() });
  }
  const grade = Number(gradeParam);
  if (!Number.isFinite(grade)) return res.status(400).json({ error: "INVALID_GRADE" });
  return res.json({ disciplines: disciplineStore.listByGrade(grade) });
});

/**
 * Сводка дисциплин для экрана списка (GENERAL DESCRIPTION §3.5).
 * - завуч/директор: все дисциплины
 * - учитель: только дисциплины из нагрузки
 */
methospaceRouter.get("/disciplines/summary", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });

  const mine = String(req.query.mine ?? "") === "1";
  let disciplines = disciplineStore.list();
  if (mine && staff.role === "teacher") {
    const my = new Set(teacherLoadStore.listByTeacher(staff.userId).map((l) => l.disciplineCode));
    disciplines = disciplines.filter((d) => my.has(d.code));
  }

  const grouped = new Map<
    string,
    {
      baseCode: string;
      name: string;
      codes: string[];
      grades: number[];
      hasMaterials: boolean;
      hasRanges: boolean;
      missingMaterialsCodes: string[];
      missingRangesCodes: string[];
    }
  >();

  for (const d of disciplines) {
    const key = d.baseCode;
    const g =
      grouped.get(key) ??
      {
        baseCode: d.baseCode,
        name: d.name,
        codes: [],
        grades: [],
        hasMaterials: false,
        hasRanges: false,
        missingMaterialsCodes: [],
        missingRangesCodes: [],
      };
    g.codes.push(d.code);
    g.grades.push(d.grade);

    const hasDocs = (d.documents?.length ?? 0) > 0;
    const hasLessonTypeStandard = journalLessonTypeStore
      .list()
      .some((lt) => Boolean(lt.standardDocumentId) && lt.disciplineCodes.includes(d.code));
    const hasMaterials = hasDocs || hasLessonTypeStandard;
    if (!hasMaterials) g.missingMaterialsCodes.push(d.code);

    const rangesOk = isRangesConfigured(d.gradeRanges);
    if (!rangesOk) g.missingRangesCodes.push(d.code);

    g.hasMaterials = g.hasMaterials || hasMaterials;
    g.hasRanges = g.hasRanges || rangesOk;
    grouped.set(key, g);
  }

  const items = Array.from(grouped.values())
    .map((x) => ({
      ...x,
      codes: Array.from(new Set(x.codes)).sort((a, b) => a.localeCompare(b)),
      grades: Array.from(new Set(x.grades)).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.baseCode.localeCompare(b.baseCode));

  return res.json({ items });
});

/**
 * Карточка дисциплины по baseCode: классы, документы, диапазоны, методпакеты.
 */
methospaceRouter.get("/disciplines/by-base/:baseCode", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const baseCode = String(req.params.baseCode ?? "").trim();
  if (!baseCode) return res.status(400).json({ error: "BASE_CODE_REQUIRED" });

  let disciplines = disciplineStore.list().filter((d) => d.baseCode === baseCode);
  if (disciplines.length === 0) return res.status(404).json({ error: "NOT_FOUND" });
  ensureAllDisciplineFoldersForBase(baseCode);
  disciplines = disciplineStore.list().filter((d) => d.baseCode === baseCode);

  if (staff.role === "teacher") {
    const my = new Set(teacherLoadStore.listByTeacher(staff.userId).map((l) => l.disciplineCode));
    disciplines = disciplines.filter((d) => my.has(d.code));
    if (disciplines.length === 0) return res.status(403).json({ error: "FORBIDDEN" });
  }

  const name = disciplines[0]!.name;
  const grades = Array.from(new Set(disciplines.map((d) => d.grade))).sort((a, b) => a - b);
  const codes = disciplines.map((d) => d.code).sort((a, b) => a.localeCompare(b));
  const documents = disciplines.flatMap((d) => d.documents || []);

  const lessonTypeStandards = journalLessonTypeStore
    .list()
    .filter((lt) => Boolean(lt.standardDocumentId) && lt.disciplineCodes.some((c) => codes.includes(c)))
    .map((lt) => {
      const doc = lt.standardDocumentId ? documentStore.findById(lt.standardDocumentId) : undefined;
      return {
        lessonTypeId: lt.id,
        name: lt.name,
        description: lt.description,
        colorKey: lt.colorKey,
        colorHex: JOURNAL_LESSON_TYPE_COLOR_HEX[lt.colorKey],
        document: doc
          ? { id: doc.id, originalName: doc.originalName, storageRelPath: doc.storageRelPath }
          : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return res.json({
    baseCode,
    name,
    grades,
    codes,
    disciplines,
    documents,
    lessonTypeStandards,
    methodPacks: [],
  });
});

/**
 * Создание дисциплины завучем (GENERAL DESCRIPTION §2.4 и §3.3).
 * В запросе указывается name + grades[], и система создаёт сущности вида MATEM5/MATEM7...
 */
methospaceRouter.post("/disciplines", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });

  const { name, grades, documents = [], gradeRanges, baseCode } = req.body ?? {};
  if (typeof name !== "string" || !Array.isArray(grades)) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  const parsedGrades = grades.filter((g: unknown): g is number => typeof g === "number");
  if (parsedGrades.length === 0) return res.status(400).json({ error: "GRADES_REQUIRED" });

  try {
    const baseCodeToUse =
      typeof baseCode === "string" && baseCode.trim()
        ? String(baseCode).trim().toUpperCase()
        : makeDisciplineBaseCode(name);
    const docsToAttach = Array.isArray(documents) ? documents : [];

    const created = parsedGrades.map((grade) => {
      const code = makeDisciplineCode({ baseCode: baseCodeToUse, grade });
      const discipline = disciplineStore.create({
        code,
        baseCode: baseCodeToUse,
        name,
        grade,
        documents: docsToAttach,
        gradeRanges,
      });
      return disciplineStore.findByCode(code) ?? discipline;
    });

    // Один общий корень «Дисциплины / Название» и по подпапке «Название N класс» на каждую сущность.
    ensureAllDisciplineFoldersForBase(baseCodeToUse);

    // Стандартизирующий документ должен сразу оказаться в «Документы -> Дисциплины / <Дисциплина>».
    if (docsToAttach.length > 0 && created.length > 0) {
      const first = disciplineStore.findByCode(created[0]!.code) ?? created[0]!;
      const rootFolder = ensureDisciplineFolder(first);
      const nextCodes = created.map((d) => d.code);
      const nextGrades = created.map((d) => d.grade);

      for (const doc of docsToAttach) {
        const existing = documentStore.findById(doc.id);
        if (!existing) continue;

        documentStore.updateMeta(existing.id, {
          sectionId: rootFolder.sectionId,
          folderId: rootFolder.id,
          disciplineId: first.id,
          isStandardizing: true,
          tags: {
            ...existing.tags,
            disciplineCodes: nextCodes,
            grades: nextGrades,
          },
          // Метаданные папки влияют на “путь” в UI, но физический файл не переносится.
          folder: {
            schoolId: "school-1",
            officeSection: "methospace",
            disciplineCode: first.code,
            grade: first.grade,
          },
        });
      }
    }

    return res.status(201).json({ baseCode: baseCodeToUse, disciplines: created });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.delete("/disciplines/:code", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.code ?? "");

  const baseCodeRe = /^[A-Z]{5}$/;
  const existing = disciplineStore.findByCode(id);
  const baseCode = existing?.baseCode ?? (baseCodeRe.test(id) ? id : null);
  if (!baseCode) return res.status(404).json({ error: "NOT_FOUND" });

  const codesToDelete = disciplineStore.list().filter((d) => d.baseCode === baseCode).map((d) => d.code);
  if (codesToDelete.length === 0) return res.status(404).json({ error: "NOT_FOUND" });
  const codesSet = new Set(codesToDelete);

  // Блокируем удаление при наличии TeacherLoad/уроков.
  const hasTeacherLoads = teacherLoadStore.list().some((l) => codesSet.has(l.disciplineCode));
  if (hasTeacherLoads) return res.status(400).json({ error: "DISCIPLINE_HAS_TEACHER_LOADS" });

  const hasLessons = timetableLessonStore
    .listByDateRange({ from: "2000-01-01", to: "2100-01-01" })
    .some((l) => codesSet.has(l.disciplineCode));
  if (hasLessons) return res.status(400).json({ error: "DISCIPLINE_HAS_LESSONS" });

  // Сначала обеспечим структуру, чтобы корректно удалить корневую папку.
  const disciplines = codesToDelete.map((code) => disciplineStore.findByCode(code)).filter((d): d is any => Boolean(d));
  const rootFolderIds = new Set<string>();
  for (const d of disciplines) {
    const rootFolder = ensureDisciplineFolder(d);
    rootFolderIds.add(rootFolder.id);
  }

  // Удаляем дисциплины (коды MATEM1..MATEMN)
  for (const d of disciplines) {
    disciplineStore.removeByCode(d.code);
  }

  // Удаляем папки и документы целиком из «корня» дисциплины
  for (const rootFolderId of rootFolderIds) {
    const subtree = documentFolderTreeStore.collectDescendants([rootFolderId]);
    const docs = documentStore.listAll({ includeTrashed: true }).filter((doc) => doc.folderId && subtree.has(doc.folderId));
    documentStore.deleteByIds(docs.map((doc) => doc.id));
    documentFolderTreeStore.removeByIds(subtree);
  }

  // Методические пакеты завязаны на disciplineCode — удаляем их тоже.
  for (const pack of methodPackStore.list()) {
    if (codesSet.has(pack.disciplineCode)) methodPackStore.delete(pack.id);
  }

  return res.json({ ok: true, baseCode, removedCodes: codesToDelete });
});

/**
 * Обновление дисциплины завучем: документы и диапазоны оценок.
 */
methospaceRouter.patch("/disciplines/:code", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const code = String(req.params.code ?? "");
  try {
    const docsArg: any = req.body?.documents;
    const updated = disciplineStore.updateByCode(code, {
      documents: docsArg,
      gradeRanges: req.body?.gradeRanges,
      name: req.body?.name,
    });

    if (Array.isArray(docsArg) && docsArg.length > 0) {
      const rootFolder = ensureDisciplineFolder(updated);
      const baseDisciplines = disciplineStore.list().filter((d) => d.baseCode === updated.baseCode);
      const nextCodes = baseDisciplines.map((d) => d.code);
      const nextGrades = baseDisciplines.map((d) => d.grade);

      for (const doc of docsArg) {
        if (!doc || typeof doc !== "object") continue;
        const docId = typeof (doc as any).id === "string" ? (doc as any).id : "";
        if (!docId) continue;
        const existing = documentStore.findById(docId);
        if (!existing) continue;

        documentStore.updateMeta(existing.id, {
          sectionId: rootFolder.sectionId,
          folderId: rootFolder.id,
          disciplineId: updated.id,
          isStandardizing: true,
          tags: {
            ...existing.tags,
            disciplineCodes: nextCodes,
            grades: nextGrades,
          },
          folder: {
            schoolId: "school-1",
            officeSection: "methospace",
            disciplineCode: updated.code,
            grade: updated.grade,
          },
        });
      }
    }

    return res.json({ discipline: updated });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "DISCIPLINE_NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
    return res.status(400).json({ error: msg });
  }
});

/**
 * Методические пакеты
 * - завуч: полные права
 * - учитель: CRUD только своих пакетов в рамках закреплённых дисциплин
 */
methospaceRouter.get("/method-packs", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const disciplineCode = typeof req.query.disciplineCode === "string" ? req.query.disciplineCode : undefined;
  if (staff.role === "teacher" && disciplineCode && !teacherHasDiscipline(staff.userId, disciplineCode)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const createdByUserId = staff.role === "teacher" ? staff.userId : undefined;
  const packs = methodPackStore.list({ disciplineCode, createdByUserId });
  return res.json({ methodPacks: packs });
});

methospaceRouter.post("/method-packs", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff || (staff.role !== "teacher" && staff.role !== "head_teacher")) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const { disciplineCode } = req.body ?? {};
  if (typeof disciplineCode !== "string" || !disciplineCode.trim()) {
    return res.status(400).json({ error: "DISCIPLINE_CODE_REQUIRED" });
  }
  if (!disciplineStore.findByCode(disciplineCode)) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  if (staff.role === "teacher" && !teacherHasDiscipline(staff.userId, disciplineCode)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    const pack = methodPackStore.create({
      disciplineCode,
      createdByUserId: staff.userId,
      theme: req.body?.theme,
      goals: req.body?.goals,
      lessonPlan: req.body?.lessonPlan,
      materialDocumentIds: req.body?.materialDocumentIds,
      homework: req.body?.homework,
      gradingCriteria: req.body?.gradingCriteria,
      classGrades: req.body?.classGrades,
      lessonBindings: req.body?.lessonBindings,
    });
    return res.status(201).json({ methodPack: pack });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.patch("/method-packs/:id", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff || (staff.role !== "teacher" && staff.role !== "head_teacher")) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const id = String(req.params.id ?? "");
  const existing = methodPackStore.findById(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (staff.role === "teacher") {
    if (existing.createdByUserId !== staff.userId) return res.status(403).json({ error: "FORBIDDEN" });
    if (!teacherHasDiscipline(staff.userId, existing.disciplineCode)) return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    const updated = methodPackStore.update(id, {
      disciplineCode: req.body?.disciplineCode,
      classGrades: req.body?.classGrades,
      lessonBindings: req.body?.lessonBindings,
      theme: req.body?.theme,
      goals: req.body?.goals,
      lessonPlan: req.body?.lessonPlan,
      materialDocumentIds: req.body?.materialDocumentIds,
      homework: req.body?.homework,
      gradingCriteria: req.body?.gradingCriteria,
    } as any);
    return res.json({ methodPack: updated });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.delete("/method-packs/:id", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff || (staff.role !== "teacher" && staff.role !== "head_teacher")) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  const id = String(req.params.id ?? "");
  const existing = methodPackStore.findById(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
  if (staff.role === "teacher" && existing.createdByUserId !== staff.userId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  try {
    methodPackStore.delete(id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

/**
 * Классы (overview для методического пространства).
 * Счётчик учеников считается по факту из `studentProfileStore` и rule studentCode.
 */
methospaceRouter.get("/classes", requireAuth, (_req: AuthedRequest, res) => {
  // Вкладка "Классы" в методическом пространстве видна только head_teacher/admin,
  // но эндпоинт всё равно защищаем.
  if (!requireHeadTeacher(_req)) return res.status(403).json({ error: "FORBIDDEN" });

  const classes = classStore.list();

  const countsByGrade = new Map<number, number>();
  for (const p of studentProfileStore.list()) {
    const placement = resolveStudentPlacement(p);
    if (!placement) continue;
    countsByGrade.set(placement.grade, (countsByGrade.get(placement.grade) ?? 0) + 1);
  }

  return res.json({
    classes: classes.map((c) => ({ grade: c.grade, studentCount: countsByGrade.get(c.grade) ?? 0 })),
  });
});

methospaceRouter.get("/classes/:grade/students", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });

  const grade = Number(req.params.grade);
  if (!Number.isFinite(grade)) return res.status(400).json({ error: "INVALID_GRADE" });

  if (!classStore.findByGrade(grade)) return res.json({ students: [] as Array<{ userId: string; fio: string; groupNumber: number }> });

  const students: Array<{ userId: string; fio: string; groupNumber: number }> = [];

  for (const p of studentProfileStore.list()) {
    const placement = resolveStudentPlacement(p);
    if (!placement || placement.grade !== grade) continue;
    const u = userStore.findById(p.userId);
    if (!u) continue;
    students.push({
      userId: u.id,
      fio: `${u.lastName} ${u.firstName} ${u.patronymic}`.trim(),
      groupNumber: placement.groupNumber,
    });
  }

  students.sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  return res.json({ students });
});

/**
 * Справочник типов документов журнала.
 *
 * Привязка к документам идёт через `Document archive`:
 * - documents.tags.periods включает `JournalDocumentType.id`.
 */
methospaceRouter.get("/journal-document-types", requireAuth, (req: AuthedRequest, res) => {
  return res.json({ types: journalDocumentTypeStore.list() });
});

methospaceRouter.post("/journal-document-types", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const { name, description, requiredForLessonTypeIds } = req.body ?? {};
  if (typeof name !== "string") return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const created = journalDocumentTypeStore.create({
      name,
      description: typeof description === "string" ? description : "",
      requiredForLessonTypeIds: Array.isArray(requiredForLessonTypeIds)
        ? requiredForLessonTypeIds.filter((x: unknown): x is string => typeof x === "string")
        : undefined,
    });
    return res.status(201).json({ type: created });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.patch("/journal-document-types/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });

  const id = String(req.params.id ?? "");
  if (!id.trim()) return res.status(400).json({ error: "INVALID_ID" });

  const { name, description, requiredForLessonTypeIds } = req.body ?? {};
  const patch: any = {};
  if (name != null) patch.name = name;
  if (description != null) patch.description = description;
  if (requiredForLessonTypeIds != null) {
    patch.requiredForLessonTypeIds = Array.isArray(requiredForLessonTypeIds)
      ? requiredForLessonTypeIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
  }

  try {
    const updated = journalDocumentTypeStore.update(id, patch);
    return res.json({ type: updated });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
    return res.status(400).json({ error: msg });
  }
});

methospaceRouter.delete("/journal-document-types/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });

  const id = String(req.params.id ?? "");
  if (!id.trim()) return res.status(400).json({ error: "INVALID_ID" });

  const existing = journalDocumentTypeStore.findById(id);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  try {
    journalDocumentTypeStore.delete(id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.get("/journal-lesson-types", requireAuth, (_req, res) => {
  return res.json({
    types: journalLessonTypeStore.list(),
    colorPalette: JOURNAL_LESSON_TYPE_COLOR_KEYS.map((k) => ({ key: k, hex: JOURNAL_LESSON_TYPE_COLOR_HEX[k] })),
  });
});

methospaceRouter.post("/journal-lesson-types", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const { name, description, disciplineCodes, colorKey } = req.body ?? {};
  if (typeof name !== "string") return res.status(400).json({ error: "INVALID_INPUT" });
  const ck = typeof colorKey === "string" && isJournalLessonTypeColorKey(colorKey) ? colorKey : "neutral_blue_gray";
  try {
    const created = journalLessonTypeStore.create({
      name,
      description: typeof description === "string" ? description : "",
      disciplineCodes: Array.isArray(disciplineCodes) ? disciplineCodes : [],
      colorKey: ck,
    });
    return res.status(201).json({ type: created });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.patch("/journal-lesson-types/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  if (!id.trim()) return res.status(400).json({ error: "INVALID_ID" });
  const { name, description, disciplineCodes, colorKey, standardDocumentId } = req.body ?? {};
  const patch: {
    name?: string;
    description?: string;
    disciplineCodes?: string[];
    colorKey?: import("../types/journalLessonTypeColors.js").JournalLessonTypeColorKey;
    standardDocumentId?: string | null;
  } = {};
  if (name != null) patch.name = name;
  if (description != null) patch.description = description;
  if (disciplineCodes != null) patch.disciplineCodes = disciplineCodes;
  if (colorKey != null) {
    if (typeof colorKey === "string" && isJournalLessonTypeColorKey(colorKey)) patch.colorKey = colorKey;
  }
  if (standardDocumentId !== undefined) {
    patch.standardDocumentId = standardDocumentId == null ? null : String(standardDocumentId);
  }
  try {
    const updated = journalLessonTypeStore.update(id, patch);
    return res.json({ type: updated });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
    return res.status(400).json({ error: msg });
  }
});

methospaceRouter.delete("/journal-lesson-types/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  if (!id.trim()) return res.status(400).json({ error: "INVALID_ID" });
  try {
    journalLessonTypeStore.delete(id);
    return res.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "NOT_FOUND") return res.status(404).json({ error: "NOT_FOUND" });
    return res.status(400).json({ error: msg });
  }
});

methospaceRouter.post("/journal-lesson-types/:id/standard-document", requireAuth, lessonTypeUpload.single("file"), (req: AuthedRequest, res) => {
  if (!requireHeadTeacher(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const id = String(req.params.id ?? "");
  const file = req.file;
  const disciplineCode = String(req.body?.disciplineCode ?? "").trim();
  if (!id.trim() || !file || !disciplineCode) {
    try {
      if (file?.path) unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const lt = journalLessonTypeStore.findById(id);
  if (!lt) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  }

  ensureDisciplineFolder(discipline);
  const disciplineFresh = disciplineStore.findByCode(disciplineCode);
  const classFolder =
    disciplineFresh?.classFolderId != null ? documentFolderTreeStore.findById(disciplineFresh.classFolderId) : null;
  if (!disciplineFresh?.classFolderId || !classFolder?.sectionId) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: "DISCIPLINE_CLASS_FOLDER_MISSING" });
  }

  const userId = req.auth?.userId ?? "unknown";
  const jltPeriod = `jlt:${lt.id}`;

  const tags = {
    ...emptyTagSet(),
    disciplineCodes: [disciplineFresh.code],
    grades: [disciplineFresh.grade],
    periods: [jltPeriod],
    journalTrace: {
      disciplineCode: disciplineFresh.code,
      journalLessonTypeId: lt.id,
    },
  };

  const folderMeta = {
    schoolId: "school-1",
    officeSection: "document_archive" as const,
    disciplineCode: disciplineFresh.code,
    grade: disciplineFresh.grade,
  };

  try {
    let docId: string;
    if (lt.standardDocumentId) {
      const prev = documentStore.findById(lt.standardDocumentId);
      if (prev) {
        documentStore.replaceStoredFileFromUpload(prev.id, {
          tempPath: file.path,
          originalName: file.originalname || "upload.bin",
          mimeType: file.mimetype || "application/octet-stream",
          sizeBytes: file.size,
        });
        documentStore.updateMeta(prev.id, {
          tags: { ...prev.tags, ...tags },
          folder: folderMeta,
          sectionId: classFolder.sectionId,
          folderId: disciplineFresh.classFolderId,
          disciplineId: disciplineFresh.id,
          isStandardizing: true,
        });
        docId = prev.id;
      } else {
        const created = documentStore.createFromUpload({
          tempPath: file.path,
          originalName: file.originalname || "upload.bin",
          mimeType: file.mimetype || "application/octet-stream",
          sizeBytes: file.size,
          createdByUserId: userId,
          tags,
          sectionId: classFolder.sectionId,
          folderId: disciplineFresh.classFolderId,
          disciplineId: disciplineFresh.id,
          folder: folderMeta,
        });
        docId = created.id;
      }
    } else {
      const created = documentStore.createFromUpload({
        tempPath: file.path,
        originalName: file.originalname || "upload.bin",
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
        createdByUserId: userId,
        tags,
        sectionId: classFolder.sectionId,
        folderId: disciplineFresh.classFolderId,
        disciplineId: disciplineFresh.id,
        folder: folderMeta,
      });
      docId = created.id;
    }

    const updated = journalLessonTypeStore.update(id, { standardDocumentId: docId });
    return res.status(201).json({ type: updated, documentId: docId });
  } catch (e) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: (e as Error).message });
  }
});

methospaceRouter.get("/quarters", requireAuth, (req: AuthedRequest, res) => {
  const staff = requireStaff(req);
  if (!staff) return res.status(403).json({ error: "FORBIDDEN" });
  const quarters = quarterStore.list();
  console.info("[quarters] methospace read", {
    role: staff.role,
    count: quarters.length,
    indexes: quarters.map((q) => q.index),
  });
  return res.json({ quarters, vacations: buildVacations(quarters) });
});

methospaceRouter.put("/quarters", requireAuth, (req: AuthedRequest, res) => {
  if (!requireQuarterManager(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const raw = Array.isArray(req.body?.quarters) ? req.body.quarters : null;
  if (!raw) return res.status(400).json({ error: "INVALID_INPUT" });
  try {
    const quarters = quarterStore.replace(
      raw.map((q: any, idx: number) => ({
        index: Number(q.index ?? idx + 1) as 1 | 2 | 3 | 4,
        startDate: String(q.startDate ?? ""),
        endDate: String(q.endDate ?? ""),
      })),
    );
    console.info("[quarters] saved", {
      count: quarters.length,
      indexes: quarters.map((q) => q.index),
    });
    return res.json({ quarters, vacations: buildVacations(quarters) });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

