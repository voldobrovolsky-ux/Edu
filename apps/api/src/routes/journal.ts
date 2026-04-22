import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import { journalStore } from "../store/journalStore.js";
import { resolveStudentPlacement } from "../services/schoolStructure.js";
import { computeTimetableSlots, eventTargetsGradeOrGroup, isEventBlockingSlot } from "../services/effectiveLessons.js";
import { isIsoDate } from "../utils/time.js";
import { computeFinalMark } from "../types/journal.js";
import { documentStore } from "../store/documentStore.js";
import { ensureDisciplineFolder } from "../services/disciplineDocuments.js";
import { isDocumentAllowedForJournalLesson, uploadOrReplaceJournalLessonDocument } from "../services/journalLessonDocuments.js";
import { ensureJournalQuarterLessonsMaterialized } from "../services/journalQuarterLessons.js";
import { journalLessonTypeStore } from "../store/journalLessonTypeStore.js";
import { JOURNAL_LESSON_TYPE_COLOR_HEX } from "../types/journalLessonTypeColors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOURNAL_TMP = join(__dirname, "..", "..", "data", "tmp");
if (!existsSync(JOURNAL_TMP)) mkdirSync(JOURNAL_TMP, { recursive: true });
const journalUpload = multer({ dest: JOURNAL_TMP, limits: { fileSize: 25 * 1024 * 1024 } });

export const journalRouter = Router();

function requireTeacherUserId(req: AuthedRequest): string | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  return userStore.findById(userId) ? userId : null;
}

function listStudentsOfGrade(grade: number): Array<{
  userId: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  groupNumber: number;
}> {
  const students = studentProfileStore
    .list()
    .map((p) => {
      const placement = resolveStudentPlacement(p);
      if (!placement || placement.grade !== grade) return null;
      const user = userStore.findById(p.userId);
      if (!user) return null;
      return {
        userId: user.id,
        lastName: user.lastName,
        firstName: user.firstName,
        patronymic: user.patronymic,
        groupNumber: placement.groupNumber,
      };
    })
    .filter(Boolean) as Array<{
    userId: string;
    lastName: string;
    firstName: string;
    patronymic: string;
    groupNumber: number;
  }>;

  return [...students].sort((a, b) => {
    if (a.groupNumber !== b.groupNumber) return a.groupNumber - b.groupNumber;
    const ln = a.lastName.localeCompare(b.lastName, "ru");
    if (ln !== 0) return ln;
    const fn = a.firstName.localeCompare(b.firstName, "ru");
    if (fn !== 0) return fn;
    return a.patronymic.localeCompare(b.patronymic, "ru");
  });
}

