import { randomUUID } from "node:crypto";
import type {
  CadreProfileResponse,
  CandidateAllowedRole,
  CandidateRateBranchCode,
  CandidateRateRecommendation,
  RecommendedQualificationCategory,
  TeacherCompensationProfile,
  TeacherDiagnosticResult,
  TeacherLessonObservation,
  TeacherQualityProfile,
} from "../types/analytics.js";
import type { CandidateApplication, CandidateStored } from "../types/candidates.js";
import type { CalendarEvent } from "../types/calendar.js";
import type { StoredUser, TeacherQualificationCategory } from "../types/user.js";
import { TEACHER_QUALIFICATION_LABELS } from "../types/user.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import { candidatesStore } from "../store/candidatesStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { userStore } from "../store/userStore.js";

const OBSERVATION_ATTITUDE_SCORE: Record<NonNullable<CandidateApplication["standards"]["observationAttitude"]>, number> = {
  positive: 5,
  neutral: 3,
  not_ready: 1,
};

const SCHOOL_EXP_SCORE: Record<NonNullable<CandidateApplication["teachingExperience"]["teachingSchoolExperience"]>, number> = {
  none: 0,
  lt1: 0.5,
  "1-3": 2,
  "3plus": 4,
};

const TUTORING_EXP_SCORE: Record<NonNullable<CandidateApplication["teachingExperience"]["tutoringExperience"]>, number> = {
  none: 0,
  lt1: 0.5,
  "1-2": 1.5,
  "2plus": 3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: Array<number | null | undefined>): number | null {
  const normalized = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!normalized.length) return null;
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}

function isPedEducation(level: CandidateApplication["education"]["educationLevel"]): boolean {
  return level === "higher_ped" || level === "sppo_ped";
}

function hasFormalTeacherAccess(application: CandidateApplication): boolean {
  return isPedEducation(application.education.educationLevel) || application.education.teacherReprepStatus === "yes";
}

function resolveCategory(category: RecommendedQualificationCategory): TeacherQualificationCategory {
  if (category === "highest") return "highest";
  if (category === "first") return "first";
  return "none";
}

function branchMeta(args: {
  code: CandidateRateBranchCode;
  title: string;
  category: RecommendedQualificationCategory;
  rateRange: [number, number] | null;
  allowedRole: CandidateAllowedRole;
  explanation: string;
}): CandidateRateRecommendation {
  return {
    allowedRole: args.allowedRole,
    formalAccessGranted: args.allowedRole === "teacher",
    assignmentWarning:
      args.allowedRole === "teacher"
        ? null
        : "Нельзя назначить на роль учителя без педагогического образования или завершенной педпереподготовки.",
    branchCode: args.code,
    branchTitle: args.title,
    startCategory: args.category,
    recommendedRateMin: args.rateRange?.[0] ?? null,
    recommendedRateMax: args.rateRange?.[1] ?? null,
    explanation: args.explanation,
  };
}

