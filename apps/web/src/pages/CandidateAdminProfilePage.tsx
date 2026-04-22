import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { canAccessSchoolUserManagement } from "../lib/viewerRoles";
import { useAuth } from "../state/auth";
import type { CandidateAnalytics, CandidateApplication, CandidateFile } from "../types/candidates";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function SmallRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">{value ?? "—"}</div>
    </div>
  );
}

function FilesList({ files }: { files: CandidateFile[] }) {
  if (!files.length) return <div className="text-sm text-slate-600">Нет файлов.</div>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
      {files.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <a href={f.url} target="_blank" rel="noreferrer" className="truncate font-medium text-slate-800 underline-offset-2 hover:underline">
            {f.originalName}
          </a>
          <span className="shrink-0 text-xs text-slate-400">{f.category}</span>
        </li>
      ))}
    </ul>
  );
}

export function CandidateAdminProfilePage() {
  const { candidateId } = useParams();
  const id = candidateId ?? "";
  const auth = useAuth();
  const token = auth.accessToken;
  const viewer = auth.user;
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"invited" | "submitted" | null>(null);
  const [application, setApplication] = useState<CandidateApplication | null>(null);
  const [analytics, setAnalytics] = useState<CandidateAnalytics | null>(null);
  const [files, setFiles] = useState<CandidateFile[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [analyticsForm, setAnalyticsForm] = useState({
    hiringStage: "new_application",
    interviewScoreDiscipline0to5: "",
    interviewScoreParents0to5: "",
    demoLessonScore0to5: "",
    artifactScore0to5: "",
    artifactNotes: "",
  });

  const canEdit = canAccessSchoolUserManagement(viewer ?? undefined);

  useEffect(() => {
    if (!token || !id) return;
    if (!canEdit) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.candidates
      .details(token, id)
      .then((r) => {
        if (cancelled) return;
        setStatus(r.status);
        setApplication(r.application);
        setAnalytics(r.analytics ?? null);
        setFiles(r.files ?? []);
        setAnalyticsForm({
          hiringStage: r.analytics?.hiringStage ?? "new_application",
          interviewScoreDiscipline0to5: r.analytics?.interviewScoreDiscipline0to5 != null ? String(r.analytics.interviewScoreDiscipline0to5) : "",
          interviewScoreParents0to5: r.analytics?.interviewScoreParents0to5 != null ? String(r.analytics.interviewScoreParents0to5) : "",
          demoLessonScore0to5: r.analytics?.demoLessonScore0to5 != null ? String(r.analytics.demoLessonScore0to5) : "",
          artifactScore0to5: r.analytics?.artifactScore0to5 != null ? String(r.analytics.artifactScore0to5) : "",
          artifactNotes: r.analytics?.artifactNotes ?? "",
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "LOAD_FAILED");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, id, canEdit]);

  const avatarUrl = useMemo(() => files.find((f) => f.category === "avatar")?.url ?? null, [files]);
  const fio = application?.contacts.fullName ?? null;
  const aboutMe = application?.teachingExperience.aboutMeText ?? null;

  async function recalcAnalytics() {
    if (!token || !id) return;
    setBusyAction("recalc");
    try {
      const result = await api.candidates.calculateAnalytics(token, id);
      const next = result.candidate?.analytics ?? null;
      setAnalytics(next);
      if (next) {
        setAnalyticsForm((prev) => ({
          ...prev,
          hiringStage: next.hiringStage ?? prev.hiringStage,
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "CALCULATION_FAILED");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveAnalytics() {
    if (!token || !id) return;
    setBusyAction("save");
    try {
      const result = await api.candidates.updateAnalytics(token, id, {
        hiringStage: analyticsForm.hiringStage,
        interviewScoreDiscipline0to5:
          analyticsForm.interviewScoreDiscipline0to5.trim() === "" ? null : Number(analyticsForm.interviewScoreDiscipline0to5),
        interviewScoreParents0to5:
          analyticsForm.interviewScoreParents0to5.trim() === "" ? null : Number(analyticsForm.interviewScoreParents0to5),
        demoLessonScore0to5: analyticsForm.demoLessonScore0to5.trim() === "" ? null : Number(analyticsForm.demoLessonScore0to5),
        artifactScore0to5: analyticsForm.artifactScore0to5.trim() === "" ? null : Number(analyticsForm.artifactScore0to5),
        artifactNotes: analyticsForm.artifactNotes,
      });
      setAnalytics(result.candidate?.analytics ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setBusyAction(null);
    }
  }

  async function hireTeacher() {
    if (!token || !id) return;
    setBusyAction("hire");
    try {
      const result = await api.candidates.hire(token, id);
      setAnalytics(result.candidate?.analytics ?? null);
      if (result.teacherUserId) nav(`/section/users_admin/teacher/${result.teacherUserId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "HIRE_FAILED");
    } finally {
      setBusyAction(null);
    }
  }

  if (!viewer || !canEdit) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Нет доступа к профилю кандидата.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">
        Загрузка профиля…
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {error ?? "Не найдено"}
        <div className="mt-3">
          <button type="button" className="text-sm font-medium text-slate-900 underline" onClick={() => nav("/section/users_admin")}>
            ← К управлению пользователями
          </button>
        </div>
      </div>
    );
  }

  const noConvictionFiles = files.filter((f) => f.category === "no_conviction");
  const byCategory = (cat: string) => files.filter((f) => f.category === cat);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xl font-semibold text-slate-600">
                {(fio?.[0] ?? "К")}
              </div>
            )}
            <div>
              <div className="text-xs font-medium text-slate-500">Кандидат</div>
              <div className="text-lg font-semibold text-slate-900">{fio ?? "—"}</div>
              <div className="mt-1 text-sm text-slate-600">
                Статус:{" "}
                <span className="font-medium text-slate-900">{status === "invited" ? "приглашен" : "анкета заполнена"}</span>
              </div>
              {aboutMe ? <div className="mt-2 text-sm text-slate-700">{aboutMe}</div> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status === "submitted" ? (
              <>
                <button
                  type="button"
                  onClick={() => void recalcAnalytics()}
                  disabled={busyAction != null}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
                >
                  {busyAction === "recalc" ? "Расчёт..." : "Рассчитать ветку и ставку"}
                </button>
                <button
                  type="button"
                  onClick={() => void hireTeacher()}
                  disabled={busyAction != null || analytics?.recommendation?.allowedRole !== "teacher"}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busyAction === "hire" ? "Создание..." : "Перевести в учителя"}
                </button>
              </>
            ) : null}
            <Link to="/section/users_admin" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900">
              ← К списку кандидатов
            </Link>
          </div>
        </div>
      </div>

      {status === "invited" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">
          Кандидат ещё не заполнил анкету.
        </div>
      ) : null}

      {status === "submitted" && application ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Аналитическая рекомендация">
              <SmallRow label="Допустимая роль" value={analytics?.recommendation?.allowedRole === "teacher" ? "учитель" : "стажер/ассистент"} />
              <SmallRow label="Ветка" value={analytics?.recommendation?.branchTitle ?? "—"} />
              <SmallRow label="Стартовая категория" value={analytics?.recommendation?.startCategory ?? "—"} />
              <SmallRow
                label="Рекомендуемый ПК"
                value={
                  analytics?.recommendation?.recommendedRateMin != null && analytics?.recommendation?.recommendedRateMax != null
                    ? `${analytics.recommendation.recommendedRateMin}–${analytics.recommendation.recommendedRateMax}`
                    : "не назначается"
                }
              />
              <SmallRow label="Этап найма" value={analytics?.hiringStage ?? "new_application"} />
              <SmallRow label="Пояснение" value={analytics?.recommendation?.explanation ?? "Сначала выполните расчёт."} />
              {analytics?.recommendation?.assignmentWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {analytics.recommendation.assignmentWarning}
                </div>
              ) : null}
            </Card>

            <Card title="HR-оценки и этапы">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <div className="text-xs font-medium text-slate-500">Этап найма</div>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={analyticsForm.hiringStage}
                    onChange={(e) => setAnalyticsForm((prev) => ({ ...prev, hiringStage: e.target.value }))}
                  >
                    <option value="new_application">Новая анкета</option>
                    <option value="interview_scheduled">Интервью назначено</option>
                    <option value="interview_completed">Интервью проведено</option>
                    <option value="demo_completed">Демо-урок проведен</option>
                    <option value="offer_made">Оффер сделан</option>
                    <option value="hired">Вышел на работу</option>
                    <option value="rejected">Отказ</option>
                  </select>
                </label>
                <label className="text-sm">
                  <div className="text-xs font-medium text-slate-500">STAR: дисциплина (0-5)</div>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={analyticsForm.interviewScoreDiscipline0to5} onChange={(e) => setAnalyticsForm((prev) => ({ ...prev, interviewScoreDiscipline0to5: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <div className="text-xs font-medium text-slate-500">STAR: родители/конфликт (0-5)</div>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={analyticsForm.interviewScoreParents0to5} onChange={(e) => setAnalyticsForm((prev) => ({ ...prev, interviewScoreParents0to5: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <div className="text-xs font-medium text-slate-500">Демо-урок (0-5)</div>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={analyticsForm.demoLessonScore0to5} onChange={(e) => setAnalyticsForm((prev) => ({ ...prev, demoLessonScore0to5: e.target.value }))} />
                </label>
                <label className="text-sm">
                  <div className="text-xs font-medium text-slate-500">Артефакты (0-5)</div>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" value={analyticsForm.artifactScore0to5} onChange={(e) => setAnalyticsForm((prev) => ({ ...prev, artifactScore0to5: e.target.value }))} />
                </label>
                <label className="text-sm sm:col-span-2">
                  <div className="text-xs font-medium text-slate-500">Комментарий по артефактам</div>
                  <textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" value={analyticsForm.artifactNotes} onChange={(e) => setAnalyticsForm((prev) => ({ ...prev, artifactNotes: e.target.value }))} />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveAnalytics()}
                  disabled={busyAction != null}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busyAction === "save" ? "Сохранение..." : "Сохранить HR-оценки"}
                </button>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Шаг 0. Контакты и согласие">
              <SmallRow label="ФИО" value={application.contacts.fullName} />
              <SmallRow label="Email" value={application.contacts.email} />
              <SmallRow label="Телефон" value={application.contacts.phone} />
              <SmallRow label="Город" value={application.contacts.city ?? "—"} />
              <SmallRow label="Часовой пояс" value={application.contacts.timezone ?? "—"} />
              <SmallRow
                label="Согласие"
                value={application.contacts.consentProcessing ? <span className="text-emerald-700 font-medium">принято</span> : <span className="text-rose-700 font-medium">нет</span>}
              />
            </Card>

            <Card title="Шаг 1. Роль">
              <SmallRow label="Уровни" value={application.role.desiredLevels.join(", ")} />
              <SmallRow
                label="Предмет(ы)"
                value={
                  application.role.subjects.includes("other")
                    ? `${application.role.subjects.filter((s) => s !== "other").join(", ") || "—"} + Другое: ${application.role.subjectsOtherText ?? "—"}`
                    : application.role.subjects.join(", ")
                }
              />
              <SmallRow label="Формат занятости" value={application.role.employmentFormat} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Шаг 2. Образование и квалификация">
              <SmallRow label="Уровень образования" value={application.education.educationLevel} />
              <SmallRow label="Педпереподготовка" value={application.education.teacherReprepStatus} />
              <SmallRow label="Учебное заведение" value={application.education.institutionName} />
              <SmallRow label="Специальность" value={application.education.specialtyText} />
              <SmallRow label="Год окончания" value={application.education.graduationYear ?? "—"} />
              {application.education.teacherReprepStatus !== "no" ? (
                <>
                  <SmallRow label="Программа" value={application.education.reprepProgramText ?? "—"} />
                  <SmallRow label="Организация" value={application.education.reprepOrganizationText ?? "—"} />
                  <SmallRow label="Часы" value={application.education.reprepHours ?? "—"} />
                  <SmallRow label="Год" value={application.education.reprepYear ?? "—"} />
                </>
              ) : null}
              <SmallRow label="Доп. обучение" value={application.education.additionalTrainingText ?? "—"} />
            </Card>

            <Card title="Шаг 3. Опыт преподавания">
              <SmallRow label="Опыт в школе" value={application.teachingExperience.teachingSchoolExperience} />
              <SmallRow label="Репетиторство" value={application.teachingExperience.tutoringExperience} />
              <SmallRow
                label="Стабильно учеников в месяц"
                value={application.teachingExperience.stableTutoringStudentsPerMonth ?? "—"}
              />
              <SmallRow label="Возраст" value={application.teachingExperience.agesWorked.join(", ")} />
              <SmallRow label="О себе" value={application.teachingExperience.aboutMeText ?? "—"} />
              <SmallRow label="Результаты (было → стало)" value={application.teachingExperience.examplesResultsText ?? "—"} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Шаг 4. Предметность">
              <SmallRow label="Уверенность 0–10" value={application.subject.subjectConfidence0to10 ?? "—"} />
              <SmallRow label="Сложнее всего" value={application.subject.difficultTopicsText ?? "—"} />
              <SmallRow label="Готовность мини‑тест" value={application.subject.readyMiniTest ? "Да" : "Нет"} />
            </Card>

            <Card title="Шаг 5. Стандарты Архимеда">
              <SmallRow label="Готовность 0–10" value={application.standards.arhimedesReadiness0to10 ?? "—"} />
              <SmallRow label="Опыт" value={application.standards.experienceJournalCriteriaAnalyticsIom.join(", ") || "—"} />
              <SmallRow label="Отношение к наблюдению" value={application.standards.observationAttitude} />
              <SmallRow label="Комментарий" value={application.standards.experienceText ?? "—"} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Шаг 6. STAR по дисциплине">
              <SmallRow label="S" value={application.starCases.disciplineStarCase.disciplineS || "—"} />
              <SmallRow label="T" value={application.starCases.disciplineStarCase.disciplineT || "—"} />
              <SmallRow label="A" value={application.starCases.disciplineStarCase.disciplineA || "—"} />
              <SmallRow label="R" value={application.starCases.disciplineStarCase.disciplineR || "—"} />
            </Card>
            <Card title="Шаг 6. STAR по родителям/оценке">
              <SmallRow label="S" value={application.starCases.parentsAssessmentStarCase.disciplineS || "—"} />
              <SmallRow label="T" value={application.starCases.parentsAssessmentStarCase.disciplineT || "—"} />
              <SmallRow label="A" value={application.starCases.parentsAssessmentStarCase.disciplineA || "—"} />
              <SmallRow label="R" value={application.starCases.parentsAssessmentStarCase.disciplineR || "—"} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Шаг 7. Файлы">
              {byCategory("avatar").length ? (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Фото профиля</div>
                  <div className="mt-2">
                    <FilesList files={byCategory("avatar")} />
                  </div>
                </div>
              ) : null}
              {noConvictionFiles.length ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-sm font-semibold text-rose-900">Несудимость</div>
                  <div className="mt-2">
                    <FilesList files={noConvictionFiles} />
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Резюме</div>
                  <div className="mt-2">
                    <FilesList files={byCategory("resume")} />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Дипломы</div>
                  <div className="mt-2">
                    <FilesList files={byCategory("diploma")} />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Конспект / материалы</div>
                  <div className="mt-2">
                    <FilesList files={byCategory("lesson_plan")} />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Портфолио</div>
                  <div className="mt-2">
                    <FilesList files={byCategory("portfolio")} />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Прочие файлы</div>
                  <div className="mt-2">
                    <FilesList files={byCategory("other")} />
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Шаг 8. Условия и финал">
              <SmallRow label="Когда готов выйти на работу" value={application.conditions.readyToStart} />
              <SmallRow label="Комментарии" value={application.conditions.additionalCommentsText ?? "—"} />
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

