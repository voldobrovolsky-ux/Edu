import { botReplacementStore } from "../store/botReplacementStore.js";
import { messengerStore } from "../store/messengerStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { userStore } from "../store/userStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { computeTimetableSlots } from "./effectiveLessons.js";

function fio(u: { lastName: string; firstName: string; patronymic: string }): string {
  return `${u.lastName} ${u.firstName} ${u.patronymic}`.trim();
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekStart(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function lessonStartDateTime(dateIso: string, slotIndex: number): Date {
  const slots = computeTimetableSlots(new Date(`${dateIso}T00:00:00`).getDay() === 0 ? 1 : (((new Date(`${dateIso}T00:00:00`).getDay() + 6) % 7) + 1) as any, weekStart(dateIso));
  const slot = slots.find((x) => slotIndex >= x.slotIndex && slotIndex <= (x.slotIndexEnd ?? x.slotIndex));
  const hhmm = slot?.startTime ?? "08:00";
  return new Date(`${dateIso}T${hhmm}:00`);
}

function getTeachersInSchoolForDay(date: string, excludeUserId: string): string[] {
  const allTeachers = userStore
    .list()
    .filter((u) => u.id !== excludeUserId && (u.primaryRole === "teacher" || u.secondaryRoles.includes("teacher")));
  const out: string[] = [];
  for (const t of allTeachers) {
    const lessons = timetableLessonStore.listByTeacher({ teacherUserId: t.id, from: date, to: date });
    if (!lessons.length) continue;
    out.push(t.id);
  }
  return out;
}

export function startSickReplacementSession(sickTeacherUserId: string, botUserId: string): { ok: boolean; message: string } {
  const date = todayIsoDate();
  const lessons = timetableLessonStore.listByTeacher({ teacherUserId: sickTeacherUserId, from: date, to: date });
  if (!lessons.length) return { ok: false, message: "На сегодня у вас нет уроков в расписании." };
  const bySlot = new Map<number, string[]>();
  for (const l of lessons) {
    const list = bySlot.get(l.slotIndex) ?? [];
    list.push(l.id);
    bySlot.set(l.slotIndex, list);
  }
  const slotIndexesWithLessonIds = [...bySlot.entries()].map(([slotIndex, lessonIds]) => ({ slotIndex, lessonIds }));
  const slotIndexes = slotIndexesWithLessonIds.map((x) => x.slotIndex).sort((a, b) => a - b);
  const candidates = getTeachersInSchoolForDay(date, sickTeacherUserId);
  if (!candidates.length) return { ok: false, message: "Не найдены кандидаты на замену на сегодня." };
  const session = botReplacementStore.createSession({
    sickTeacherUserId,
    date,
    slotIndexesWithLessonIds,
    candidateUserIds: candidates,
  });
  const sick = userStore.findById(sickTeacherUserId);
  const sickName = sick ? fio(sick) : "педагог";
  for (const candidateUserId of candidates) {
    const candidate = userStore.findById(candidateUserId);
    const msg = messengerStore.createDirectMessage({
      fromUserId: botUserId,
      toUserId: candidateUserId,
      text: `${candidate ? fio(candidate) : "Коллега"}, сегодня педагог ${sickName} заболел, нужно выйти на замену на уроки: ${slotIndexes.join(", ")}. Вы сможете?`,
    });
    botReplacementStore.createPrompt({
      sessionId: session.id,
      candidateUserId,
      messageId: msg.id,
      availableSlotIndexes: slotIndexes,
    });
  }
  return { ok: true, message: `Запросы отправлены кандидатам (${candidates.length}).` };
}

export function buildBotPromptAction(messageId: string, viewerUserId: string): Record<string, unknown> | null {
  const p = botReplacementStore.findPromptByMessageId(messageId);
  if (!p || p.candidateUserId !== viewerUserId) return null;
  const s = botReplacementStore.findSessionById(p.sessionId);
  if (!s || s.status !== "active") return null;
  const covered = new Set(s.slots.filter((x) => x.coveredByUserId).map((x) => x.slotIndex));
  const available = p.availableSlotIndexes.filter((x) => !covered.has(x));
  if (messageId === p.confirmMessageId) {
    return {
      type: "replacement_confirm",
      promptId: p.id,
      selectedSlotIndexes: p.selectedSlotIndexes.filter((x) => available.includes(x)),
    };
  }
  return {
    type: "replacement_slot_select",
    promptId: p.id,
    availableSlotIndexes: available,
    selectedSlotIndexes: p.selectedSlotIndexes.filter((x) => available.includes(x)),
  };
}

export function togglePromptSlot(promptId: string, candidateUserId: string, slotIndex: number): { ok: boolean; error?: string } {
  const p = botReplacementStore.findPromptById(promptId);
  if (!p || p.candidateUserId !== candidateUserId) return { ok: false, error: "NOT_FOUND" };
  const s = botReplacementStore.findSessionById(p.sessionId);
  if (!s || s.status !== "active") return { ok: false, error: "SESSION_INACTIVE" };
  const slot = s.slots.find((x) => x.slotIndex === slotIndex);
  if (!slot || slot.coveredByUserId) return { ok: false, error: "SLOT_UNAVAILABLE" };
  if (!p.availableSlotIndexes.includes(slotIndex)) return { ok: false, error: "SLOT_UNAVAILABLE" };
  const selected = new Set(p.selectedSlotIndexes);
  if (selected.has(slotIndex)) selected.delete(slotIndex);
  else selected.add(slotIndex);
  botReplacementStore.updatePrompt(promptId, { selectedSlotIndexes: [...selected].sort((a, b) => a - b), state: "pending" });
  return { ok: true };
}

export function requestPromptConfirmation(promptId: string, candidateUserId: string, botUserId: string): { ok: boolean; error?: string } {
  const p = botReplacementStore.findPromptById(promptId);
  if (!p || p.candidateUserId !== candidateUserId) return { ok: false, error: "NOT_FOUND" };
  const selected = [...p.selectedSlotIndexes].sort((a, b) => a - b);
  if (!selected.length) return { ok: false, error: "NO_SLOTS_SELECTED" };
  const msg = messengerStore.createDirectMessage({
    fromUserId: botUserId,
    toUserId: candidateUserId,
    text: `Вы уверены, что хотите заменить урок(и): ${selected.join(", ")}?`,
  });
  botReplacementStore.updatePrompt(promptId, { state: "confirming", confirmMessageId: msg.id });
  return { ok: true };
}

function notifyTeachersGroup(botUserId: string, text: string): void {
  messengerStore.syncSystemGroups(userStore.list(), botUserId);
  const teachersGroup = messengerStore.listGroupsForUser(botUserId).find((g) => g.isSystemGroup && g.systemGroupKey === "teachers");
  if (!teachersGroup) return;
  const topic = messengerStore.listTopics(teachersGroup.id).find((t) => t.isDefault) ?? messengerStore.listTopics(teachersGroup.id)[0];
  if (!topic) return;
  messengerStore.appendGroupSystemMessage({ groupId: teachersGroup.id, topicId: topic.id, text });
}

export function confirmPrompt(promptId: string, candidateUserId: string, botUserId: string, ok: boolean): { ok: boolean; error?: string } {
  const p = botReplacementStore.findPromptById(promptId);
  if (!p || p.candidateUserId !== candidateUserId) return { ok: false, error: "NOT_FOUND" };
  if (!ok) {
    botReplacementStore.updatePrompt(promptId, { state: "pending", confirmMessageId: null });
    return { ok: true };
  }
  const s = botReplacementStore.findSessionById(p.sessionId);
  if (!s || s.status !== "active") return { ok: false, error: "SESSION_INACTIVE" };
  const toCover = p.selectedSlotIndexes.filter((slot) => {
    const row = s.slots.find((x) => x.slotIndex === slot);
    return row && !row.coveredByUserId;
  });
  if (!toCover.length) return { ok: false, error: "SLOTS_ALREADY_COVERED" };
  for (const slotIndex of toCover) {
    const row = s.slots.find((x) => x.slotIndex === slotIndex);
    if (!row) continue;
    for (const lessonId of row.lessonIds) {
      const lesson = timetableLessonStore.findById(lessonId);
      if (!lesson) continue;
      const matchingLoad = teacherLoadStore.findMatchingLoad({
        teacherUserId: candidateUserId,
        disciplineCode: lesson.disciplineCode,
        grade: lesson.grade,
        groupNumber: lesson.groupNumber ?? null,
        classGroupId: lesson.classGroupId ?? null,
      });
      timetableLessonStore.updateById(lesson.id, {
        teacherUserId: candidateUserId,
        teacherLoadId: matchingLoad?.id ?? null,
        // Дисциплину не меняем: подмена происходит только по учителю в существующем слоте.
      });
    }
  }
  const next = botReplacementStore.coverSlots(s.id, toCover, candidateUserId);
  botReplacementStore.updatePrompt(promptId, { state: "accepted", confirmMessageId: null });
  const prompts = botReplacementStore.listPromptsForSession(s.id);
  for (const pr of prompts) {
    if (pr.id === promptId) continue;
    const nextAvail = pr.availableSlotIndexes.filter((x) => !toCover.includes(x));
    const nextSel = pr.selectedSlotIndexes.filter((x) => nextAvail.includes(x));
    botReplacementStore.updatePrompt(pr.id, { availableSlotIndexes: nextAvail, selectedSlotIndexes: nextSel });
  }
  const sick = userStore.findById(s.sickTeacherUserId);
  const repl = userStore.findById(candidateUserId);
  const classHint = (() => {
    const firstLesson = s.slots.find((x) => toCover.includes(x.slotIndex))?.lessonIds[0];
    const lesson = firstLesson ? timetableLessonStore.findById(firstLesson) : undefined;
    return lesson ? `${lesson.grade}` : "";
  })();
  notifyTeachersGroup(
    botUserId,
    `Внимание, в связи с болезнью педагога ${sick ? fio(sick) : "педагога"} произошла замена: ${toCover.join(", ")} урок(и) в ${classHint} классе будет вести ${repl ? fio(repl) : "педагог"}.`,
  );
  if (next?.status === "completed") {
    // no-op: session closed automatically in store
  }
  // TODO: при связке API ↔ модуль бухгалтерии (SQLite) — создавать SubstitutionEntry / синхронизировать часы,
  // чтобы пересчёт прогона ЗП подхватывал замену и актуальные ПК/ПР/ОП без ручного ввода.
  return { ok: true };
}

export function runReplacementEscalationTick(botUserId: string): void {
  const now = new Date();
  for (const session of botReplacementStore.listActiveSessions()) {
    const missing = session.slots.filter((s) => !s.coveredByUserId);
    for (const slot of missing) {
      if (slot.escalatedAt) continue;
      const startAt = lessonStartDateTime(session.date, slot.slotIndex);
      const diffMs = startAt.getTime() - now.getTime();
      if (diffMs <= 15 * 60 * 1000) {
        notifyTeachersGroup(botUserId, `Внимание, замена на урок(и) ${slot.slotIndex} так и не найдена, срочно нужно принять меры!`);
        botReplacementStore.markEscalated(session.id, slot.slotIndex);
      }
    }
  }
}