export function evaluateCandidateRecommendation(application: CandidateApplication): CandidateRateRecommendation {
  const formalAccess = hasFormalTeacherAccess(application);
  const schoolExp = application.teachingExperience.teachingSchoolExperience;
  const tutoringExp = application.teachingExperience.tutoringExperience;
  const level = application.education.educationLevel;

  if (!formalAccess) {
    return branchMeta({
      code: "nonped_no_reprep",
      title: "Непедагогическое образование без переподготовки",
      category: "none",
      rateRange: null,
      allowedRole: "assistant_intern",
      explanation: "Кандидат может стартовать как стажер/ассистент; ставка учителя не назначается до формального допуска.",
    });
  }

  if (level === "higher_ped" && (schoolExp === "1-3" || schoolExp === "3plus")) {
    return branchMeta({
      code: "higher_ped_school_exp",
      title: "Высшее пед + опыт школы от 1 года",
      category: schoolExp === "3plus" ? "highest" : "first",
      rateRange: schoolExp === "3plus" ? [42, 48] : [39, 41],
      allowedRole: "teacher",
      explanation: "Есть формальный допуск и подтвержденный школьный опыт, поэтому можно назначать учителем на усиленный стартовый диапазон.",
    });
  }

  if (level === "higher_ped" && (tutoringExp === "1-2" || tutoringExp === "2plus")) {
    return branchMeta({
      code: "higher_ped_tutoring_exp",
      title: "Высшее пед + репетиторский опыт",
      category: "none",
      rateRange: tutoringExp === "2plus" ? [36, 38] : [33, 35],
      allowedRole: "teacher",
      explanation: "Формальный допуск есть, но основной опыт вне школы, поэтому рекомендован осторожный старт с нижнего/среднего диапазона.",
    });
  }

  if (level === "higher_ped") {
    return branchMeta({
      code: "higher_ped_no_exp",
      title: "Высшее пед без значимого опыта",
      category: "none",
      rateRange: [30, 32],
      allowedRole: "teacher",
      explanation: "Есть формальный допуск, но опыт ограничен, поэтому рекомендован входной диапазон ставки.",
    });
  }

  if (level === "sppo_ped" && schoolExp !== "none") {
    return branchMeta({
      code: "spo_ped_with_exp",
      title: "СПО пед + практический опыт",
      category: "none",
      rateRange: [33, 35],
      allowedRole: "teacher",
      explanation: "Педагогическое СПО дает формальный допуск; при наличии практики можно назначать учителем со стартом в среднем диапазоне.",
    });
  }

  if (level === "sppo_ped") {
    return branchMeta({
      code: "spo_ped_no_exp",
      title: "СПО пед без опыта",
      category: "none",
      rateRange: [30, 32],
      allowedRole: "teacher",
      explanation: "Формальный допуск есть, но без подтвержденного опыта рекомендуется входной диапазон ставки.",
    });
  }

  if (schoolExp === "1-3" || schoolExp === "3plus") {
    return branchMeta({
      code: "nonped_reprep_school_exp",
      title: "Непед + переподготовка + опыт школы",
      category: schoolExp === "3plus" ? "first" : "none",
      rateRange: schoolExp === "3plus" ? [39, 41] : [36, 38],
      allowedRole: "teacher",
      explanation: "Непедагогическая база компенсирована переподготовкой и школьной практикой, поэтому можно назначать учителем.",
    });
  }

  if (tutoringExp === "1-2" || tutoringExp === "2plus") {
    return branchMeta({
      code: "nonped_reprep_tutoring_exp",
      title: "Непед + переподготовка + репетиторство",
      category: "none",
      rateRange: [33, 35],
      allowedRole: "teacher",
      explanation: "Есть формальный допуск через переподготовку, но для школьной роли рекомендован аккуратный старт.",
    });
  }

  return branchMeta({
    code: "nonped_reprep_no_exp",
    title: "Непед + переподготовка без опыта",
    category: "none",
    rateRange: [30, 32],
    allowedRole: "teacher",
    explanation: "Формальный допуск есть, но подтвержденного опыта нет, поэтому используется входной диапазон.",
  });
}

export function buildCandidateAnalyticsSnapshot(candidate: CandidateStored) {
  const recommendation = candidate.application ? evaluateCandidateRecommendation(candidate.application) : null;
  return {
    hiringStage: candidate.analytics?.hiringStage ?? (candidate.application ? "new_application" : "new_application"),
    desiredRoleOverride: candidate.analytics?.desiredRoleOverride ?? null,
    recommendation,
    interviewScoreDiscipline0to5: candidate.analytics?.interviewScoreDiscipline0to5 ?? null,
    interviewScoreParents0to5: candidate.analytics?.interviewScoreParents0to5 ?? null,
    demoLessonScore0to5: candidate.analytics?.demoLessonScore0to5 ?? null,
    artifactScore0to5: candidate.analytics?.artifactScore0to5 ?? null,
    artifactNotes: candidate.analytics?.artifactNotes ?? "",
    hiredTeacherUserId: candidate.analytics?.hiredTeacherUserId ?? null,
    hiredAt: candidate.analytics?.hiredAt ?? null,
    lastCalculatedAt: recommendation ? new Date().toISOString() : candidate.analytics?.lastCalculatedAt ?? null,
  };
}

