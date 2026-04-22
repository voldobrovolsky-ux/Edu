import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { classStore } from "../store/classStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { candidatesStore } from "../store/candidatesStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import { journalStore } from "../store/journalStore.js";
import { journalDocumentTypeStore } from "../store/journalDocumentTypeStore.js";
import { revisionJobStore } from "../store/revisionJobStore.js";
import { defaultLessonDateBoundsForScheduledAt } from "../services/revisionLessonBounds.js";
import { resolveStudentPlacement } from "../services/schoolStructure.js";
import { listEffectiveLessons } from "../services/effectiveLessons.js";
import { isIsoDate } from "../utils/time.js";
import { computeFinalMark } from "../types/journal.js";
import type { TimetableLesson } from "../types/timetable.js";
import type { Discipline } from "../types/school.js";
import {
  computeHiringAnalytics,
  computeTeacherCadreProfile,
  computeProjectAnalytics,
  computeTeacherAnalyticalProfile,
  computeTeacherQualityAnalytics,
  evaluateCandidateRecommendation,
  buildTeacherPatchFromCandidate,
  buildTeacherPatchFromManualBranch,
  makeTeacherQualityPatch,
} from "../services/teacherAnalytics.js";

export const analyticsRouter = Router();

type RoleScope =
  | { role: "director" | "head_teacher" }
  | { role: "teacher"; teacherUserId: string };

function requireAnalyticsScope(req: AuthedRequest): RoleScope | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const user = userStore.findById(userId);
  if (!user) return null;
  if (user.primaryRole === "director" || user.primaryRole === "head_teacher") return { role: user.primaryRole };
  if (user.primaryRole === "sysadmin") return { role: "head_teacher" };
  if (user.primaryRole === "teacher") return { role: "teacher", teacherUserId: userId };
  return null;
}

/** Ревизии документации / журнала — только директор или завуч. */
function requireAnalyticsDirectorOrHead(req: AuthedRequest): { userId: string } | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const user = userStore.findById(userId);
  if (!user) return null;
  if (user.primaryRole === "director" || user.primaryRole === "head_teacher" || user.primaryRole === "sysadmin")
    return { userId };
  return null;
}

function listStudentsByGrade(grade: number): Array<{ userId: string; fio: string; groupNumber: number }> {
  const students = studentProfileStore
    .list()
    .map((p) => {
      const placement = resolveStudentPlacement(p);
      if (!placement || placement.grade !== grade) return null;
      const user = userStore.findById(p.userId);
      if (!user) return null;
      return {
        userId: user.id,
        fio: `${user.lastName} ${user.firstName} ${user.patronymic}`.trim(),
        groupNumber: placement.groupNumber,
      };
    })
    .filter(Boolean) as Array<{ userId: string; fio: string; groupNumber: number }>;

  return [...students].sort((a, b) => {
    if (a.groupNumber !== b.groupNumber) return a.groupNumber - b.groupNumber;
    return a.fio.localeCompare(b.fio, "ru");
  });
}

