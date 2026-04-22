export type CandidateAllowedRole = "teacher" | "assistant_intern";

export type CandidateHiringStage =
  | "new_application"
  | "interview_scheduled"
  | "interview_completed"
  | "demo_completed"
  | "offer_made"
  | "hired"
  | "rejected";

export type CandidateRateBranchCode =
  | "higher_ped_school_exp"
  | "higher_ped_tutoring_exp"
  | "higher_ped_no_exp"
  | "spo_ped_with_exp"
  | "spo_ped_no_exp"
  | "nonped_reprep_school_exp"
  | "nonped_reprep_tutoring_exp"
  | "nonped_reprep_no_exp"
  | "nonped_no_reprep";

export type RecommendedQualificationCategory = "highest" | "first" | "none";

export type CandidateRateRecommendation = {
  allowedRole: CandidateAllowedRole;
  formalAccessGranted: boolean;
  assignmentWarning: string | null;
  branchCode: CandidateRateBranchCode;
  branchTitle: string;
  startCategory: RecommendedQualificationCategory;
  recommendedRateMin: number | null;
  recommendedRateMax: number | null;
  explanation: string;
};

export type CandidateAnalyticsSnapshot = {
  hiringStage: CandidateHiringStage;
  desiredRoleOverride?: "teacher" | null;
  recommendation: CandidateRateRecommendation | null;
  interviewScoreDiscipline0to5?: number | null;
  interviewScoreParents0to5?: number | null;
  demoLessonScore0to5?: number | null;
  artifactScore0to5?: number | null;
  artifactNotes?: string;
  hiredTeacherUserId?: string | null;
  hiredAt?: string | null;
  lastCalculatedAt?: string | null;
};

export type TeacherRateHistoryItem = {
  effectiveFrom: string;
  pcRate: number;
};

export type TeacherCompensationProfile = {
  currentPcRate: number | null;
  rateHistory: TeacherRateHistoryItem[];
};

export type TeacherInterviewQuality = {
  discipline0to5: number | null;
  parents0to5: number | null;
};

export type TeacherStandardsQuality = {
  readiness0to10: number | null;
  observationAttitudeScore0to5: number | null;
  documentationExperienceScore0to5: number | null;
};

export type TeacherLessonObservation = {
  id: string;
  date: string;
  score0to5: number;
  comment?: string;
};

export type TeacherDiagnosticResult = {
  id: string;
  date: string;
  successPercent: number;
  comment?: string;
};

export type TeacherQualityProfile = {
  sourceCandidateId?: string | null;
  /** Ручная настройка “ветки” для старых учителей без связи с кандидатом. */
  manualBranchCode?: CandidateRateBranchCode | null;
  manualBranchTitle?: string | null;
  interview: TeacherInterviewQuality;
  standards: TeacherStandardsQuality;
  lessonObservations: TeacherLessonObservation[];
  diagnostics: TeacherDiagnosticResult[];
  qualityIndex?: number | null;
  qualityCalculatedAt?: string | null;
};

export type EventStationAssignment = {
  teacherUserId: string;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
};

export type EventStation = {
  id: string;
  title: string;
  assignments: EventStationAssignment[];
};

export type CalendarAnalyticsMeta = {
  activityType?: "event" | "project" | "club" | "facultative";
  stations?: EventStation[];
};

export type CadreProfilePcRateRange = { min: number; max: number; label: string };

export type CadreProfileTeacherRow = {
  teacherUserId: string;
  teacherFio: string;
  subjects: string[];
  levels: Array<"1-4" | "5-9" | "10-11">;
  currentPcRate: number | null;
  category: "highest" | "first" | "second" | "none";
  categoryExplicit: boolean;
  branchCode: CandidateRateBranchCode | "unknown";
  branchTitle: string;
  branchKnown: boolean;
};

export type CadreProfileSlice = {
  title: string;
  count: number;
  teachers: CadreProfileTeacherRow[];
};

export type CadreProfileResponse = {
  from?: string;
  to?: string;
  filters: { subject?: string | null; level?: string | null };
  totals: { teachersCount: number; assignedPcRateCount: number };
  byCategory: CadreProfileSlice[]; // categories
  byPcRateRanges: Array<CadreProfileSlice & { range: CadreProfilePcRateRange | { label: string; min?: number; max?: number } }>;
  byBranches: Array<CadreProfileSlice>;
};