function summarizeEventParticipation(event: CalendarEvent, teacherUserId?: string) {
  const analytics = event.analytics;
  const stations = analytics?.stations ?? [];
  const stationRows = stations
    .map((station) => {
      const matchingAssignments = station.assignments.filter((assignment) =>
        teacherUserId ? assignment.teacherUserId === teacherUserId : true,
      );
      if (!matchingAssignments.length) return null;
      const actualMinutes = matchingAssignments.reduce((sum, assignment) => sum + Math.max(0, assignment.actualDurationMinutes), 0);
      const plannedMinutes = matchingAssignments.reduce((sum, assignment) => sum + Math.max(0, assignment.plannedDurationMinutes), 0);
      return {
        stationId: station.id,
        stationTitle: station.title,
        teacherUserIds: matchingAssignments.map((assignment) => assignment.teacherUserId),
        plannedAcademicHours: plannedMinutes / 45,
        actualAcademicHours: actualMinutes / 45,
      };
    })
    .filter(Boolean) as Array<{
    stationId: string;
    stationTitle: string;
    teacherUserIds: string[];
    plannedAcademicHours: number;
    actualAcademicHours: number;
  }>;

  return {
    eventId: event.id,
    title: event.title,
    date: event.date,
    activityType: analytics?.activityType ?? "event",
    stationCount: stations.length,
    teacherCount: new Set(stations.flatMap((station) => station.assignments.map((assignment) => assignment.teacherUserId))).size,
    actualAcademicHours: stationRows.reduce((sum, row) => sum + row.actualAcademicHours, 0),
    stations: stationRows,
  };
}

export function computeTeacherQualityIndex(profile: TeacherQualityProfile | null | undefined): number | null {
  if (!profile) return null;
  const starNormalized = average([
    profile.interview.discipline0to5 != null ? (profile.interview.discipline0to5 / 5) * 100 : null,
    profile.interview.parents0to5 != null ? (profile.interview.parents0to5 / 5) * 100 : null,
  ]);
  const standardsNormalized = average([
    profile.standards.readiness0to10 != null ? (profile.standards.readiness0to10 / 10) * 100 : null,
    profile.standards.observationAttitudeScore0to5 != null ? (profile.standards.observationAttitudeScore0to5 / 5) * 100 : null,
    profile.standards.documentationExperienceScore0to5 != null ? (profile.standards.documentationExperienceScore0to5 / 5) * 100 : null,
  ]);
  const lessonsNormalized = average(profile.lessonObservations.map((item) => (item.score0to5 / 5) * 100));
  const diagnosticsNormalized = average(profile.diagnostics.map((item) => item.successPercent));

  const weighted =
    (starNormalized ?? 0) * 0.2 +
    (standardsNormalized ?? 0) * 0.2 +
    (lessonsNormalized ?? 0) * 0.45 +
    (diagnosticsNormalized ?? 0) * 0.15;
  const weightsUsed =
    (starNormalized != null ? 0.2 : 0) +
    (standardsNormalized != null ? 0.2 : 0) +
    (lessonsNormalized != null ? 0.45 : 0) +
    (diagnosticsNormalized != null ? 0.15 : 0);
  if (weightsUsed <= 0) return null;
  return Math.round((weighted / weightsUsed) * 100) / 100;
}