function avg(values: Array<number | null | undefined>): number | null {
  const vals = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pct(args: { present: number; total: number }): number | null {
  if (!Number.isFinite(args.total) || args.total <= 0) return null;
  return (args.present / args.total) * 100;
}

type LessonKey = string; // `${lessonId}:${studentUserId}`

function buildMarksIndex(marks: Array<{ timetableLessonId: string; studentUserId: string; mark: number | null; absent: boolean }>) {
  const byKey = new Map<LessonKey, { mark: number | null; absent: boolean }>();
  for (const m of marks) byKey.set(`${m.timetableLessonId}:${m.studentUserId}`, { mark: m.mark, absent: m.absent });
  return byKey;
}

function aggregateForLessons(args: {
  lessons: TimetableLesson[];
  onlyGrades?: number[] | null;
  onlyDisciplineCodes?: string[] | null;
  onlyTeacherUserId?: string | null;
}): {
  school: { averageMark: number | null; attendancePercent: number | null };
  byGrade: Array<{ grade: number; averageMark: number | null; attendancePercent: number | null }>;
  byDiscipline: Array<{ disciplineCode: string; disciplineName: string; averageMark: number | null; attendancePercent: number | null }>;
  byGradeDiscipline: Array<{
    grade: number;
    disciplineCode: string;
    disciplineName: string;
    averageMark: number | null;
    attendancePercent: number | null;
  }>;
} {
  let lessons = args.lessons;
  if (args.onlyTeacherUserId) lessons = lessons.filter((l) => l.teacherUserId === args.onlyTeacherUserId);
  if (args.onlyGrades?.length) {
    const set = new Set(args.onlyGrades);
    lessons = lessons.filter((l) => set.has(l.grade));
  }
  if (args.onlyDisciplineCodes?.length) {
    const set = new Set(args.onlyDisciplineCodes);
    lessons = lessons.filter((l) => set.has(l.disciplineCode));
  }

  const lessonIds = lessons.map((l) => l.id);
  const marks = journalStore.getMarksByLessonIds(lessonIds);
  const marksByKey = buildMarksIndex(marks);

  const studentsByGrade = new Map<number, Array<{ userId: string; fio: string; groupNumber: number }>>();
  for (const c of classStore.list()) studentsByGrade.set(c.grade, listStudentsByGrade(c.grade));

  const perf = {
    sum: 0,
    cnt: 0,
    present: 0,
    total: 0,
  };

  const perfByGrade = new Map<number, typeof perf>();
  const perfByDiscipline = new Map<string, typeof perf>();
  const perfByGradeDiscipline = new Map<string, typeof perf>(); // `${grade}:${disciplineCode}`

  function getAgg(map: Map<any, any>, key: any) {
    const existing = map.get(key);
    if (existing) return existing;
    const init = { sum: 0, cnt: 0, present: 0, total: 0 };
    map.set(key, init);
    return init;
  }

  for (const lesson of lessons) {
    const students = studentsByGrade.get(lesson.grade) ?? [];
    const applicableStudents =
      lesson.groupNumber == null ? students : students.filter((s) => s.groupNumber === (lesson.groupNumber as number));

    for (const st of applicableStudents) {
      const cell = marksByKey.get(`${lesson.id}:${st.userId}`);
      const absent = cell?.absent ?? false;
      const mark = absent ? null : (cell?.mark ?? null);

      perf.total += 1;
      const aGrade = getAgg(perfByGrade, lesson.grade);
      aGrade.total += 1;
      const aDis = getAgg(perfByDiscipline, lesson.disciplineCode);
      aDis.total += 1;
      const aGD = getAgg(perfByGradeDiscipline, `${lesson.grade}:${lesson.disciplineCode}`);
      aGD.total += 1;

      if (!absent) {
        perf.present += 1;
        aGrade.present += 1;
        aDis.present += 1;
        aGD.present += 1;
      }

      if (typeof mark === "number" && Number.isFinite(mark)) {
        perf.sum += mark;
        perf.cnt += 1;
        aGrade.sum += mark;
        aGrade.cnt += 1;
        aDis.sum += mark;
        aDis.cnt += 1;
        aGD.sum += mark;
        aGD.cnt += 1;
      }
    }
  }

  const disciplines = disciplineStore.list();
  const disciplineByCode = new Map(disciplines.map((d) => [d.code, d] as const));

  const byGrade = [...perfByGrade.entries()]
    .map(([grade, a]) => ({
      grade,
      averageMark: a.cnt ? a.sum / a.cnt : null,
      attendancePercent: pct({ present: a.present, total: a.total }),
    }))
    .sort((a, b) => a.grade - b.grade);

  const byDiscipline = [...perfByDiscipline.entries()]
    .map(([disciplineCode, a]) => {
      const d = disciplineByCode.get(disciplineCode);
      return {
        disciplineCode,
        disciplineName: d?.name ?? disciplineCode,
        averageMark: a.cnt ? a.sum / a.cnt : null,
        attendancePercent: pct({ present: a.present, total: a.total }),
      };
    })
    .sort((a, b) => a.disciplineName.localeCompare(b.disciplineName, "ru"));

  const byGradeDiscipline = [...perfByGradeDiscipline.entries()]
    .map(([key, a]) => {
      const [g, disciplineCode] = String(key).split(":");
      const grade = Number(g);
      const d = disciplineByCode.get(disciplineCode);
      return {
        grade,
        disciplineCode,
        disciplineName: d?.name ?? disciplineCode,
        averageMark: a.cnt ? a.sum / a.cnt : null,
        attendancePercent: pct({ present: a.present, total: a.total }),
      };
    })
    .filter((x) => Number.isFinite(x.grade))
    .sort((a, b) => (a.grade !== b.grade ? a.grade - b.grade : a.disciplineName.localeCompare(b.disciplineName, "ru")));

  return {
    school: {
      averageMark: perf.cnt ? perf.sum / perf.cnt : null,
      attendancePercent: pct({ present: perf.present, total: perf.total }),
    },
    byGrade,
    byDiscipline,
    byGradeDiscipline,
  };
}

function computeTeacherPanels(args: {
  teacherUserId: string;
  from: string;
  to: string;
  lessons: TimetableLesson[];
}): Array<{
  grade: number;
  disciplineCode: string;
  disciplineName: string;
  averageMark: number | null;
  attendancePercent: number | null;
  students: Array<{ studentUserId: string; fio: string; groupNumber: number; average: number | null; finalMark: number | null; attendancePercent: number | null }>;
}> {
  const loads = teacherLoadStore.listByTeacher(args.teacherUserId);
  const allowedCodes = new Set(loads.map((l) => l.disciplineCode));

  const lessons = args.lessons
    .filter((l) => l.teacherUserId === args.teacherUserId)
    .filter((l) => allowedCodes.has(l.disciplineCode))
    .filter((l) =>
      teacherLoadStore.isTeacherAllowedLesson({
        teacherUserId: args.teacherUserId,
        disciplineCode: l.disciplineCode,
        grade: l.grade,
        groupNumber: l.groupNumber ?? null,
      }),
    )
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.slotIndex - b.slotIndex));

  const lessonIds = lessons.map((l) => l.id);
  const marks = journalStore.getMarksByLessonIds(lessonIds);
  const marksByKey = buildMarksIndex(marks);

  const disciplineByCode = new Map(disciplineStore.list().map((d) => [d.code, d] as const));

  const byPanel = new Map<string, { grade: number; disciplineCode: string; discipline: Discipline | null; lessons: TimetableLesson[] }>();
  for (const lesson of lessons) {
    const key = `${lesson.grade}:${lesson.disciplineCode}`;
    const existing = byPanel.get(key);
    if (existing) {
      existing.lessons.push(lesson);
    } else {
      byPanel.set(key, {
        grade: lesson.grade,
        disciplineCode: lesson.disciplineCode,
        discipline: disciplineByCode.get(lesson.disciplineCode) ?? null,
        lessons: [lesson],
      });
    }
  }

  const panels: ReturnType<typeof computeTeacherPanels> = [];
  for (const p of [...byPanel.values()].sort((a, b) => (a.grade !== b.grade ? a.grade - b.grade : a.disciplineCode.localeCompare(b.disciplineCode)))) {
    const students = listStudentsByGrade(p.grade);
    const relevantLessons = p.lessons;

    // panel aggregates
    let sum = 0;
    let cnt = 0;
    let present = 0;
    let total = 0;

    const studentRows = students.map((s) => {
      const marksForAvg: Array<number | null> = [];
      let stPresent = 0;
      let stTotal = 0;

      for (const l of relevantLessons) {
        const applicable = l.groupNumber == null || l.groupNumber === s.groupNumber;
        if (!applicable) continue;
        stTotal += 1;
        total += 1;
        const cell = marksByKey.get(`${l.id}:${s.userId}`);
        const absent = cell?.absent ?? false;
        const mark = absent ? null : (cell?.mark ?? null);
        if (!absent) {
          stPresent += 1;
          present += 1;
        }
        marksForAvg.push(mark);
        if (typeof mark === "number" && Number.isFinite(mark)) {
          sum += mark;
          cnt += 1;
        }
      }

      const average = avg(marksForAvg);
      const finalMark =
        p.discipline?.gradeRanges != null ? computeFinalMark({ average, gradeRanges: p.discipline.gradeRanges }) : null;
      return {
        studentUserId: s.userId,
        fio: s.fio,
        groupNumber: s.groupNumber,
        average,
        finalMark,
        attendancePercent: pct({ present: stPresent, total: stTotal }),
      };
    });

    panels.push({
      grade: p.grade,
      disciplineCode: p.disciplineCode,
      disciplineName: p.discipline?.name ?? p.disciplineCode,
      averageMark: cnt ? sum / cnt : null,
      attendancePercent: pct({ present, total }),
      students: studentRows,
    });
  }

  return panels;
}