function computeAverage(marks: Array<number | null>): number | null {
  const vals = marks.filter((m): m is number => typeof m === "number" && Number.isFinite(m));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function getWeekdayMon1(dateIso: string): 1 | 2 | 3 | 4 | 5 | null {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = ((date.getDay() + 6) % 7) + 1;
  if (weekday < 1 || weekday > 5) return null;
  return weekday as 1 | 2 | 3 | 4 | 5;
}

function getWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Завуч / директор / учётная запись admin — сводный журнал класса по предмету (все группы и учителя). */
function isJournalStaffViewer(userId: string): boolean {
  const u = userStore.findById(userId);
  if (!u) return false;
  if (u.primaryRole === "head_teacher" || u.primaryRole === "director" || u.primaryRole === "sysadmin") return true;
  return u.username.trim().toLowerCase() === "admin";
}

journalRouter.get("/table", requireAuth, (req: AuthedRequest, res) => {
  const viewerUserId = requireTeacherUserId(req);
  if (!viewerUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const grade = Number(req.query.grade);
  const disciplineCode = String(req.query.disciplineCode ?? "");

  if (!isIsoDate(from) || !isIsoDate(to)) return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  if (!Number.isFinite(grade)) return res.status(400).json({ error: "INVALID_GRADE" });
  if (!disciplineCode) return res.status(400).json({ error: "INVALID_DISCIPLINE" });

  const discipline = disciplineStore.findByCode(disciplineCode);
  if (!discipline) return res.status(404).json({ error: "DISCIPLINE_NOT_FOUND" });
  if (discipline.grade !== grade) return res.status(400).json({ error: "DISCIPLINE_GRADE_MISMATCH" });

  const staffViewer = isJournalStaffViewer(viewerUserId);

  let teacherAllowedAllGroups = false;
  let teacherAllowedGroupNumbers: Set<number> | null = null;

  if (staffViewer) {
    const loadsForDisciplineAll = teacherLoadStore.list().filter((l) => l.disciplineCode === disciplineCode && l.grade === grade);
    const teacherIds = [...new Set(loadsForDisciplineAll.map((l) => l.teacherUserId))];
    for (const tid of teacherIds) {
      const loadsForDiscipline = teacherLoadStore
        .listByTeacher(tid)
        .filter((l) => l.disciplineCode === disciplineCode && l.grade === grade);
      if (loadsForDiscipline.length === 0) continue;
      const allowedAllGroups = loadsForDiscipline.some((l) => l.groupNumber == null);
      const allowedGroupNumbers = allowedAllGroups
        ? null
        : new Set(loadsForDiscipline.map((l) => l.groupNumber).filter((x): x is number => x != null));
      ensureJournalQuarterLessonsMaterialized({
        from,
        to,
        grade,
        disciplineCode,
        teacherUserId: tid,
        allowedAllGroups,
        allowedGroupNumbers,
      });
    }
  } else {
    const loadsForDiscipline = teacherLoadStore
      .listByTeacher(viewerUserId)
      .filter((l) => l.disciplineCode === disciplineCode && l.grade === grade);
    if (loadsForDiscipline.length === 0) return res.status(403).json({ error: "TEACHER_LOAD_REQUIRED" });

    teacherAllowedAllGroups = loadsForDiscipline.some((l) => l.groupNumber == null);
    teacherAllowedGroupNumbers = teacherAllowedAllGroups
      ? null
      : new Set(loadsForDiscipline.map((l) => l.groupNumber).filter((x): x is number => x != null));

    ensureJournalQuarterLessonsMaterialized({
      from,
      to,
      grade,
      disciplineCode,
      teacherUserId: viewerUserId,
      allowedAllGroups: teacherAllowedAllGroups,
      allowedGroupNumbers: teacherAllowedGroupNumbers,
    });
  }

  const students = staffViewer
    ? listStudentsOfGrade(grade).map((s) => ({
        userId: s.userId,
        fio: `${s.lastName} ${s.firstName} ${s.patronymic}`.trim(),
        groupNumber: s.groupNumber,
      }))
    : listStudentsOfGrade(grade)
        .filter((s) => teacherAllowedAllGroups || teacherAllowedGroupNumbers!.has(s.groupNumber))
        .map((s) => ({
          userId: s.userId,
          fio: `${s.lastName} ${s.firstName} ${s.patronymic}`.trim(),
          groupNumber: s.groupNumber,
        }));

  const allLessons = timetableLessonStore.listByDateRange({ from, to });
  const events = calendarEventStore
    .listByDateRange({ from, to })
    .filter((e) => e.status !== "cancelled");

  const blockedByLessonId = new Map<string, { id: string; title: string; status: string }>();

  const lessons = allLessons
    .filter((l) => {
      if (l.grade !== grade || l.disciplineCode !== disciplineCode) return false;
      if (staffViewer) return true;
      if (l.teacherUserId !== viewerUserId) return false;
      return teacherAllowedAllGroups || (l.groupNumber != null && teacherAllowedGroupNumbers!.has(l.groupNumber));
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
      const ag = a.groupNumber == null ? 0 : a.groupNumber;
      const bg = b.groupNumber == null ? 0 : b.groupNumber;
      if (ag !== bg) return ag - bg;
      if (staffViewer) {
        const ct = a.teacherUserId.localeCompare(b.teacherUserId);
        if (ct !== 0) return ct;
      }
      return a.id.localeCompare(b.id);
    })
    .map((l) => {
      const dayOfWeek = getWeekdayMon1(l.date);
      if (!dayOfWeek) return l;
      const computedSlots = computeTimetableSlots(dayOfWeek, getWeekStart(l.date));
      const slot = computedSlots.find(
        (item) =>
          item.kind === "lesson" &&
          l.slotIndex >= item.slotIndex &&
          l.slotIndex <= (item.slotIndexEnd ?? item.slotIndex),
      );
      if (!slot) return l;

      const blocker = events.find(
        (ev) =>
          eventTargetsGradeOrGroup({ event: ev, grade: l.grade, groupNumber: l.groupNumber ?? null }) &&
          isEventBlockingSlot({ event: ev, slot }),
      );
      if (blocker) blockedByLessonId.set(l.id, { id: blocker.id, title: blocker.title, status: blocker.status });
      return l;
    });

  const lessonsWithBlocked = lessons.map((l) => ({
    ...l,
    blockedByEvent: blockedByLessonId.get(l.id) ?? null,
    canEdit: staffViewer
      ? l.teacherUserId === viewerUserId &&
        teacherLoadStore.isTeacherAllowedLesson({
          teacherUserId: viewerUserId,
          disciplineCode: l.disciplineCode,
          grade: l.grade,
          groupNumber: l.groupNumber ?? null,
        })
      : true,
  }));

  const lessonIds = lessonsWithBlocked.map((l) => l.id);
  const meta = journalStore.getMetaByLessonIds(lessonIds);
  const marks = journalStore.getMarksByLessonIds(lessonIds);

  const metaByLessonId = new Map(
    meta.map((m) => [
      m.timetableLessonId,
      {
        ...m,
        journalLessonTypeId: m.journalLessonTypeId ?? null,
      },
    ]),
  );
  const marksByKey = new Map(marks.map((m) => [`${m.timetableLessonId}:${m.studentUserId}`, m]));

  const lessonStats = lessons.map((l) => {
    const blockedByEvent = blockedByLessonId.get(l.id);
    if (blockedByEvent) {
      return { lessonId: l.id, presentCount: null, classAverage: null };
    }
    const relevantStudents = l.groupNumber == null ? students : students.filter((s) => s.groupNumber === (l.groupNumber as number));
    const absentCount = relevantStudents.filter((s) => marksByKey.get(`${l.id}:${s.userId}`)?.absent).length;
    const presentCount = Math.max(0, relevantStudents.length - absentCount);
    const avg = computeAverage(relevantStudents.map((s) => marksByKey.get(`${l.id}:${s.userId}`)?.mark ?? null));
    return { lessonId: l.id, presentCount, classAverage: avg };
  });

  const studentAverages = students.map((s) => {
    const perLesson = lessons
      .filter((l) => l.groupNumber == null || l.groupNumber === s.groupNumber)
      .map((l) => (blockedByLessonId.has(l.id) ? null : marksByKey.get(`${l.id}:${s.userId}`)?.mark ?? null));
    const avg = computeAverage(perLesson);
    return {
      studentUserId: s.userId,
      average: avg,
      finalMark: computeFinalMark({ average: avg, gradeRanges: discipline.gradeRanges }),
    };
  });

  return res.json({
    journalView: staffViewer ? "staff" : "teacher",
    discipline: {
      code: discipline.code,
      name: discipline.name,
      grade: discipline.grade,
      documents: discipline.documents,
      gradeRanges: discipline.gradeRanges,
    },
    from,
    to,
    grade,
    disciplineCode,
    students,
    lessons: lessonsWithBlocked,
    lessonMeta: lessons.map((l) => {
      const blockedByEvent = blockedByLessonId.get(l.id);
      const meta =
        metaByLessonId.get(l.id) ??
        { timetableLessonId: l.id, topic: "", attachedDocumentIds: [], journalLessonTypeId: null as string | null };
      if (!blockedByEvent) return meta;
      return { ...meta, topic: blockedByEvent.title, attachedDocumentIds: [] };
    }),
    lessonTypes: journalLessonTypeStore
      .list()
      .filter((t) => t.disciplineCodes.length === 0 || t.disciplineCodes.includes(disciplineCode))
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        colorKey: t.colorKey,
        colorHex: JOURNAL_LESSON_TYPE_COLOR_HEX[t.colorKey],
      })),
    marks: lessons.flatMap((l) =>
      students.map((s) => {
        const m = marksByKey.get(`${l.id}:${s.userId}`);
        const blocked = blockedByLessonId.has(l.id);
        const applicable = !blocked && (l.groupNumber == null || l.groupNumber === s.groupNumber);
        return {
          timetableLessonId: l.id,
          studentUserId: s.userId,
          mark: applicable ? (m?.mark ?? null) : null,
          absent: applicable ? (m?.absent ?? false) : false,
          applicable,
        };
      }),
    ),
    lessonStats,
    studentAverages,
  });
});