export function buildTeacherQualityFromCandidate(candidate: CandidateStored): TeacherQualityProfile | null {
  const application = candidate.application;
  if (!application) return null;
  const lessonObservations: TeacherLessonObservation[] = [];
  if (typeof candidate.analytics?.demoLessonScore0to5 === "number") {
    lessonObservations.push({
      id: randomUUID(),
      date: candidate.updatedAt.slice(0, 10),
      score0to5: clamp(candidate.analytics.demoLessonScore0to5, 0, 5),
      comment: "Оценка демо-урока при найме",
    });
  }
  const profile: TeacherQualityProfile = {
    sourceCandidateId: candidate.candidateId,
    interview: {
      discipline0to5:
        typeof candidate.analytics?.interviewScoreDiscipline0to5 === "number"
          ? clamp(candidate.analytics.interviewScoreDiscipline0to5, 0, 5)
          : null,
      parents0to5:
        typeof candidate.analytics?.interviewScoreParents0to5 === "number"
          ? clamp(candidate.analytics.interviewScoreParents0to5, 0, 5)
          : null,
    },
    standards: {
      readiness0to10: application.standards.arhimedesReadiness0to10 ?? null,
      observationAttitudeScore0to5: OBSERVATION_ATTITUDE_SCORE[application.standards.observationAttitude],
      documentationExperienceScore0to5: clamp(application.standards.experienceJournalCriteriaAnalyticsIom.length, 0, 5),
    },
    lessonObservations,
    diagnostics: [],
    qualityIndex: null,
    qualityCalculatedAt: null,
  };
  profile.qualityIndex = computeTeacherQualityIndex(profile);
  profile.qualityCalculatedAt = new Date().toISOString();
  return profile;
}

export function defaultTeacherCompensationFromRecommendation(recommendation: CandidateRateRecommendation | null): TeacherCompensationProfile {
  const rate = recommendation?.recommendedRateMin ?? null;
  return {
    currentPcRate: rate,
    rateHistory:
      rate != null
        ? [
            {
              effectiveFrom: new Date().toISOString().slice(0, 10),
              pcRate: rate,
            },
          ]
        : [],
  };
}

export function buildTeacherPatchFromCandidate(candidate: CandidateStored) {
  const recommendation = candidate.analytics?.recommendation ?? (candidate.application ? evaluateCandidateRecommendation(candidate.application) : null);
  const profile = buildTeacherQualityFromCandidate(candidate);
  return {
    pedagogicalExperienceYears:
      SCHOOL_EXP_SCORE[candidate.application?.teachingExperience.teachingSchoolExperience ?? "none"] +
      TUTORING_EXP_SCORE[candidate.application?.teachingExperience.tutoringExperience ?? "none"],
    teacherQualificationCategory: recommendation ? resolveCategory(recommendation.startCategory) : "none",
    teacherCompensation: defaultTeacherCompensationFromRecommendation(recommendation),
    teacherQuality: profile,
  };
}

export function buildTeacherPatchFromManualBranch(args: {
  branchCode: CandidateRateBranchCode;
  branchTitle: string;
  startCategory: RecommendedQualificationCategory;
  recommendedRateMin: number | null;
  recommendedRateMax: number | null;
}) {
  const category = resolveCategory(args.startCategory);
  const currentPcRate = args.recommendedRateMin != null && Number.isFinite(args.recommendedRateMin) ? args.recommendedRateMin : null;
  const profile: TeacherQualityProfile = {
    sourceCandidateId: null,
    manualBranchCode: args.branchCode,
    manualBranchTitle: args.branchTitle,
    interview: { discipline0to5: null, parents0to5: null },
    standards: { readiness0to10: null, observationAttitudeScore0to5: null, documentationExperienceScore0to5: null },
    lessonObservations: [],
    diagnostics: [],
    qualityIndex: null,
    qualityCalculatedAt: new Date().toISOString(),
  };

  const teacherCompensation: TeacherCompensationProfile = {
    currentPcRate,
    rateHistory:
      currentPcRate != null
        ? [
            {
              effectiveFrom: new Date().toISOString().slice(0, 10),
              pcRate: currentPcRate,
            },
          ]
        : [],
  };

  return {
    teacherQualificationCategory: category,
    teacherCompensation,
    teacherQuality: profile,
  };
}