function riskZones(args: {
  byGrade: Array<{ grade: number; averageMark: number | null; attendancePercent: number | null }>;
  byDiscipline: Array<{ disciplineCode: string; disciplineName: string; averageMark: number | null; attendancePercent: number | null }>;
  minAverage: number;
  minAttendancePercent: number;
}) {
  return {
    thresholds: { minAverage: args.minAverage, minAttendancePercent: args.minAttendancePercent },
    lowAverage: {
      grades: args.byGrade.filter((x) => x.averageMark != null && x.averageMark < args.minAverage),
      disciplines: args.byDiscipline.filter((x) => x.averageMark != null && x.averageMark < args.minAverage),
    },
    lowAttendance: {
      grades: args.byGrade.filter((x) => x.attendancePercent != null && x.attendancePercent < args.minAttendancePercent),
      disciplines: args.byDiscipline.filter(
        (x) => x.attendancePercent != null && x.attendancePercent < args.minAttendancePercent,
      ),
    },
  };
}

function parseFromTo(req: AuthedRequest): { from: string; to: string } | null {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!isIsoDate(from) || !isIsoDate(to)) return null;
  return { from, to };
}

function isDirectorLike(scope: RoleScope): boolean {
  return scope.role === "director" || scope.role === "head_teacher";
}

