export type RevisionJobKind = "documentation" | "journal";

export type RevisionJobStatus = "pending" | "processing" | "done" | "failed";

export type DocumentationRevisionPayload = {
  kind: "documentation";
  includedSlots: Array<{ grade: number; disciplineCode: string; teacherUserId: string }>;
  journalDocumentTypeIds: string[];
  lessonDateFrom: string;
  lessonDateTo: string;
};

export type JournalRevisionPayload = {
  kind: "journal";
  includedSlots: Array<{ grade: number; disciplineCode: string; teacherUserId: string }>;
  lessonDateFrom: string;
  lessonDateTo: string;
  checks: {
    lessons: boolean;
    topics: boolean;
    marks: boolean;
  };
};

export type RevisionJob = {
  id: string;
  kind: RevisionJobKind;
  status: RevisionJobStatus;
  createdAt: string;
  scheduledAt: string;
  createdByUserId: string;
  payload: DocumentationRevisionPayload | JournalRevisionPayload;
  errorMessage?: string;
  finishedAt?: string;
};
