import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { parentChildStore } from "../store/parentChildStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { resolveStudentPlacement } from "../services/schoolStructure.js";
import { isIsoDate } from "../utils/time.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { journalStore } from "../store/journalStore.js";
import { computeTimetableSlots, listEffectiveLessons } from "../services/effectiveLessons.js";
import { computeFinalMark } from "../types/journal.js";

export const diaryRouter = Router();

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

function computeAverage(marks: Array<number | null>): number | null {
  const vals = marks.filter((m): m is number => typeof m === "number" && Number.isFinite(m));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function requireUser(req: AuthedRequest) {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const u = userStore.findById(userId);
  if (!u) return null;
  return { userId: u.id, primaryRole: u.primaryRole, secondaryRoles: u.secondaryRoles };
}

function canAccessStudent(args: {
  viewer: { userId: string; primaryRole: string; secondaryRoles: string[] };
  studentUserId: string;
}): boolean {
  if (args.viewer.userId === args.studentUserId) return true;
  const isParent = args.viewer.primaryRole === "parent" || args.viewer.secondaryRoles.includes("parent");
  if (!isParent) return false;
  return parentChildStore.isLinked({ parentUserId: args.viewer.userId, studentUserId: args.studentUserId });
}

function isHeadTeacher(viewer: { primaryRole: string }): boolean {
  return (
    viewer.primaryRole === "head_teacher" ||
    viewer.primaryRole === "director" ||
    viewer.primaryRole === "sysadmin"
  );
}

function resolveStudentGradeGroup(studentUserId: string): { grade: number; groupNumber: number } | null {
  const profile = studentProfileStore.findByUserId(studentUserId);
  if (!profile) return null;
  const placement = resolveStudentPlacement(profile);
  if (!placement) return null;
  return { grade: placement.grade, groupNumber: placement.groupNumber };
}

diaryRouter.get("/panels", requireAuth, (req: AuthedRequest, res) => {
  const viewer = requireUser(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });

  const isParent = viewer.primaryRole === "parent" || viewer.secondaryRoles.includes("parent");
  if (!isParent) return res.status(403).json({ error: "PARENT_ROLE_REQUIRED" });

  const links = parentChildStore.listByParent(viewer.userId);
  const panels = links
    .map((l) => {
      const student = userStore.findById(l.studentUserId);
      if (!student) return null;
      const gg = resolveStudentGradeGroup(student.id);
      if (!gg) return null;
      return {
        studentUserId: student.id,
        fio: `${student.lastName} ${student.firstName} ${student.patronymic}`.trim(),
        grade: gg.grade,
        groupNumber: gg.groupNumber,
      };
    })
    .filter(Boolean) as Array<{ studentUserId: string; fio: string; grade: number; groupNumber: number }>;

  panels.sort((a, b) => a.fio.localeCompare(b.fio, "ru"));
  return res.json({ panels });
});

/**
 * Временный административный эндпоинт: привязка ребёнка к родителю.
 * Нужен, чтобы можно было проверять дневник родителя на демо-данных.
 */
