import { buildJournalLessonLinkToken, formatRuLessonDateFolder } from "./journalLessonDocuments.js";
import { listEffectiveLessons } from "./effectiveLessons.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { documentStore } from "../store/documentStore.js";
import { journalDocumentTypeStore } from "../store/journalDocumentTypeStore.js";
import { journalStore } from "../store/journalStore.js";
import { messengerStore } from "../store/messengerStore.js";
import { userStore } from "../store/userStore.js";
import type { DocumentationRevisionPayload, RevisionJob } from "../types/revisionJobs.js";

function fio(u: { lastName: string; firstName: string; patronymic: string }): string {
  return `${u.lastName} ${u.firstName} ${u.patronymic}`.trim();
}

function buildJournalPeriodIndex(): Set<string> {
  const set = new Set<string>();
  for (const d of documentStore.listAll()) {
    for (const p of d.tags?.periods ?? []) {
      if (typeof p === "string" && p.startsWith("jl:")) set.add(p);
    }
  }
  return set;
}

export function runDocumentationRevision(job: RevisionJob & { payload: DocumentationRevisionPayload }): void {
  const bot = userStore.findSystemBot();
  if (!bot) throw new Error("BOT_MISSING");

  const { payload } = job;
  const periodIndex = buildJournalPeriodIndex();
  const missingByTeacher = new Map<string, Array<{ detail: string }>>();

  const lessons = listEffectiveLessons({ from: payload.lessonDateFrom, to: payload.lessonDateTo });
  const lessonMetaByLessonId = new Map(
    journalStore.getMetaByLessonIds(lessons.map((l) => l.id)).map((m) => [m.timetableLessonId, m] as const),
  );

  for (const slot of payload.includedSlots) {
    const discipline = disciplineStore.findByCode(slot.disciplineCode);
    if (!discipline || discipline.grade !== slot.grade) continue;

    const slotLessons = lessons.filter(
      (l) =>
        l.grade === slot.grade &&
        l.disciplineCode === slot.disciplineCode &&
        l.teacherUserId === slot.teacherUserId,
    );

    for (const lesson of slotLessons) {
      for (const jtId of payload.journalDocumentTypeIds) {
        const jt = journalDocumentTypeStore.findById(jtId);
        if (!jt) continue;
        const lessonTypeId = lessonMetaByLessonId.get(lesson.id)?.journalLessonTypeId ?? null;
        const boundLessonTypes = jt.requiredForLessonTypeIds;
        if (Array.isArray(boundLessonTypes) && boundLessonTypes.length > 0) {
          if (!lessonTypeId || !boundLessonTypes.includes(lessonTypeId)) continue;
        }
        const token = buildJournalLessonLinkToken({
          timetableLessonId: lesson.id,
          journalDocumentTypeId: jtId,
          groupNumber: lesson.groupNumber ?? null,
        });
        if (periodIndex.has(token)) continue;
        const folderHint = `${discipline.name} ${slot.grade} класс / ${formatRuLessonDateFolder(lesson.date)}`;
        const detail = `${jt.name} в папке ${folderHint}`;
        const list = missingByTeacher.get(slot.teacherUserId) ?? [];
        list.push({ detail });
        missingByTeacher.set(slot.teacherUserId, list);
      }
    }
  }

  const teachersInScope = new Set(payload.includedSlots.map((s) => s.teacherUserId));
  for (const tid of teachersInScope) {
    const tUser = userStore.findById(tid);
    if (!tUser) continue;
    const missing = missingByTeacher.get(tid) ?? [];
    if (missing.length === 0) {
      messengerStore.createDirectMessage({
        fromUserId: bot.id,
        toUserId: tid,
        text: "Вы успешно прошли ревизию, поздравляем!",
      });
    } else {
      const n = missing.length;
      const lines = missing.map((m) => m.detail).join("; ");
      messengerStore.createDirectMessage({
        fromUserId: bot.id,
        toUserId: tid,
        text: `У вас есть ${n} незагруженных документов. Вам необходимо загрузить: ${lines}.`,
      });
    }
  }

  const summaryLines: string[] = ["Сводка ревизии документации:"];
  for (const tid of [...teachersInScope].sort()) {
    const u = userStore.findById(tid);
    if (!u) continue;
    const n = (missingByTeacher.get(tid) ?? []).length;
    summaryLines.push(`${fio(u)} — ${n} незагруженных документов`);
  }
  messengerStore.createDirectMessage({
    fromUserId: bot.id,
    toUserId: job.createdByUserId,
    text: summaryLines.join("\n"),
  });
}
