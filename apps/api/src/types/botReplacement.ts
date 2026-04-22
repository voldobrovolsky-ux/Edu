export type ReplacementSlot = {
  slotIndex: number;
  lessonIds: string[];
  coveredByUserId: string | null;
  escalatedAt: string | null;
};

export type ReplacementSession = {
  id: string;
  sickTeacherUserId: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  candidateUserIds: string[];
  slots: ReplacementSlot[];
  status: "active" | "completed" | "cancelled";
};

export type CandidatePrompt = {
  id: string;
  sessionId: string;
  candidateUserId: string;
  messageId: string;
  availableSlotIndexes: number[];
  selectedSlotIndexes: number[];
  state: "pending" | "confirming" | "accepted" | "declined";
  confirmMessageId: string | null;
};

export type BotReplacementState = {
  sessions: ReplacementSession[];
  prompts: CandidatePrompt[];
};

