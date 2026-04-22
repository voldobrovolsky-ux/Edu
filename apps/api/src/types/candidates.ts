import type { CandidateAnalyticsSnapshot } from "./analytics.js";

export type CandidateStatus = "invited" | "submitted";

export type CandidateFileCategory =
  | "avatar"
  | "resume"
  | "diploma"
  | "lesson_plan"
  | "portfolio"
  | "no_conviction"
  | "other";

export type CandidateFileMeta = {
  id: string;
  candidateId: string;
  category: CandidateFileCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageRelPath: string; // relative to /files root
  createdAt: string;
};

export type CandidateContactStep = {
  fullName: string; // ФИО
  email: string;
  phone: string;
  city?: string;
  timezone?: string;
  consentProcessing: boolean;
};

export type CandidateRoleStep = {
  desiredLevels: Array<"1-4" | "5-9" | "10-11" | "other">;
  subjects: string[]; // codes
  subjectsOtherText?: string;
  employmentFormat: "staff" | "part_time" | "internship";
};

export type CandidateEducationStep = {
  educationLevel: "higher_ped" | "higher_nonped" | "sppo_ped" | "sppo_nonped";
  teacherReprepStatus: "yes" | "no" | "in_process";

  institutionName: string;
  specialtyText: string;
  graduationYear: number | null;

  // Teacher re-prep (if any)
  reprepProgramText?: string;
  reprepOrganizationText?: string;
  reprepHours?: number | null;
  reprepYear?: number | null;

  additionalTrainingText?: string;
};

export type CandidateTeachingExperienceStep = {
  teachingSchoolExperience: "none" | "lt1" | "1-3" | "3plus";
  tutoringExperience: "none" | "lt1" | "1-2" | "2plus";
  stableTutoringStudentsPerMonth?: number | null;

  aboutMeText?: string;
  examplesResultsText?: string;
  agesWorked: Array<"1-4" | "5-9" | "10-11" | "adults">;
};

export type CandidateSubjectStep = {
  subjectConfidence0to10: number | null;
  difficultTopicsText?: string;
  readyMiniTest: boolean;
};

export type CandidateStandardsStep = {
  arhimedesReadiness0to10: number | null;
  experienceJournalCriteriaAnalyticsIom: string[]; // checkbox ids
  observationAttitude: "positive" | "neutral" | "not_ready";
  experienceText?: string;
};

export type CandidateStarCase = {
  disciplineS: string;
  disciplineT: string;
  disciplineA: string;
  disciplineR: string;
};

export type CandidateStarCasesStep = {
  disciplineStarCase: CandidateStarCase;
  parentsAssessmentStarCase: CandidateStarCase;
};

export type CandidateConditionsStep = {
  readyToStart: "soon" | "in_month" | "in_semester" | "later";
  additionalCommentsText?: string;
};

export type CandidateApplication = {
  contacts: CandidateContactStep;
  role: CandidateRoleStep;
  education: CandidateEducationStep;
  teachingExperience: CandidateTeachingExperienceStep;
  subject: CandidateSubjectStep;
  standards: CandidateStandardsStep;
  starCases: CandidateStarCasesStep;
  conditions: CandidateConditionsStep;
};

export type CandidateStored = {
  candidateId: string;
  status: CandidateStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  application?: CandidateApplication | null;
  files: CandidateFileMeta[];
  analytics?: CandidateAnalyticsSnapshot | null;
};

