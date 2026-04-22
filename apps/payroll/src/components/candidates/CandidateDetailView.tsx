import type { ReactNode } from "react";
import type { EdumedCandidateDetail } from "@/lib/payroll/edumed-candidates";
import { absoluteFileUrl, candidateRoleLabelRu } from "@/lib/payroll/edumed-candidates";
import type { CandidateSalaryPreview } from "@/lib/payroll/candidate-salary-preview";
import { CandidateSalaryDonutPanel } from "@/components/candidates/CandidateSalaryDonutPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";

const SUBJECT_LABELS: Record<string, string> = {
  mathematics: "Математика",
  informatics: "Информатика",
  russian_language: "Русский язык",
  history: "История",
  physics: "Физика",
  chemistry: "Химия",
  biology: "Биология",
  english: "Английский",
  other: "Другое",
};

const HIRING_STAGE_RU: Record<string, string> = {
  new_application: "Новая анкета",
  interview_scheduled: "Интервью назначено",
  interview_completed: "Интервью проведено",
  demo_completed: "Демо-урок проведён",
  offer_made: "Оффер сделан",
  hired: "Вышел на работу",
  rejected: "Отказ",
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{value ?? "—"}</dd>
    </div>
  );
}

function formatStartCategory(v: unknown): ReactNode {
  if (v == null || v === "") return "—";
  const s = String(v).trim().toLowerCase();
  if (s === "none" || s === "null" || s === "undefined") return "Не определена";
  return String(v);
}