analyticsRouter.get("/hiring", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });
  const range = parseFromTo(req);
  if (!range) return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  const subject = req.query.subject != null ? String(req.query.subject) : null;
  const level = req.query.level != null ? String(req.query.level) : null;
  return res.json(computeHiringAnalytics({ ...range, subject, level }));
});

analyticsRouter.get("/cadre-profile", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });

  const fromRaw = typeof req.query.from === "string" ? req.query.from : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to : "";

  const from = fromRaw && isIsoDate(fromRaw) ? fromRaw : undefined;
  const to = toRaw && isIsoDate(toRaw) ? toRaw : undefined;

  const subject = req.query.subject != null ? String(req.query.subject) : null;
  const level = req.query.level != null ? String(req.query.level) : null;

  return res.json(
    computeTeacherCadreProfile({
      from,
      to,
      subject,
      level,
    }),
  );
});

analyticsRouter.get("/quality", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });
  return res.json(computeTeacherQualityAnalytics());
});

analyticsRouter.get("/projects", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });
  const range = parseFromTo(req);
  if (!range) return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  const teacherUserId =
    scope.role === "teacher"
      ? scope.teacherUserId
      : req.query.teacherUserId != null
        ? String(req.query.teacherUserId)
        : null;
  return res.json(computeProjectAnalytics({ ...range, teacherUserId }));
});

analyticsRouter.get("/teacher-profile/:teacherUserId", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });
  const range = parseFromTo(req);
  if (!range) return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  const teacherUserId =
    scope.role === "teacher" ? scope.teacherUserId : String(req.params.teacherUserId ?? "");
  if (!teacherUserId) return res.status(400).json({ error: "INVALID_TEACHER_ID" });
  if (scope.role === "teacher" && scope.teacherUserId !== teacherUserId) return res.status(403).json({ error: "FORBIDDEN" });
  const profile = computeTeacherAnalyticalProfile({ ...range, teacherUserId });
  if (!profile) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json(profile);
});