export function computeHiringAnalytics(args: { from: string; to: string; subject?: string | null; level?: string | null }) {
  const candidates = candidatesStore.list();
  const filtered = candidates.filter((candidate) => {
    if (candidate.createdAt.slice(0, 10) > args.to || candidate.createdAt.slice(0, 10) < args.from) return false;
    if (args.subject && !candidate.application?.role.subjects.includes(args.subject)) return false;
    if (args.level && !candidate.application?.role.desiredLevels.includes(args.level as any)) return false;
    return true;
  });
  const stageOrder = [
    "new_application",
    "interview_scheduled",
    "interview_completed",
    "demo_completed",
    "offer_made",
    "hired",
  ] as const;
  const labelMap: Record<(typeof stageOrder)[number], string> = {
    new_application: "Новая анкета",
    interview_scheduled: "Интервью назначено",
    interview_completed: "Интервью проведено",
    demo_completed: "Демо-урок",
    offer_made: "Оффер",
    hired: "Вышел на работу",
  };
  const stageIndex = new Map(stageOrder.map((stage, index) => [stage, index] as const));
  const funnel = stageOrder.map((stage) => {
    const items = filtered.filter((candidate) => {
      const currentStage = candidate.analytics?.hiringStage ?? "new_application";
      const currentIndex = stageIndex.get(currentStage as (typeof stageOrder)[number]);
      const requiredIndex = stageIndex.get(stage);
      return currentStage !== "rejected" && currentIndex != null && requiredIndex != null && currentIndex >= requiredIndex;
    });
    return {
      stage,
      label: labelMap[stage],
      count: items.length,
      candidateIds: items.map((candidate) => candidate.candidateId),
      candidates: items.map((candidate) => ({
        candidateId: candidate.candidateId,
        fio: candidate.application?.contacts.fullName ?? candidate.candidateId,
        subject: candidate.application?.role.subjects?.[0] ?? null,
        stage: candidate.analytics?.hiringStage ?? "new_application",
      })),
    };
  });
  return {
    from: args.from,
    to: args.to,
    funnel,
    conversions: {
      interviewFromApplications: funnel[0].count > 0 ? funnel[2].count / funnel[0].count : null,
      demoFromInterview: funnel[2].count > 0 ? funnel[3].count / funnel[2].count : null,
      hiredFromOffers: funnel[4].count > 0 ? funnel[5].count / funnel[4].count : null,
    },
  };
}

function teacherGradeLevelMatch(loadGrades: number[], level: string | null | undefined): boolean {
  if (!level) return true;
  const grades = loadGrades.filter((g) => Number.isFinite(g));
  if (!grades.length) return false;
  if (level === "1-4") return grades.some((g) => g >= 1 && g <= 4);
  if (level === "5-9") return grades.some((g) => g >= 5 && g <= 9);
  if (level === "10-11") return grades.some((g) => g >= 10 && g <= 11);
  if (level === "other") return false;
  return false;
}

function levelLabelsForGrades(grades: number[]): Array<"1-4" | "5-9" | "10-11"> {
  const labels = new Set<"1-4" | "5-9" | "10-11">();
  for (const grade of grades) {
    if (grade >= 1 && grade <= 4) labels.add("1-4");
    else if (grade >= 5 && grade <= 9) labels.add("5-9");
    else if (grade >= 10 && grade <= 11) labels.add("10-11");
  }
  return [...labels];
}