function disp(v: unknown): ReactNode {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

function formatSubjects(subjects: unknown, otherText: unknown): string {
  if (!Array.isArray(subjects)) return "—";
  const parts = subjects.map((s) => (typeof s === "string" ? SUBJECT_LABELS[s] ?? s : String(s)));
  const hasOther = subjects.includes("other");
  if (hasOther && typeof otherText === "string" && otherText.trim()) {
    return `${parts.filter((x) => x !== "Другое").join(", ")}${parts.length ? ", " : ""}Другое: ${otherText}`;
  }
  return parts.join(", ") || "—";
}

type AnalyticsShape = {
  hiringStage?: string;
  desiredRoleOverride?: string | null;
  recommendation?: {
    allowedRole?: string;
    branchTitle?: string;
    startCategory?: string;
    recommendedRateMin?: number | null;
    recommendedRateMax?: number | null;
    explanation?: string;
    assignmentWarning?: string | null;
  } | null;
};

export function CandidateDetailView({
  candidate,
  salaryPreview,
}: {
  candidate: EdumedCandidateDetail;
  salaryPreview: CandidateSalaryPreview | null;
}) {
  const { status, application: rawApp, analytics: rawAn, files } = candidate;
  const app = rawApp as Record<string, any> | null;
  const analytics = rawAn as AnalyticsShape | null;

  const roleLine = candidateRoleLabelRu(analytics as any, app as any);
  const fio = app?.contacts?.fullName?.trim() ?? null;
  const avatar = files.find((f) => f.category === "avatar");
  const avatarSrc = avatar ? absoluteFileUrl(avatar.storageRelPath) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fio ?? "Кандидат"}
        meta={
          status === "invited"
            ? "Статус: приглашён · анкета не заполнена"
            : `Статус: анкета отправлена · кандидат на роль: ${roleLine}`
        }
      />

      <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-border/60 bg-card p-4 ring-1 ring-border/40">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt="" className="h-20 w-20 shrink-0 rounded-full border border-border/60 object-cover" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-border/60 bg-elevated text-lg font-semibold text-muted-foreground">
            {(fio?.[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div className="min-w-0 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Роль (расчёт / анкета): </span>
            {roleLine}
          </p>
          {app?.teachingExperience?.aboutMeText ? (
            <p className="mt-2 leading-relaxed text-foreground">{String(app.teachingExperience.aboutMeText)}</p>
          ) : null}
        </div>
      </div>

      {status === "invited" || !app ? (
        <SectionCard title="Анкета" variant="quiet">
          <p className="text-sm text-muted-foreground">Кандидат ещё не заполнил анкету по ссылке из приглашения.</p>
        </SectionCard>
      ) : null}

      {status === "submitted" && analytics ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
          <div className="w-full shrink-0 lg:max-w-[28rem] xl:max-w-[34rem]">
            <SectionCard title="Аналитическая рекомендация" variant="quiet" className="flex h-full min-h-0 flex-col">
              <dl className="space-y-3">
                <Row
                  label="Допустимая роль"
                  value={
                    analytics.recommendation?.allowedRole === "teacher"
                      ? "Учитель"
                      : analytics.recommendation?.allowedRole === "assistant_intern"
                        ? "Стажёр / ассистент"
                        : "—"
                  }
                />
                <Row label="Ветка" value={analytics.recommendation?.branchTitle ?? "—"} />
                <Row label="Стартовая категория" value={formatStartCategory(analytics.recommendation?.startCategory)} />
                <Row
                  label="Рекомендуемый ПК (диапазон)"
                  value={
                    analytics.recommendation?.recommendedRateMin != null &&
                    analytics.recommendation?.recommendedRateMax != null
                      ? `${analytics.recommendation.recommendedRateMin}–${analytics.recommendation.recommendedRateMax}`
                      : "не назначается"
                  }
                />
                <Row
                  label="Этап найма"
                  value={HIRING_STAGE_RU[analytics.hiringStage ?? ""] ?? analytics.hiringStage ?? "—"}
                />
                <Row label="Пояснение" value={analytics.recommendation?.explanation ?? "—"} />
              </dl>
              {analytics.recommendation?.assignmentWarning ? (
                <p className="mt-4 rounded-xl border border-warning/25 bg-warning-soft/50 px-3 py-2 text-sm text-foreground">
                  {analytics.recommendation.assignmentWarning}
                </p>
              ) : null}
            </SectionCard>
          </div>
          {salaryPreview ? (
            <div className="min-w-0 flex-1">
              <CandidateSalaryDonutPanel preview={salaryPreview} className="min-h-0" />
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "submitted" && app ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <SectionCard title="Шаг 0. Контакты и согласие">
              <dl className="space-y-3">
                <Row label="ФИО" value={disp(app.contacts?.fullName)} />
                <Row label="Email" value={disp(app.contacts?.email)} />
                <Row label="Телефон" value={disp(app.contacts?.phone)} />
                <Row label="Город" value={disp(app.contacts?.city)} />
                <Row label="Часовой пояс" value={disp(app.contacts?.timezone)} />
                <Row label="Согласие на обработку" value={app.contacts?.consentProcessing ? "принято" : "нет"} />
              </dl>
            </SectionCard>

            <SectionCard title="Шаг 1. Роль">
              <dl className="space-y-3">
                <Row label="Уровни классов" value={disp(app.role?.desiredLevels)} />
                <Row
                  label="Предмет(ы)"
                  value={formatSubjects(app.role?.subjects, app.role?.subjectsOtherText)}
                />
                <Row label="Формат занятости" value={disp(app.role?.employmentFormat)} />
              </dl>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Шаг 2. Образование">
              <dl className="space-y-3">
                <Row label="Уровень образования" value={disp(app.education?.educationLevel)} />
                <Row label="Педпереподготовка" value={disp(app.education?.teacherReprepStatus)} />
                <Row label="Учебное заведение" value={disp(app.education?.institutionName)} />
                <Row label="Специальность" value={disp(app.education?.specialtyText)} />
                <Row label="Год окончания" value={disp(app.education?.graduationYear)} />
                <Row label="Доп. обучение" value={disp(app.education?.additionalTrainingText)} />
              </dl>
            </SectionCard>

            <SectionCard title="Шаг 3. Опыт">
              <dl className="space-y-3">
                <Row label="Опыт в школе" value={disp(app.teachingExperience?.teachingSchoolExperience)} />
                <Row label="Репетиторство" value={disp(app.teachingExperience?.tutoringExperience)} />
                <Row label="Учеников в месяц (реп.)" value={disp(app.teachingExperience?.stableTutoringStudentsPerMonth)} />
                <Row label="Возрастные группы" value={disp(app.teachingExperience?.agesWorked)} />
                <Row label="О себе" value={disp(app.teachingExperience?.aboutMeText)} />
                <Row label="Результаты" value={disp(app.teachingExperience?.examplesResultsText)} />
              </dl>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Шаг 4. Предметность">
              <dl className="space-y-3">
                <Row label="Уверенность 0–10" value={disp(app.subject?.subjectConfidence0to10)} />
                <Row label="Сложные темы" value={disp(app.subject?.difficultTopicsText)} />
                <Row label="Готовность к мини-тесту" value={app.subject?.readyMiniTest ? "Да" : "Нет"} />
              </dl>
            </SectionCard>

            <SectionCard title="Шаг 5. Стандарты">
              <dl className="space-y-3">
                <Row label="Готовность 0–10" value={disp(app.standards?.arhimedesReadiness0to10)} />
                <Row label="Опыт (журнал / критерии / …)" value={disp(app.standards?.experienceJournalCriteriaAnalyticsIom)} />
                <Row label="Отношение к наблюдению" value={disp(app.standards?.observationAttitude)} />
                <Row label="Комментарий" value={disp(app.standards?.experienceText)} />
              </dl>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Шаг 6. STAR — дисциплина">
              <dl className="space-y-3">
                <Row label="S" value={disp(app.starCases?.disciplineStarCase?.disciplineS)} />
                <Row label="T" value={disp(app.starCases?.disciplineStarCase?.disciplineT)} />
                <Row label="A" value={disp(app.starCases?.disciplineStarCase?.disciplineA)} />
                <Row label="R" value={disp(app.starCases?.disciplineStarCase?.disciplineR)} />
              </dl>
            </SectionCard>
            <SectionCard title="Шаг 6. STAR — родители / оценка">
              <dl className="space-y-3">
                <Row label="S" value={disp(app.starCases?.parentsAssessmentStarCase?.disciplineS)} />
                <Row label="T" value={disp(app.starCases?.parentsAssessmentStarCase?.disciplineT)} />
                <Row label="A" value={disp(app.starCases?.parentsAssessmentStarCase?.disciplineA)} />
                <Row label="R" value={disp(app.starCases?.parentsAssessmentStarCase?.disciplineR)} />
              </dl>
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Шаг 7. Файлы">
              <FilesBlock files={files} />
            </SectionCard>

            <SectionCard title="Шаг 8. Условия">
              <dl className="space-y-3">
                <Row label="Когда готов выйти" value={disp(app.conditions?.readyToStart)} />
                <Row label="Комментарии" value={disp(app.conditions?.additionalCommentsText)} />
              </dl>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FilesBlock({ files }: { files: EdumedCandidateDetail["files"] }) {
  if (!files.length) {
    return <p className="text-sm text-muted-foreground">Файлы не прикреплены.</p>;
  }

  const groups: { title: string; cat: string }[] = [
    { title: "Аватар", cat: "avatar" },
    { title: "Несудимость", cat: "no_conviction" },
    { title: "Резюме", cat: "resume" },
    { title: "Дипломы", cat: "diploma" },
    { title: "Конспекты / материалы", cat: "lesson_plan" },
    { title: "Портфолио", cat: "portfolio" },
    { title: "Прочее", cat: "other" },
  ];

  return (
    <ul className="space-y-4">
      {groups.map(({ title, cat }) => {
        const list = files.filter((f) => f.category === cat);
        if (!list.length) return null;
        return (
          <li key={cat}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            <ul className="mt-2 space-y-1">
              {list.map((f) => (
                <li key={`${f.category}-${f.storageRelPath}`}>
                  <a
                    href={absoluteFileUrl(f.storageRelPath)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-accent hover:text-accent-hover hover:underline"
                  >
                    {f.originalName?.trim() || f.storageRelPath.split("/").pop() || "Файл"}
                  </a>
                  <span className="ml-2 text-xs text-muted-foreground">{f.category}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