analyticsRouter.post("/teacher-profile/:teacherUserId/quality", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });
  const teacherUserId = String(req.params.teacherUserId ?? "");
  const teacher = userStore.findById(teacherUserId);
  if (!teacher) return res.status(404).json({ error: "NOT_FOUND" });
  const body = req.body ?? {};
  const teacherQuality = makeTeacherQualityPatch({
    teacher,
    interviewDiscipline0to5:
      body.interviewDiscipline0to5 == null ? undefined : Number(body.interviewDiscipline0to5),
    interviewParents0to5: body.interviewParents0to5 == null ? undefined : Number(body.interviewParents0to5),
    lessonObservation:
      body.lessonObservation && typeof body.lessonObservation === "object"
        ? {
            date: String(body.lessonObservation.date ?? new Date().toISOString().slice(0, 10)),
            score0to5: Number(body.lessonObservation.score0to5 ?? 0),
            comment: body.lessonObservation.comment != null ? String(body.lessonObservation.comment) : undefined,
          }
        : null,
    diagnostic:
      body.diagnostic && typeof body.diagnostic === "object"
        ? {
            date: String(body.diagnostic.date ?? new Date().toISOString().slice(0, 10)),
            successPercent: Number(body.diagnostic.successPercent ?? 0),
            comment: body.diagnostic.comment != null ? String(body.diagnostic.comment) : undefined,
          }
        : null,
  });
  const updated = userStore.updateById(teacherUserId, { teacherQuality });
  return res.json({ teacher: updated });
});

analyticsRouter.post("/teacher-profile/:teacherUserId/attach-candidate", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });
  const teacherUserId = String(req.params.teacherUserId ?? "");
  if (!teacherUserId) return res.status(400).json({ error: "INVALID_TEACHER_ID" });

  const teacher = userStore.findById(teacherUserId);
  if (!teacher) return res.status(404).json({ error: "NOT_FOUND" });

  const body = req.body ?? {};
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  if (!candidateId.trim()) return res.status(400).json({ error: "CANDIDATE_ID_REQUIRED" });

  const candidate = candidatesStore.findById(candidateId.trim());
  if (!candidate) return res.status(404).json({ error: "CANDIDATE_NOT_FOUND" });
  if (!candidate.application) return res.status(400).json({ error: "APPLICATION_REQUIRED" });

  const patch = buildTeacherPatchFromCandidate(candidate);
  const updated = userStore.updateById(teacherUserId, patch);
  return res.json({ teacher: updated });
});

analyticsRouter.post("/teacher-profile/:teacherUserId/set-manual-branch", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });
  const teacherUserId = String(req.params.teacherUserId ?? "");
  if (!teacherUserId) return res.status(400).json({ error: "INVALID_TEACHER_ID" });

  const teacher = userStore.findById(teacherUserId);
  if (!teacher) return res.status(404).json({ error: "NOT_FOUND" });

  const body = req.body ?? {};
  const branchCode = typeof body.branchCode === "string" ? body.branchCode : "";
  const branchTitle = typeof body.branchTitle === "string" ? body.branchTitle : "";
  const startCategoryRaw = typeof body.startCategory === "string" ? body.startCategory : "";
  const recommendedRateMin = body.recommendedRateMin == null ? null : Number(body.recommendedRateMin);
  const recommendedRateMax = body.recommendedRateMax == null ? null : Number(body.recommendedRateMax);

  const allowedStartCategory = new Set(["highest", "first", "none"]);
  if (!branchCode.trim() || !branchTitle.trim()) return res.status(400).json({ error: "INVALID_BRANCH" });
  if (!allowedStartCategory.has(startCategoryRaw)) return res.status(400).json({ error: "INVALID_START_CATEGORY" });
  if (recommendedRateMin != null && !Number.isFinite(recommendedRateMin)) return res.status(400).json({ error: "INVALID_RECOMMENDED_RATE_MIN" });
  if (recommendedRateMax != null && !Number.isFinite(recommendedRateMax)) return res.status(400).json({ error: "INVALID_RECOMMENDED_RATE_MAX" });

  const patch = buildTeacherPatchFromManualBranch({
    branchCode: branchCode as any,
    branchTitle,
    startCategory: startCategoryRaw as any,
    recommendedRateMin: recommendedRateMin != null ? recommendedRateMin : null,
    recommendedRateMax: recommendedRateMax != null ? recommendedRateMax : null,
  });

  const updated = userStore.updateById(teacherUserId, patch);
  return res.json({ teacher: updated });
});