export function computeTeacherCadreProfile(args: { from?: string; to?: string; subject?: string | null; level?: string | null }): CadreProfileResponse {
  const teachers = userStore
    .list()
    .filter((u) => u.primaryRole === "teacher" || u.secondaryRoles.includes("teacher"));
  let matchedTeachersCount = 0;

  const pcRateRanges = [
    { min: 30, max: 32, label: "30–32" },
    { min: 33, max: 35, label: "33–35" },
    { min: 36, max: 38, label: "36–38" },
    { min: 39, max: 41, label: "39–41" },
    { min: 42, max: 48, label: "42–48" },
  ] as const;

  const categoryOrder: Array<TeacherQualificationCategory> = ["none", "first", "highest", "second"];
  const byCategoryMap = new Map<TeacherQualificationCategory, { title: string; teachers: any[] }>();
  for (const cat of categoryOrder) byCategoryMap.set(cat, { title: TEACHER_QUALIFICATION_LABELS[cat] ?? cat, teachers: [] });

  const byPcRateRangesMap = new Map<string, { range: any; teachers: any[] }>();
  for (const r of pcRateRanges) byPcRateRangesMap.set(r.label, { range: r, teachers: [] });
  byPcRateRangesMap.set("unassigned", { range: { label: "не назначено" }, teachers: [] });

  const byBranchesMap = new Map<string, { title: string; teachers: any[] }>();
  byBranchesMap.set("unknown", { title: "неизвестно", teachers: [] });

  function computeBranchForTeacher(t: StoredUser): { code: CandidateRateBranchCode | "unknown"; title: string } {
    const manualCode = t.teacherQuality?.manualBranchCode ?? null;
    const manualTitle = t.teacherQuality?.manualBranchTitle ?? null;
    if (manualCode) return { code: manualCode, title: manualTitle ?? "неизвестно" };

    const sourceCandidateId = t.teacherQuality?.sourceCandidateId ?? null;
    if (!sourceCandidateId) return { code: "unknown", title: "неизвестно" };
    const candidate = candidatesStore.findById(sourceCandidateId);
    if (!candidate?.application) return { code: "unknown", title: "неизвестно" };
    const rec = evaluateCandidateRecommendation(candidate.application);
    return { code: rec.branchCode, title: rec.branchTitle };
  }

  for (const teacher of teachers) {
    const loads = teacherLoadStore.listByTeacher(teacher.id);
    const teacherSubjects = new Set(loads.map((l) => l.disciplineCode));
    const teacherGrades = loads.map((l) => l.grade);

    if (args.subject && !teacherSubjects.has(args.subject)) continue;
    if (!teacherGradeLevelMatch(teacherGrades, args.level)) continue;
    matchedTeachersCount += 1;

    const currentPcRate = teacher.teacherCompensation?.currentPcRate ?? null;
    const category = (teacher.teacherQualificationCategory ?? "none") as TeacherQualificationCategory;

    const branch = computeBranchForTeacher(teacher);

    const teacherRow = {
      teacherUserId: teacher.id,
      teacherFio: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim(),
      subjects: [...teacherSubjects].sort(),
      levels: levelLabelsForGrades(teacherGrades),
      currentPcRate,
      category,
      categoryExplicit: teacher.teacherQualificationCategory != null,
      branchCode: branch.code,
      branchTitle: branch.title,
      branchKnown: branch.code !== "unknown",
    };

    // category slice
    const catBucket = byCategoryMap.get(category);
    if (catBucket) catBucket.teachers.push(teacherRow);

    // pc range slice
    const matchedRange = typeof currentPcRate === "number" && Number.isFinite(currentPcRate)
      ? pcRateRanges.find((r) => currentPcRate >= r.min && currentPcRate <= r.max) ?? null
      : null;
    const key = matchedRange ? matchedRange.label : "unassigned";
    const rangeBucket = byPcRateRangesMap.get(key);
    if (rangeBucket) rangeBucket.teachers.push(teacherRow);

    // branch slice
    const branchKey = branch.code === "unknown" ? "unknown" : branch.code;
    if (!byBranchesMap.has(branchKey)) byBranchesMap.set(branchKey, { title: branch.title, teachers: [] });
    const branchBucket = byBranchesMap.get(branchKey)!;
    branchBucket.teachers.push(teacherRow);
  }

  const byCategory = categoryOrder
    .map((cat) => {
      const b = byCategoryMap.get(cat);
      return b
        ? ({
            title: b.title,
            count: b.teachers.length,
            teachers: b.teachers,
          } as CadreProfileResponse["byCategory"][number])
        : null;
    })
    .filter(Boolean) as CadreProfileResponse["byCategory"];

  const byPcRateRanges = pcRateRanges
    .map((r) => {
      const b = byPcRateRangesMap.get(r.label);
      if (!b) return null;
      return {
        title: r.label,
        count: b.teachers.length,
        teachers: b.teachers,
        range: b.range,
      };
    })
    .filter(Boolean) as CadreProfileResponse["byPcRateRanges"];

  const unassignedBucket = byPcRateRangesMap.get("unassigned");
  if (unassignedBucket) {
    byPcRateRanges.push({
      title: "не назначено",
      count: unassignedBucket.teachers.length,
      teachers: unassignedBucket.teachers,
      range: unassignedBucket.range,
    } as any);
  }

  const byBranches = [...byBranchesMap.entries()]
    .map(([code, b]) => ({
      title: b.title,
      count: b.teachers.length,
      teachers: b.teachers,
    }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.title.localeCompare(b.title, "ru")));

  const assignedPcRateCount = [...byPcRateRangesMap.entries()]
    .filter(([k]) => k !== "unassigned")
    .reduce((sum, [, b]) => sum + b.teachers.length, 0);

  return {
    from: args.from,
    to: args.to,
    filters: { subject: args.subject ?? null, level: args.level ?? null },
    totals: {
      teachersCount: matchedTeachersCount,
      assignedPcRateCount,
    },
    byCategory,
    byPcRateRanges,
    byBranches,
  };
}