diaryRouter.post("/links", requireAuth, (req: AuthedRequest, res) => {
  const viewer = requireUser(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!isHeadTeacher(viewer)) return res.status(403).json({ error: "FORBIDDEN" });

  const { id, parentUserId, studentUserId } = req.body ?? {};
  if (typeof id !== "string" || typeof parentUserId !== "string" || typeof studentUserId !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  if (!userStore.findById(parentUserId)) return res.status(400).json({ error: "PARENT_NOT_FOUND" });
  if (!userStore.findById(studentUserId)) return res.status(400).json({ error: "STUDENT_NOT_FOUND" });
  if (!studentProfileStore.findByUserId(studentUserId)) return res.status(400).json({ error: "STUDENT_PROFILE_NOT_FOUND" });

  const link = parentChildStore.upsert({ id, parentUserId, studentUserId });
  return res.status(201).json({ link });
});

diaryRouter.get("/view", requireAuth, (req: AuthedRequest, res) => {
  const viewer = requireUser(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });

  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const requestedStudentUserId = req.query.studentUserId != null ? String(req.query.studentUserId) : null;
  if (!isIsoDate(from) || !isIsoDate(to)) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const studentUserId = requestedStudentUserId ?? viewer.userId;
  if (!studentUserId) return res.status(400).json({ error: "STUDENT_REQUIRED" });

  if (!canAccessStudent({ viewer, studentUserId })) return res.status(403).json({ error: "FORBIDDEN" });

  const student = userStore.findById(studentUserId);
  if (!student) return res.status(404).json({ error: "STUDENT_NOT_FOUND" });

  const gg = resolveStudentGradeGroup(studentUserId);
  if (!gg) return res.status(400).json({ error: "STUDENT_PROFILE_NOT_FOUND" });

  const effective = listEffectiveLessons({ from, to })
    .filter((l) => l.grade === gg.grade)
    .filter((l) => l.groupNumber == null || l.groupNumber === gg.groupNumber)
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.slotIndex - b.slotIndex));

  const lessonIds = effective.map((l) => l.id);
  const marks = journalStore.getMarksByLessonIds(lessonIds).filter((m) => m.studentUserId === studentUserId);
  const markByLessonId = new Map(marks.map((m) => [m.timetableLessonId, m]));

  const rows = effective.map((l) => {
    const d = disciplineStore.findByCode(l.disciplineCode);
    const m = markByLessonId.get(l.id);
    return {
      timetableLessonId: l.id,
      date: l.date,
      slotIndex: l.slotIndex,
      disciplineCode: l.disciplineCode,
      disciplineName: d?.name ?? l.disciplineCode,
      mark: m?.mark ?? null,
      absent: m?.absent ?? false,
    };
  });

  let daySlots:
    | Array<{
        slotIndex: number;
        slotIndexEnd: number;
        timetableLessonId: string | null;
        disciplineCode: string | null;
        disciplineName: string | null;
        mark: number | null;
        absent: boolean;
      }>
    | undefined;

  if (from === to) {
    const dayOfWeek = getWeekdayMon1(from);
    if (dayOfWeek) {
      const weekStart = getWeekStart(from);
      const computed = computeTimetableSlots(dayOfWeek, weekStart).filter((s) => s.kind === "lesson");
      const dayLessons = effective.filter((l) => l.date === from);
      daySlots = computed.map((slot) => {
        const l = dayLessons.find(
          (lesson) =>
            lesson.slotIndex >= slot.slotIndex && lesson.slotIndex <= (slot.slotIndexEnd ?? slot.slotIndex),
        );
        if (!l) {
          return {
            slotIndex: slot.slotIndex,
            slotIndexEnd: slot.slotIndexEnd ?? slot.slotIndex,
            timetableLessonId: null,
            disciplineCode: null,
            disciplineName: null,
            mark: null,
            absent: false,
          };
        }
        const d = disciplineStore.findByCode(l.disciplineCode);
        const m = markByLessonId.get(l.id);
        return {
          slotIndex: slot.slotIndex,
          slotIndexEnd: slot.slotIndexEnd ?? slot.slotIndex,
          timetableLessonId: l.id,
          disciplineCode: l.disciplineCode,
          disciplineName: d?.name ?? l.disciplineCode,
          mark: m?.mark ?? null,
          absent: m?.absent ?? false,
        };
      });
    }
  }

  return res.json({
    from,
    to,
    student: {
      userId: student.id,
      fio: `${student.lastName} ${student.firstName} ${student.patronymic}`.trim(),
      grade: gg.grade,
      groupNumber: gg.groupNumber,
    },
    lessons: rows,
    daySlots,
  });
});

/**
 * Итоговые средние баллы по предметам за период (та же логика усреднения, что в журнале).
 */
diaryRouter.get("/final-grades", requireAuth, (req: AuthedRequest, res) => {
  const viewer = requireUser(req);
  if (!viewer) return res.status(401).json({ error: "UNAUTHORIZED" });

  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  const requestedStudentUserId = req.query.studentUserId != null ? String(req.query.studentUserId) : null;
  if (!isIsoDate(from) || !isIsoDate(to)) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const studentUserId = requestedStudentUserId ?? viewer.userId;
  if (!studentUserId) return res.status(400).json({ error: "STUDENT_REQUIRED" });

  if (!canAccessStudent({ viewer, studentUserId })) return res.status(403).json({ error: "FORBIDDEN" });

  const gg = resolveStudentGradeGroup(studentUserId);
  if (!gg) return res.status(400).json({ error: "STUDENT_PROFILE_NOT_FOUND" });

  const effective = listEffectiveLessons({ from, to })
    .filter((l) => l.grade === gg.grade)
    .filter((l) => l.groupNumber == null || l.groupNumber === gg.groupNumber);

  const lessonIds = effective.map((l) => l.id);
  const marks = journalStore.getMarksByLessonIds(lessonIds).filter((m) => m.studentUserId === studentUserId);
  const markByLessonId = new Map(marks.map((m) => [m.timetableLessonId, m]));

  const disciplines = disciplineStore.listByGrade(gg.grade);
  const subjects = disciplines.map((d) => {
    const lessonsForDisc = effective.filter((l) => l.disciplineCode === d.code);
    const perLessonMarks = lessonsForDisc.map((lesson) => {
      const m = markByLessonId.get(lesson.id);
      if (!m || m.absent) return null;
      return m.mark;
    });
    const average = computeAverage(perLessonMarks);
    const finalMark = computeFinalMark({ average, gradeRanges: d.gradeRanges });
    return {
      disciplineCode: d.code,
      disciplineName: d.name,
      average,
      finalMark,
    };
  });

  return res.json({
    from,
    to,
    studentUserId,
    subjects,
  });
});