analyticsRouter.get("/teacher-cadre-attributes/:teacherUserId", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope || !isDirectorLike(scope)) return res.status(403).json({ error: "FORBIDDEN" });

  const teacherUserId = String(req.params.teacherUserId ?? "");
  if (!teacherUserId) return res.status(400).json({ error: "INVALID_TEACHER_ID" });
  const teacher = userStore.findById(teacherUserId);
  if (!teacher) return res.status(404).json({ error: "NOT_FOUND" });

  const categoryExplicit = teacher.teacherQualificationCategory != null;
  const category = teacher.teacherQualificationCategory ?? null;
  const pcRate = teacher.teacherCompensation?.currentPcRate ?? null;
  const pcExplicit = teacher.teacherCompensation?.currentPcRate != null;

  const manualBranchCode = teacher.teacherQuality?.manualBranchCode ?? null;
  const manualBranchTitle = teacher.teacherQuality?.manualBranchTitle ?? null;
  if (manualBranchCode) {
    return res.json({
      teacherUserId,
      category,
      categoryExplicit,
      pcRate,
      pcExplicit,
      branchKnown: true,
      branchTitle: manualBranchTitle ?? "неизвестно",
      sourceCandidateId: teacher.teacherQuality?.sourceCandidateId ?? null,
    });
  }

  const sourceCandidateId = teacher.teacherQuality?.sourceCandidateId ?? null;
  if (!sourceCandidateId) {
    return res.json({
      teacherUserId,
      category,
      categoryExplicit,
      pcRate,
      pcExplicit,
      branchKnown: false,
      branchTitle: null,
      sourceCandidateId: null,
    });
  }

  const candidate = candidatesStore.findById(sourceCandidateId);
  if (!candidate?.application) {
    return res.json({
      teacherUserId,
      category,
      categoryExplicit,
      pcRate,
      pcExplicit,
      branchKnown: false,
      branchTitle: null,
      sourceCandidateId,
    });
  }

  const rec = evaluateCandidateRecommendation(candidate.application);
  return res.json({
    teacherUserId,
    category,
    categoryExplicit,
    pcRate,
    pcExplicit,
    branchKnown: true,
    branchTitle: rec.branchTitle,
    sourceCandidateId,
  });
});

analyticsRouter.get("/overview", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });
  const range = parseFromTo(req);
  if (!range) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const minAverage = req.query.minAverage != null ? Number(req.query.minAverage) : 3;
  const minAttendancePercent = req.query.minAttendancePercent != null ? Number(req.query.minAttendancePercent) : 90;

  const lessons = listEffectiveLessons(range);
  const scopedLessons =
    scope.role === "teacher"
      ? lessons.filter((l) =>
          teacherLoadStore.isTeacherAllowedLesson({
            teacherUserId: scope.teacherUserId,
            disciplineCode: l.disciplineCode,
            grade: l.grade,
            groupNumber: l.groupNumber ?? null,
          }),
        )
      : lessons;
  const aggregated =
    scope.role === "teacher"
      ? aggregateForLessons({ lessons: scopedLessons, onlyTeacherUserId: scope.teacherUserId })
      : aggregateForLessons({ lessons: scopedLessons });

  // teacher overview: only for their loads
  let teacherMeta: any = null;
  if (scope.role === "teacher") {
    const allowed = new Set(teacherLoadStore.listByTeacher(scope.teacherUserId).map((l) => l.disciplineCode));
    teacherMeta = {
      teacherUserId: scope.teacherUserId,
      disciplineCodes: [...allowed],
    };
  }

  return res.json({
    from: range.from,
    to: range.to,
    scope,
    overview: aggregated.school,
    byGrade: aggregated.byGrade,
    byDiscipline: aggregated.byDiscipline,
    byGradeDiscipline: aggregated.byGradeDiscipline,
    riskZones:
      scope.role === "director" || scope.role === "head_teacher"
        ? riskZones({
            byGrade: aggregated.byGrade,
            byDiscipline: aggregated.byDiscipline,
            minAverage: Number.isFinite(minAverage) ? minAverage : 3,
            minAttendancePercent: Number.isFinite(minAttendancePercent) ? minAttendancePercent : 90,
          })
        : null,
    teacher: teacherMeta,
  });
});