export function computeTeacherQualityAnalytics() {
  const teachers = userStore
    .list()
    .filter((user) => user.primaryRole === "teacher" || user.secondaryRoles.includes("teacher"))
    .map((teacher) => {
      const qualityIndex = computeTeacherQualityIndex(teacher.teacherQuality);
      return {
        teacherUserId: teacher.id,
        teacherFio: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim(),
        category: teacher.teacherQualificationCategory ?? null,
        currentPcRate: teacher.teacherCompensation?.currentPcRate ?? null,
        qualityIndex,
        components: {
          star: {
            discipline0to5: teacher.teacherQuality?.interview.discipline0to5 ?? null,
            parents0to5: teacher.teacherQuality?.interview.parents0to5 ?? null,
          },
          standards: teacher.teacherQuality?.standards ?? null,
          lessonAverage0to5: average(teacher.teacherQuality?.lessonObservations.map((item) => item.score0to5) ?? []),
          diagnosticsAveragePercent: average(teacher.teacherQuality?.diagnostics.map((item) => item.successPercent) ?? []),
        },
      };
    });
  return {
    teachers,
    mismatches: {
      lowQualityHighRate: teachers.filter((teacher) => (teacher.qualityIndex ?? 100) < 60 && (teacher.currentPcRate ?? 0) >= 39),
      highQualityLowRate: teachers.filter((teacher) => (teacher.qualityIndex ?? 0) >= 80 && (teacher.currentPcRate ?? 999) <= 35),
    },
  };
}

