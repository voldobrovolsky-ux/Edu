export type CandidateStatus = "invited" | "submitted";

export type CandidateHiringStage =
  | "new_application"
  | "interview_scheduled"
  | "interview_completed"
  | "demo_completed"
  | "offer_made"
  | "hired"
  | "rejected";

export type CandidateAllowedRole = "teacher" | "assistant_intern";

export type CandidateRecommendation = {
  allowedRole: CandidateAllowedRole;
  formalAccessGranted: boolean;
  assignmentWarning: string | null;
  branchCode: string;
  branchTitle: string;
  startCategory: "highest" | "first" | "none";
  recommendedRateMin: number | null;
  recommendedRateMax: number | null;
  explanation: string;
};

export type CandidateAnalytics = {
  hiringStage: CandidateHiringStage;
  desiredRoleOverride?: "teacher" | null;
  recommendation: CandidateRecommendation | null;
  interviewScoreDiscipline0to5?: number | null;
  interviewScoreParents0to5?: number | null;
  demoLessonScore0to5?: number | null;
  artifactScore0to5?: number | null;
  artifactNotes?: string;
  hiredTeacherUserId?: string | null;
  hiredAt?: string | null;
  lastCalculatedAt?: string | null;
};

export type CandidateFileCategory =
  | "avatar"
  | "resume"
  | "diploma"
  | "lesson_plan"
  | "portfolio"
  | "no_conviction"
  | "other";

export type CandidateFile = {
  id: string;
  category: CandidateFileCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageRelPath: string;
  url: string;
  createdAt: string;
};

export type CandidateApplication = {
  contacts: {
    fullName: string;
    email: string;
    phone: string;
    city?: string;
    timezone?: string;
    consentProcessing: boolean;
  };
  role: {
    desiredLevels: Array<"1-4" | "5-9" | "10-11" | "other">;
    subjects: string[];
    subjectsOtherText?: string;
    employmentFormat: "staff" | "part_time" | "internship";
  };
  education: {
    educationLevel: "higher_ped" | "higher_nonped" | "sppo_ped" | "sppo_nonped";
    teacherReprepStatus: "yes" | "no" | "in_process";
    institutionName: string;
    specialtyText: string;
    graduationYear: number | null;
    reprepProgramText?: string;
    reprepOrganizationText?: string;
    reprepHours?: number | null;
    reprepYear?: number | null;
    additionalTrainingText?: string;
  };
  teachingExperience: {
    teachingSchoolExperience: "none" | "lt1" | "1-3" | "3plus";
    tutoringExperience: "none" | "lt1" | "1-2" | "2plus";
    stableTutoringStudentsPerMonth?: number | null;
    aboutMeText?: string;
    examplesResultsText?: string;
    agesWorked: Array<"1-4" | "5-9" | "10-11" | "adults">;
  };
  subject: {
    subjectConfidence0to10: number | null;
    difficultTopicsText?: string;
    readyMiniTest: boolean;
  };
  standards: {
    arhimedesReadiness0to10: number | null;
    experienceJournalCriteriaAnalyticsIom: string[];
    observationAttitude: "positive" | "neutral" | "not_ready";
    experienceText?: string;
  };
  starCases: {
    disciplineStarCase: { disciplineS: string; disciplineT: string; disciplineA: string; disciplineR: string };
    parentsAssessmentStarCase: { disciplineS: string; disciplineT: string; disciplineA: string; disciplineR: string };
  };
  conditions: {
    readyToStart: "soon" | "in_month" | "in_semester" | "later";
    additionalCommentsText?: string;
  };
};

export type CandidateListItem = {
  candidateId: string;
  status: CandidateStatus;
  updatedAt: string;
  submittedAt: string | null;
  fio: string | null;
  aboutMe: string | null;
  keyWorkplaces: string | null;
  teachingSchoolExperience: string | null;
  tutoringExperience: string | null;
  avatarUrl: string | null;
  analytics?: CandidateAnalytics | null;
};

