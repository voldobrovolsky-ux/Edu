import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "./jsonFileStore.js";
import type { BotReplacementState, CandidatePrompt, ReplacementSession, ReplacementSlot } from "../types/botReplacement.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "botReplacementSessions.json");

const emptyState = (): BotReplacementState => ({ sessions: [], prompts: [] });

class BotReplacementStore {
  private cache: BotReplacementState | null = null;

  private load(): BotReplacementState {
    if (this.cache) return this.cache;
    const raw = readJsonFile<Partial<BotReplacementState>>(DATA_PATH, {});
    const st: BotReplacementState = {
      sessions: raw.sessions ?? [],
      prompts: raw.prompts ?? [],
    };
    this.cache = st;
    return st;
  }

  private save(st: BotReplacementState): void {
    this.cache = st;
    writeJsonFile(DATA_PATH, st);
  }

  createSession(args: {
    sickTeacherUserId: string;
    date: string;
    slotIndexesWithLessonIds: Array<{ slotIndex: number; lessonIds: string[] }>;
    candidateUserIds: string[];
  }): ReplacementSession {
    const st = this.load();
    const slots: ReplacementSlot[] = args.slotIndexesWithLessonIds.map((x) => ({
      slotIndex: x.slotIndex,
      lessonIds: [...x.lessonIds],
      coveredByUserId: null,
      escalatedAt: null,
    }));
    const session: ReplacementSession = {
      id: randomUUID(),
      sickTeacherUserId: args.sickTeacherUserId,
      date: args.date,
      createdAt: new Date().toISOString(),
      candidateUserIds: [...new Set(args.candidateUserIds)],
      slots,
      status: "active",
    };
    st.sessions.push(session);
    this.save(st);
    return session;
  }

  listActiveSessions(): ReplacementSession[] {
    return this.load().sessions.filter((s) => s.status === "active");
  }

  findSessionById(sessionId: string): ReplacementSession | undefined {
    return this.load().sessions.find((s) => s.id === sessionId);
  }

  createPrompt(args: { sessionId: string; candidateUserId: string; messageId: string; availableSlotIndexes: number[] }): CandidatePrompt {
    const st = this.load();
    const p: CandidatePrompt = {
      id: randomUUID(),
      sessionId: args.sessionId,
      candidateUserId: args.candidateUserId,
      messageId: args.messageId,
      availableSlotIndexes: [...args.availableSlotIndexes],
      selectedSlotIndexes: [],
      state: "pending",
      confirmMessageId: null,
    };
    st.prompts.push(p);
    this.save(st);
    return p;
  }

  findPromptById(promptId: string): CandidatePrompt | undefined {
    return this.load().prompts.find((p) => p.id === promptId);
  }

  findPromptByMessageId(messageId: string): CandidatePrompt | undefined {
    return this.load().prompts.find((p) => p.messageId === messageId || p.confirmMessageId === messageId);
  }

  listPromptsForSession(sessionId: string): CandidatePrompt[] {
    return this.load().prompts.filter((p) => p.sessionId === sessionId);
  }

  updatePrompt(promptId: string, patch: Partial<CandidatePrompt>): CandidatePrompt | null {
    const st = this.load();
    const idx = st.prompts.findIndex((p) => p.id === promptId);
    if (idx < 0) return null;
    st.prompts[idx] = { ...st.prompts[idx]!, ...patch };
    this.save(st);
    return st.prompts[idx]!;
  }

  coverSlots(sessionId: string, slotIndexes: number[], teacherUserId: string): ReplacementSession | null {
    const st = this.load();
    const idx = st.sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return null;
    const s = st.sessions[idx]!;
    const slots = s.slots.map((slot) => {
      if (slotIndexes.includes(slot.slotIndex) && !slot.coveredByUserId) {
        return { ...slot, coveredByUserId: teacherUserId };
      }
      return slot;
    });
    const status = slots.every((x) => Boolean(x.coveredByUserId)) ? "completed" : s.status;
    st.sessions[idx] = { ...s, slots, status };
    this.save(st);
    return st.sessions[idx]!;
  }

  markEscalated(sessionId: string, slotIndex: number): void {
    const st = this.load();
    const idx = st.sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return;
    const s = st.sessions[idx]!;
    st.sessions[idx] = {
      ...s,
      slots: s.slots.map((x) => (x.slotIndex === slotIndex ? { ...x, escalatedAt: x.escalatedAt ?? new Date().toISOString() } : x)),
    };
    this.save(st);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const botReplacementStore = new BotReplacementStore();

