import { disciplineStore } from "../store/disciplineStore.js";
import { journalStore } from "../store/journalStore.js";
import { messengerStore } from "../store/messengerStore.js";
import { userStore } from "../store/userStore.js";
import { listEffectiveLessons } from "./effectiveLessons.js";
import type { JournalRevisionPayload, RevisionJob } from "../types/revisionJobs.js";

function fio(u: { lastName: string; firstName: string; patronymic: string }): string {
  return `${u.lastName} ${u.firstName} ${u.patronymic}`.trim();
}

function fmtDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return `${d.slice(8, 10)}.${d.slice(5, 7)}`;
}

function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

export function runJournalRevision(job: RevisionJob & { payload: JournalRevisionPayload }): void {
  const bot = userStore.findSystemBot();
  if (!bot) throw new Error("BOT_MISSING");

  const { payload } = job;
  const lessonsAll = listEffectiveLessons({ from: payload.lessonDateFrom, to: payload.lessonDateTo });
  const lessonIds = lessonsAll.map((l) => l.id);
  const metaByLessonId = new Map(journalStore.getMetaByLessonIds(lessonIds).map((m) => [m.timetableLessonId, m] as const));
  const marksByLessonId = new Map<string, number>();
  for (const m of journalStore.getMarksByLessonIds(lessonIds)) {
    if (m.absent) continue;
    if (typeof m.mark !== "number" || !Number.isFinite(m.mark)) continue;
    marksByLessonId.set(m.timetableLessonId, (marksByLessonId.get(m.timetableLessonId) ?? 0) + 1);
  }

  const summaryRows: Array<{ teacherUserId: string; text: string }> = [];

  for (const slot of payload.includedSlots) {
    const discipline = disciplineStore.findByCode(slot.disciplineCode);
    if (!discipline || discipline.grade !== slot.grade) continue;

    const teacher = userStore.findById(slot.teacherUserId);
    const teacherName = teacher ? fio(teacher) : slot.teacherUserId;

    const lessons = lessonsAll
      .filter(
        (l) =>
          l.grade === slot.grade &&
          l.disciplineCode === slot.disciplineCode &&
          l.teacherUserId === slot.teacherUserId,
      )
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.slotIndex - b.slotIndex));

    const missingLessons: string[] = [];
    const noTopic: string[] = [];
    let marksCount = 0;

    for (const lesson of lessons) {
      const meta = metaByLessonId.get(lesson.id);
      if (payload.checks.lessons && !meta) {
        missingLessons.push(`${fmtDate(lesson.date)}${lesson.slotIndex ? ` (${lesson.slotIndex})` : ""}`);
      }
      if (payload.checks.topics) {
        const topic = (meta?.topic ?? "").trim();
        if (!topic) noTopic.push(`${fmtDate(lesson.date)}${lesson.slotIndex ? ` (${lesson.slotIndex})` : ""}`);
      }
      if (payload.checks.marks) marksCount += marksByLessonId.get(lesson.id) ?? 0;
    }

    const hasMissingLessons = payload.checks.lessons ? missingLessons.length > 0 : false;
    const hasNoTopic = payload.checks.topics ? noTopic.length > 0 : false;
    const hasNoMarks = payload.checks.marks ? marksCount < 1 : false;
    const hasProblems = hasMissingLessons || hasNoTopic || hasNoMarks;

    const title = `Ревизия журнала по предмету ${discipline.name} ${slot.grade} класс за период ${payload.lessonDateFrom} - ${payload.lessonDateTo}`;
    let teacherText: string;
    let summaryText: string;
    if (!hasProblems) {
      teacherText = `${title}:\n\nВсе уроки, прошедшие по расписанию, отражены, темы заполнены, оценки выставлены. Поздравляем!`;
      summaryText = `${teacherName}, ${discipline.name} ${slot.grade} класс: все уроки отражены, темы заполнены, оценки есть.`;
    } else {
      const lines: string[] = [];
      const short: string[] = [];
      if (payload.checks.lessons && hasMissingLessons) {
        const dates = uniqSorted(missingLessons);
        lines.push(`- не отражены уроки: ${dates.join(", ")};`);
        short.push(`${dates.length} урока(ов) не отражены (${dates.join(", ")})`);
      }
      if (payload.checks.topics && hasNoTopic) {
        const dates = uniqSorted(noTopic);
        lines.push(`- нет темы урока: ${dates.join(", ")};`);
        short.push(`${dates.length} урока(ов) без темы (${dates.join(", ")})`);
      }
      if (payload.checks.marks && hasNoMarks) {
        lines.push("- за период нет ни одной оценки.");
        short.push("оценок за период нет");
      }
      teacherText = `${title} показала:\n\n${lines.join("\n")}`;
      summaryText = `${teacherName}, ${discipline.name} ${slot.grade} класс: ${short.join(", ")}.`;
    }

    messengerStore.createDirectMessage({
      fromUserId: bot.id,
      toUserId: slot.teacherUserId,
      text: teacherText,
    });
    summaryRows.push({ teacherUserId: slot.teacherUserId, text: summaryText });
  }

  const summary = [
    `Ревизия журнала за период ${payload.lessonDateFrom} - ${payload.lessonDateTo} завершена.`,
    "",
    "Итоги по выбранным классам и предметам:",
    ...(summaryRows.length > 0 ? summaryRows.map((x) => `- ${x.text}`) : ["- Нет данных для выбранных фильтров."]),
  ];
  messengerStore.createDirectMessage({
    fromUserId: bot.id,
    toUserId: job.createdByUserId,
    text: summary.join("\n"),
  });
}