analyticsRouter.get("/classes", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });
  if (scope.role === "teacher") return res.status(403).json({ error: "FORBIDDEN" });

  const range = parseFromTo(req);
  if (!range) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const gradeParam = req.query.grade != null ? Number(req.query.grade) : null;
  const disciplineCode = req.query.disciplineCode != null ? String(req.query.disciplineCode) : null;

  const lessons = listEffectiveLessons(range);
  const aggregated = aggregateForLessons({
    lessons,
    onlyGrades: gradeParam != null && Number.isFinite(gradeParam) ? [gradeParam] : null,
    onlyDisciplineCodes: disciplineCode ? [disciplineCode] : null,
  });

  return res.json({
    from: range.from,
    to: range.to,
    scope,
    filter: {
      grade: gradeParam != null && Number.isFinite(gradeParam) ? gradeParam : null,
      disciplineCode: disciplineCode || null,
    },
    overview: aggregated.school,
    byGrade: aggregated.byGrade,
    byDiscipline: aggregated.byDiscipline,
    byGradeDiscipline: aggregated.byGradeDiscipline,
  });
});

analyticsRouter.get("/teacher", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsScope(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });
  if (scope.role !== "teacher") return res.status(403).json({ error: "FORBIDDEN" });

  const range = parseFromTo(req);
  if (!range) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const lessons = listEffectiveLessons(range);
  const panels = computeTeacherPanels({
    teacherUserId: scope.teacherUserId,
    from: range.from,
    to: range.to,
    lessons,
  });

  return res.json({
    from: range.from,
    to: range.to,
    scope,
    panels,
  });
});

function revisionFio(u: { lastName: string; firstName: string; patronymic: string }): string {
  return `${u.lastName} ${u.firstName} ${u.patronymic}`.trim();
}

analyticsRouter.get("/revision/classes", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsDirectorOrHead(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });

  const classes = classStore.list().sort((a, b) => a.grade - b.grade);
  const items = classes.map((c) => {
    const grade = c.grade;
    const disciplines = disciplineStore.listByGrade(grade);
    const rows: Array<{
      disciplineCode: string;
      disciplineName: string;
      teacherUserId: string;
      teacherFio: string;
      key: string;
    }> = [];
    for (const d of disciplines) {
      const teacherIds = new Set(
        teacherLoadStore.list().filter((l) => l.grade === grade && l.disciplineCode === d.code).map((l) => l.teacherUserId),
      );
      for (const teacherUserId of [...teacherIds].sort()) {
        const u = userStore.findById(teacherUserId);
        rows.push({
          disciplineCode: d.code,
          disciplineName: d.name,
          teacherUserId,
          teacherFio: u ? revisionFio(u) : teacherUserId,
          key: `${grade}:${d.code}:${teacherUserId}`,
        });
      }
    }
    return { grade, label: `${grade} класс`, rows };
  });

  return res.json({ classes: items });
});

analyticsRouter.get("/revision/journal-document-types", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsDirectorOrHead(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });
  return res.json({ types: journalDocumentTypeStore.list() });
});

analyticsRouter.post("/revision/documentation", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsDirectorOrHead(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });

  const body = req.body ?? {};
  const grades = Array.isArray(body.grades)
    ? body.grades.filter((g: unknown): g is number => typeof g === "number" && Number.isInteger(g) && g > 0)
    : [];
  const excludedKeys = Array.isArray(body.excludedKeys)
    ? body.excludedKeys.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const journalDocumentTypeIds = Array.isArray(body.journalDocumentTypeIds)
    ? body.journalDocumentTypeIds.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";
  let lessonDateFrom = typeof body.lessonDateFrom === "string" ? body.lessonDateFrom.trim() : "";
  let lessonDateTo = typeof body.lessonDateTo === "string" ? body.lessonDateTo.trim() : "";

  if (grades.length === 0 || journalDocumentTypeIds.length === 0) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  if (!Number.isFinite(Date.parse(scheduledAt))) {
    return res.status(400).json({ error: "INVALID_SCHEDULED_AT" });
  }
  for (const g of grades) {
    if (!classStore.findByGrade(g)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
  }
  for (const id of journalDocumentTypeIds) {
    if (!journalDocumentTypeStore.findById(id)) return res.status(400).json({ error: "JOURNAL_DOC_TYPE_NOT_FOUND" });
  }

  if (!lessonDateFrom || !lessonDateTo) {
    const b = defaultLessonDateBoundsForScheduledAt(scheduledAt);
    lessonDateFrom = lessonDateFrom || b.from;
    lessonDateTo = lessonDateTo || b.to;
  }
  if (!isIsoDate(lessonDateFrom) || !isIsoDate(lessonDateTo)) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }
  if (lessonDateTo < lessonDateFrom) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const excluded = new Set(excludedKeys);
  const includedSlots: Array<{ grade: number; disciplineCode: string; teacherUserId: string }> = [];
  for (const grade of grades) {
    for (const d of disciplineStore.listByGrade(grade)) {
      const teacherIds = new Set(
        teacherLoadStore.list().filter((l) => l.grade === grade && l.disciplineCode === d.code).map((l) => l.teacherUserId),
      );
      for (const teacherUserId of teacherIds) {
        const key = `${grade}:${d.code}:${teacherUserId}`;
        if (excluded.has(key)) continue;
        includedSlots.push({ grade, disciplineCode: d.code, teacherUserId });
      }
    }
  }

  if (includedSlots.length === 0) {
    return res.status(400).json({ error: "REVISION_NOTHING_SELECTED" });
  }

  const job = revisionJobStore.create({
    kind: "documentation",
    scheduledAt,
    createdByUserId: scope.userId,
    payload: {
      kind: "documentation",
      includedSlots,
      journalDocumentTypeIds,
      lessonDateFrom,
      lessonDateTo,
    },
  });
  return res.status(201).json({ job });
});