journalRouter.put("/marks", requireAuth, (req: AuthedRequest, res) => {
  const teacherUserId = requireTeacherUserId(req);
  if (!teacherUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const { timetableLessonId, studentUserId, mark, absent } = req.body ?? {};
  if (typeof timetableLessonId !== "string" || typeof studentUserId !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  if (mark !== undefined && mark !== null) {
    if (!Number.isInteger(mark) || mark < 1 || mark > 5) return res.status(400).json({ error: "INVALID_MARK" });
  }

  const lesson = timetableLessonStore.findById(timetableLessonId);
  if (!lesson) return res.status(404).json({ error: "LESSON_NOT_FOUND" });
  if (lesson.teacherUserId !== teacherUserId) return res.status(403).json({ error: "FORBIDDEN" });

  const discipline = disciplineStore.findByCode(lesson.disciplineCode);
  if (!discipline) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  const loadOk = teacherLoadStore.isTeacherAllowedLesson({
    teacherUserId,
    disciplineCode: lesson.disciplineCode,
    grade: lesson.grade,
    groupNumber: lesson.groupNumber ?? null,
  });
  if (!loadOk) return res.status(403).json({ error: "TEACHER_LOAD_REQUIRED" });

  const saved = journalStore.upsertStudentMark({
    timetableLessonId,
    studentUserId,
    mark: mark === undefined ? undefined : mark,
    absent: absent === undefined ? undefined : Boolean(absent),
  });
  return res.json({ mark: saved });
});

journalRouter.put("/lesson-meta", requireAuth, (req: AuthedRequest, res) => {
  const teacherUserId = requireTeacherUserId(req);
  if (!teacherUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const { timetableLessonId, topic, attachedDocumentIds, journalLessonTypeId } = req.body ?? {};
  if (typeof timetableLessonId !== "string") return res.status(400).json({ error: "INVALID_INPUT" });

  const lesson = timetableLessonStore.findById(timetableLessonId);
  if (!lesson) return res.status(404).json({ error: "LESSON_NOT_FOUND" });
  if (lesson.teacherUserId !== teacherUserId) return res.status(403).json({ error: "FORBIDDEN" });

  const disciplineRaw = disciplineStore.findByCode(lesson.disciplineCode);
  if (!disciplineRaw) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  ensureDisciplineFolder(disciplineRaw);
  const discipline = disciplineStore.findByCode(lesson.disciplineCode);
  if (!discipline) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });

  const loadOk = teacherLoadStore.isTeacherAllowedLesson({
    teacherUserId,
    disciplineCode: lesson.disciplineCode,
    grade: lesson.grade,
    groupNumber: lesson.groupNumber ?? null,
  });
  if (!loadOk) return res.status(403).json({ error: "TEACHER_LOAD_REQUIRED" });

  if (journalLessonTypeId !== undefined && journalLessonTypeId != null && String(journalLessonTypeId).trim() !== "") {
    const jlt = journalLessonTypeStore.findById(String(journalLessonTypeId));
    if (!jlt) return res.status(400).json({ error: "JOURNAL_LESSON_TYPE_NOT_FOUND" });
    if (jlt.disciplineCodes.length > 0 && !jlt.disciplineCodes.includes(discipline.code)) {
      return res.status(400).json({ error: "JOURNAL_LESSON_TYPE_DISCIPLINE_MISMATCH" });
    }
  }

  let docIds: string[] | undefined = undefined;
  if (attachedDocumentIds !== undefined) {
    if (!Array.isArray(attachedDocumentIds)) return res.status(400).json({ error: "INVALID_DOCS" });
    const raw = attachedDocumentIds.filter((x: unknown): x is string => typeof x === "string");
    docIds = raw.filter((id) => isDocumentAllowedForJournalLesson({ docId: id, discipline }));

    const existingMeta = journalStore.getMetaByLessonIds([timetableLessonId])[0];
    if (existingMeta) {
      const before = new Set(existingMeta.attachedDocumentIds ?? []);
      const after = new Set(docIds);
      for (const id of before) {
        if (!after.has(id)) {
          const doc = documentStore.findById(id);
          if (doc?.tags.periods.some((p) => p.startsWith("jl:"))) {
            try {
              documentStore.delete(id);
            } catch {
              // ignore
            }
          }
        }
      }
    }
  }

  const saved = journalStore.upsertLessonMeta({
    timetableLessonId,
    topic: topic !== undefined ? String(topic) : undefined,
    attachedDocumentIds: docIds,
    journalLessonTypeId:
      journalLessonTypeId === undefined
        ? undefined
        : journalLessonTypeId == null || String(journalLessonTypeId).trim() === ""
          ? null
          : String(journalLessonTypeId),
  });
  return res.json({ meta: saved });
});

journalRouter.post("/lesson-documents", requireAuth, journalUpload.single("file"), (req: AuthedRequest, res) => {
  const teacherUserId = requireTeacherUserId(req);
  if (!teacherUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "FILE_REQUIRED" });

  const timetableLessonId = String(req.body?.timetableLessonId ?? "");
  const journalDocumentTypeId = String(req.body?.journalDocumentTypeId ?? "");
  const disciplineEntityId = String(req.body?.disciplineEntityId ?? req.body?.disciplineCode ?? "").trim();

  if (!timetableLessonId || !journalDocumentTypeId) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const lesson = timetableLessonStore.findById(timetableLessonId);
  if (!lesson) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(404).json({ error: "LESSON_NOT_FOUND" });
  }
  if (lesson.teacherUserId !== teacherUserId) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  if (disciplineEntityId && disciplineEntityId !== lesson.disciplineCode) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: "DISCIPLINE_MISMATCH" });
  }

  const disciplineRaw = disciplineStore.findByCode(lesson.disciplineCode);
  if (!disciplineRaw) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  }

  const loadOk = teacherLoadStore.isTeacherAllowedLesson({
    teacherUserId,
    disciplineCode: lesson.disciplineCode,
    grade: lesson.grade,
    groupNumber: lesson.groupNumber ?? null,
  });
  if (!loadOk) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    return res.status(403).json({ error: "TEACHER_LOAD_REQUIRED" });
  }

  try {
    const result = uploadOrReplaceJournalLessonDocument({
      discipline: disciplineRaw,
      lesson,
      journalDocumentTypeId,
      createdByUserId: teacherUserId,
      tempPath: file.path,
      uploadedOriginalName: file.originalname || "upload.bin",
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
    });
    return res.status(201).json(result);
  } catch (e) {
    try {
      unlinkSync(file.path);
    } catch {
      // ignore
    }
    const msg = (e as Error).message;
    if (msg === "JOURNAL_DOC_TYPE_NOT_FOUND") return res.status(404).json({ error: msg });
    return res.status(400).json({ error: msg });
  }
});