export function computeProjectAnalytics(args: { from: string; to: string; teacherUserId?: string | null }) {
  const events = calendarEventStore.listByDateRange({ from: args.from, to: args.to }).filter((event) => event.status !== "cancelled");
  const relevant = events.map((event) => summarizeEventParticipation(event, args.teacherUserId ?? undefined));
  const byTeacher = new Map<
    string,
    {
      teacherUserId: string;
      teacherFio: string;
      totalAcademicHours: number;
      items: Array<{ eventId: string; title: string; date: string; stationTitle: string; activityType: string; actualAcademicHours: number }>;
    }
  >();

  for (const event of relevant) {
    for (const station of event.stations) {
      for (const teacherUserId of station.teacherUserIds) {
        const teacher = userStore.findById(teacherUserId);
        const row = byTeacher.get(teacherUserId) ?? {
          teacherUserId,
          teacherFio: teacher ? `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim() : teacherUserId,
          totalAcademicHours: 0,
          items: [],
        };
        row.totalAcademicHours += station.actualAcademicHours;
        row.items.push({
          eventId: event.eventId,
          title: event.title,
          date: event.date,
          stationTitle: station.stationTitle,
          activityType: event.activityType,
          actualAcademicHours: station.actualAcademicHours,
        });
        byTeacher.set(teacherUserId, row);
      }
    }
  }

  return {
    from: args.from,
    to: args.to,
    events: relevant,
    teachers: [...byTeacher.values()].sort((a, b) => b.totalAcademicHours - a.totalAcademicHours),
  };
}

export function computeTeacherAnalyticalProfile(args: { teacherUserId: string; from: string; to: string }) {
  const teacher = userStore.findById(args.teacherUserId);
  if (!teacher) return null;
  const projects = computeProjectAnalytics({ from: args.from, to: args.to, teacherUserId: args.teacherUserId }).teachers[0] ?? null;
  const qualityIndex = computeTeacherQualityIndex(teacher.teacherQuality);
  return {
    teacherUserId: teacher.id,
    teacherFio: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic}`.trim(),
    category: teacher.teacherQualificationCategory ?? null,
    currentPcRate: teacher.teacherCompensation?.currentPcRate ?? null,
    qualityIndex,
    quality: teacher.teacherQuality ?? null,
    projects,
  };
}

export function makeTeacherQualityPatch(args: {
  sourceCandidate?: CandidateStored | null;
  teacher?: StoredUser | null;
  interviewDiscipline0to5?: number | null;
  interviewParents0to5?: number | null;
  lessonObservation?: Omit<TeacherLessonObservation, "id"> | null;
  diagnostic?: Omit<TeacherDiagnosticResult, "id"> | null;
}) {
  const baseFromCandidate = args.sourceCandidate ? buildTeacherQualityFromCandidate(args.sourceCandidate) : null;
  const next: TeacherQualityProfile =
    args.teacher?.teacherQuality ??
    baseFromCandidate ?? {
      sourceCandidateId: args.sourceCandidate?.candidateId ?? null,
      interview: { discipline0to5: null, parents0to5: null },
      standards: {
        readiness0to10: args.sourceCandidate?.application?.standards.arhimedesReadiness0to10 ?? null,
        observationAttitudeScore0to5: args.sourceCandidate?.application
          ? OBSERVATION_ATTITUDE_SCORE[args.sourceCandidate.application.standards.observationAttitude]
          : null,
        documentationExperienceScore0to5: args.sourceCandidate?.application
          ? clamp(args.sourceCandidate.application.standards.experienceJournalCriteriaAnalyticsIom.length, 0, 5)
          : null,
      },
      lessonObservations: [],
      diagnostics: [],
      qualityIndex: null,
      qualityCalculatedAt: null,
    };

  if (args.interviewDiscipline0to5 != null) next.interview.discipline0to5 = clamp(args.interviewDiscipline0to5, 0, 5);
  if (args.interviewParents0to5 != null) next.interview.parents0to5 = clamp(args.interviewParents0to5, 0, 5);
  if (args.lessonObservation) {
    next.lessonObservations = [
      ...next.lessonObservations,
      { id: randomUUID(), ...args.lessonObservation, score0to5: clamp(args.lessonObservation.score0to5, 0, 5) },
    ];
  }
  if (args.diagnostic) {
    next.diagnostics = [
      ...next.diagnostics,
      { id: randomUUID(), ...args.diagnostic, successPercent: clamp(args.diagnostic.successPercent, 0, 100) },
    ];
  }
  next.qualityIndex = computeTeacherQualityIndex(next);
  next.qualityCalculatedAt = new Date().toISOString();
  return next;
}