analyticsRouter.post("/revision/journal", requireAuth, (req: AuthedRequest, res) => {
  const scope = requireAnalyticsDirectorOrHead(req);
  if (!scope) return res.status(403).json({ error: "FORBIDDEN" });

  const body = req.body ?? {};
  const grades = Array.isArray(body.grades)
    ? body.grades.filter((g: unknown): g is number => typeof g === "number" && Number.isInteger(g) && g > 0)
    : [];
  const excludedKeys = Array.isArray(body.excludedKeys)
    ? body.excludedKeys.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const checksRaw = typeof body.checks === "object" && body.checks ? body.checks : {};
  const checks = {
    lessons: checksRaw.lessons !== false,
    topics: checksRaw.topics !== false,
    marks: checksRaw.marks !== false,
  };
  const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";
  let lessonDateFrom = typeof body.lessonDateFrom === "string" ? body.lessonDateFrom.trim() : "";
  let lessonDateTo = typeof body.lessonDateTo === "string" ? body.lessonDateTo.trim() : "";

  if (grades.length === 0 || !Number.isFinite(Date.parse(scheduledAt))) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  for (const g of grades) {
    if (!classStore.findByGrade(g)) return res.status(400).json({ error: "CLASS_NOT_FOUND" });
  }
  if (!lessonDateFrom || !lessonDateTo) {
    const b = defaultLessonDateBoundsForScheduledAt(scheduledAt);
    lessonDateFrom = lessonDateFrom || b.from;
    lessonDateTo = lessonDateTo || b.to;
  }
  if (!isIsoDate(lessonDateFrom) || !isIsoDate(lessonDateTo)) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }
  if (lessonDateTo < lessonDateFrom) return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  if (!checks.lessons && !checks.topics && !checks.marks) return res.status(400).json({ error: "REVISION_NO_CHECKS_SELECTED" });

  const excluded = new Set(excludedKeys);
  const includedSlots: Array<{ grade: number; disciplineCode: string; teacherUserId: string }> = [];
  for (const grade of grades) {
    for (const d of disciplineStore.listByGrade(grade)) {
      const teacherIds = new Set(
        teacherLoadStore.list().filter((l) => l.grade === grade && l.disciplineCode === d.code).map((l) => l.teacherUserId),
      );
      for (const teacherUserId of teacherIds) {
        const key = `${grade}:${d.code}:${teacherUserId}`;
        if (excluded.has(key)) continue;
        includedSlots.push({ grade, disciplineCode: d.code, teacherUserId });
      }
    }
  }
  if (includedSlots.length === 0) return res.status(400).json({ error: "REVISION_NOTHING_SELECTED" });

  const job = revisionJobStore.create({
    kind: "journal",
    scheduledAt,
    createdByUserId: scope.userId,
    payload: {
      kind: "journal",
      includedSlots,
      lessonDateFrom,
      lessonDateTo,
      checks,
    },
  });
  return res.status(201).json({ job });
});