journalRouter.delete("/lesson-documents/:documentId", requireAuth, (req: AuthedRequest, res) => {
  const teacherUserId = requireTeacherUserId(req);
  if (!teacherUserId) return res.status(401).json({ error: "UNAUTHORIZED" });

  const documentId = String(req.params.documentId ?? "");
  const timetableLessonId = String(req.query.timetableLessonId ?? "");
  if (!documentId || !timetableLessonId) return res.status(400).json({ error: "INVALID_INPUT" });

  const lesson = timetableLessonStore.findById(timetableLessonId);
  if (!lesson) return res.status(404).json({ error: "LESSON_NOT_FOUND" });
  if (lesson.teacherUserId !== teacherUserId) return res.status(403).json({ error: "FORBIDDEN" });

  const disciplineRaw = disciplineStore.findByCode(lesson.disciplineCode);
  if (!disciplineRaw) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });
  ensureDisciplineFolder(disciplineRaw);
  const discipline = disciplineStore.findByCode(lesson.disciplineCode);
  if (!discipline) return res.status(400).json({ error: "DISCIPLINE_NOT_FOUND" });

  const loadOk = teacherLoadStore.isTeacherAllowedLesson({
    teacherUserId,
    disciplineCode: lesson.disciplineCode,
    grade: lesson.grade,
    groupNumber: lesson.groupNumber ?? null,
  });
  if (!loadOk) return res.status(403).json({ error: "TEACHER_LOAD_REQUIRED" });

  const doc = documentStore.findById(documentId);
  if (!doc) return res.status(404).json({ error: "DOCUMENT_NOT_FOUND" });

  const metaList = journalStore.getMetaByLessonIds([timetableLessonId]);
  const meta = metaList[0];
  const prevIds = meta?.attachedDocumentIds ?? [];
  if (!prevIds.includes(documentId)) return res.status(400).json({ error: "DOCUMENT_NOT_ATTACHED_TO_LESSON" });

  if (!isDocumentAllowedForJournalLesson({ docId: documentId, discipline })) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const nextIds = prevIds.filter((id) => id !== documentId);
  journalStore.upsertLessonMeta({ timetableLessonId, attachedDocumentIds: nextIds });

  const generatedByJournal = doc.tags.periods.some((p) => p.startsWith("jl:"));
  if (generatedByJournal) {
    try {
      documentStore.delete(documentId);
    } catch {
      // ignore
    }
  }

  return res.json({ ok: true });
});

