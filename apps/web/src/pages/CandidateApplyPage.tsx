import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { CandidateApplication } from "../types/candidates";

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const TOTAL_STEPS = 8;

function isValidEmail(s: string) {
  const t = s.trim();
  if (!t) return false;
  return t.includes("@") && t.includes(".");
}

function clamp0to10(n: number) {
  return Math.max(0, Math.min(10, n));
}

const SUBJECT_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "mathematics", label: "Математика" },
  { code: "informatics", label: "Информатика" },
  { code: "russian_language", label: "Русский язык" },
  { code: "history", label: "История" },
  { code: "physics", label: "Физика" },
  { code: "chemistry", label: "Химия" },
  { code: "biology", label: "Биология" },
  { code: "english", label: "Английский" },
  { code: "other", label: "Другое" },
];

const LEVEL_OPTIONS: Array<{ value: "1-4" | "5-9" | "10-11" | "other"; label: string }> = [
  { value: "1-4", label: "1–4" },
  { value: "5-9", label: "5–9" },
  { value: "10-11", label: "10–11" },
  { value: "other", label: "Другое" },
];

const EXPERIENCE_CHECKBOXES = [
  { id: "journal", label: "Журнал" },
  { id: "criteria", label: "Критерии / оценочные рубрики" },
  { id: "analytics", label: "Аналитика" },
  { id: "iom", label: "ИОМ" },
] as const;

export function CandidateApplyPage() {
  const { candidateId } = useParams();
  const id = candidateId ?? "";

  const [step, setStep] = useState<WizardStep>(0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [application, setApplication] = useState<CandidateApplication>(() => ({
    contacts: {
      fullName: "",
      email: "",
      phone: "",
      city: "",
      timezone: "Europe/Moscow",
      consentProcessing: false,
    },
    role: {
      desiredLevels: [],
      subjects: [],
      subjectsOtherText: "",
      employmentFormat: "staff",
    },
    education: {
      educationLevel: "higher_nonped",
      teacherReprepStatus: "no",
      institutionName: "",
      specialtyText: "",
      graduationYear: null,
      additionalTrainingText: "",
    },
    teachingExperience: {
      teachingSchoolExperience: "none",
      tutoringExperience: "none",
      stableTutoringStudentsPerMonth: null,
      aboutMeText: "",
      examplesResultsText: "",
      agesWorked: [],
    },
    subject: {
      subjectConfidence0to10: null,
      difficultTopicsText: "",
      readyMiniTest: false,
    },
    standards: {
      arhimedesReadiness0to10: null,
      experienceJournalCriteriaAnalyticsIom: [],
      observationAttitude: "positive",
      experienceText: "",
    },
    starCases: {
      disciplineStarCase: { disciplineS: "", disciplineT: "", disciplineA: "", disciplineR: "" },
      parentsAssessmentStarCase: { disciplineS: "", disciplineT: "", disciplineA: "", disciplineR: "" },
    },
    conditions: {
      readyToStart: "soon",
      additionalCommentsText: "",
    },
  }));

  const [files, setFiles] = useState<{
    avatarFiles: File[];
    resumeFiles: File[];
    diplomaFiles: File[];
    lessonPlanFiles: File[];
    portfolioFiles: File[];
    noConvictionFiles: File[];
    otherFiles: File[];
  }>({
    avatarFiles: [],
    resumeFiles: [],
    diplomaFiles: [],
    lessonPlanFiles: [],
    portfolioFiles: [],
    noConvictionFiles: [],
    otherFiles: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const stepLabel = useMemo(() => `Шаг ${step} из ${TOTAL_STEPS}`, [step]);

  function setField(path: string, value: unknown) {
    setApplication((prev) => {
      const next: any = structuredClone(prev);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next as CandidateApplication;
    });
  }

  function validateCurrentStep(s: WizardStep): boolean {
    const e: Record<string, string> = {};

    const c = application.contacts;
    const r = application.role;
    const edu = application.education;
    const ex = application.teachingExperience;
    const subj = application.subject;
    const std = application.standards;

    if (s === 0) {
      if (!c.fullName.trim()) e["contacts.fullName"] = "Укажите ФИО.";
      if (!c.email.trim() || !isValidEmail(c.email)) e["contacts.email"] = "Введите корректный email.";
      if (!c.phone.trim()) e["contacts.phone"] = "Введите телефон.";
      if (!c.consentProcessing) e["contacts.consentProcessing"] = "Нужно согласие на обработку данных.";
    }

    if (s === 1) {
      if (!r.desiredLevels.length) e["role.desiredLevels"] = "Выберите уровень(и).";
      if (!r.subjects.length) e["role.subjects"] = "Выберите предмет(ы).";
      if (r.subjects.includes("other") && !r.subjectsOtherText?.trim()) e["role.subjectsOtherText"] = "Укажите «Другое».";
    }

    if (s === 2) {
      if (!edu.institutionName.trim()) e["education.institutionName"] = "Укажите учебное заведение.";
      if (!edu.specialtyText.trim()) e["education.specialtyText"] = "Укажите специальность.";
    }

    if (s === 3) {
      if (!ex.agesWorked.length) e["teachingExperience.agesWorked"] = "Выберите возраст(ы), с которыми работали.";
      if (ex.tutoringExperience !== "none") {
        if (ex.stableTutoringStudentsPerMonth == null || !Number.isFinite(ex.stableTutoringStudentsPerMonth)) {
          e["teachingExperience.stableTutoringStudentsPerMonth"] = "Укажите число учеников в месяц.";
        }
      }
    }

    if (s === 4) {
      if (subj.subjectConfidence0to10 == null) e["subject.subjectConfidence0to10"] = "Оцените уверенность по шкале 0–10.";
      if (!Number.isFinite(subj.subjectConfidence0to10 ?? NaN)) e["subject.subjectConfidence0to10"] = "Введите число 0–10.";
    }

    if (s === 5) {
      if (std.arhimedesReadiness0to10 == null) e["standards.arhimedesReadiness0to10"] = "Оцените готовность по шкале 0–10.";
      if (!std.experienceJournalCriteriaAnalyticsIom?.length)
        e["standards.experienceJournalCriteriaAnalyticsIom"] = "Отметьте опыт работы по стандартам.";
    }

    if (s === 6) {
      const ds = application.starCases.disciplineStarCase;
      const ps = application.starCases.parentsAssessmentStarCase;
      if (!ds.disciplineS.trim() || !ds.disciplineT.trim() || !ds.disciplineA.trim() || !ds.disciplineR.trim())
        e["starCases.disciplineStarCase"] = "Заполните STAR по дисциплине (S/T/A/R).";
      if (!ps.disciplineS.trim() || !ps.disciplineT.trim() || !ps.disciplineA.trim() || !ps.disciplineR.trim())
        e["starCases.parentsAssessmentStarCase"] = "Заполните STAR по родителям/оценке (S/T/A/R).";
    }

    if (s === 7) {
      const hasResume = files.resumeFiles.length > 0;
      const hasDiploma = files.diplomaFiles.length > 0;
      if (!hasResume && !hasDiploma) e["files"] = "Загрузите хотя бы резюме или диплом.";
    }

    if (s === 8) {
      if (!application.conditions.readyToStart) e["conditions.readyToStart"] = "Выберите, когда готовы выйти на работу.";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    setSubmitError(null);
    const ok = validateCurrentStep(step);
    if (!ok) return;
    if (step < 8) setStep((step + 1) as WizardStep);
  }

  function back() {
    setSubmitError(null);
    if (step > 0) setStep((step - 1) as WizardStep);
    setErrors({});
  }

  async function onSubmit() {
    if (!id) return;
    setBusy(true);
    setSubmitError(null);
    const allSteps: WizardStep[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (const s of allSteps) {
      const ok = validateCurrentStep(s);
      if (!ok) {
        setStep(s);
        setBusy(false);
        return;
      }
    }

    try {
      const form = new FormData();
      form.append("application", JSON.stringify(application));

      for (const f of files.avatarFiles) form.append("avatarFiles", f);
      for (const f of files.resumeFiles) form.append("resumeFiles", f);
      for (const f of files.diplomaFiles) form.append("diplomaFiles", f);
      for (const f of files.lessonPlanFiles) form.append("lessonPlanFiles", f);
      for (const f of files.portfolioFiles) form.append("portfolioFiles", f);
      for (const f of files.noConvictionFiles) form.append("noConvictionFiles", f);
      for (const f of files.otherFiles) form.append("otherFiles", f);

      const res = await fetch(`/api/candidates/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        throw new Error(data?.error ? String(data.error) : `HTTP_${res.status}`);
      }
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "SUBMIT_FAILED");
    } finally {
      setBusy(false);
    }
  }

  const Progress = () => (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
        <div className="font-medium text-slate-900">{stepLabel}</div>
        <div className="text-xs text-slate-500">Кандидат #{id.slice(0, 8)}…</div>
      </div>
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        {Array.from({ length: TOTAL_STEPS + 1 }).map((_, i) => {
          const active = i === step;
          const doneStep = i < step;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className={[
                  "h-2.5 w-2.5 rounded-full border",
                  active ? "border-slate-900 bg-slate-900" : doneStep ? "border-emerald-400 bg-emerald-400" : "border-slate-200 bg-white",
                ].join(" ")}
              />
              {i < TOTAL_STEPS ? <div className="h-px w-12 bg-slate-100" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (done) {
    return (
      <div className="min-h-screen bg-[var(--ed-bg,#f6f8fb)] py-10">
        <div className="mx-auto max-w-2xl px-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">Спасибо, анкета отправлена</h1>
            <p className="mt-3 text-sm text-slate-600">
              С вами свяжутся по указанным контактам. Обычно обратная связь приходит в ближайшие дни после рассмотрения.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  try {
                    window.close();
                  } finally {
                    // If browser doesn't allow close, keep user on the success screen.
                  }
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ed-bg,#f6f8fb)] py-10">
      <Progress />
      <div className="mx-auto mt-8 max-w-4xl px-4">
        <div className="rounded-[28px] border border-slate-200 bg-white/70 p-0 shadow-[var(--ed-shadow-panel,0_8px_24px_rgba(15,23,42,0.06))] backdrop-blur">
          <div className="p-6">
            {step === 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Контакты и согласие</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">ФИО *</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.contacts.fullName}
                      onChange={(e) => setField("contacts.fullName", e.target.value)}
                    />
                    {errors["contacts.fullName"] ? <div className="mt-1 text-xs text-rose-700">{errors["contacts.fullName"]}</div> : null}
                  </label>
                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Email *</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.contacts.email}
                      onChange={(e) => setField("contacts.email", e.target.value)}
                    />
                    {errors["contacts.email"] ? <div className="mt-1 text-xs text-rose-700">{errors["contacts.email"]}</div> : null}
                  </label>
                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Телефон (WhatsApp/Telegram) *</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.contacts.phone}
                      onChange={(e) => setField("contacts.phone", e.target.value)}
                    />
                    {errors["contacts.phone"] ? <div className="mt-1 text-xs text-rose-700">{errors["contacts.phone"]}</div> : null}
                  </label>
                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Город</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.contacts.city ?? ""}
                      onChange={(e) => setField("contacts.city", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Часовой пояс</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.contacts.timezone ?? ""}
                      onChange={(e) => setField("contacts.timezone", e.target.value)}
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={application.contacts.consentProcessing}
                      onChange={(e) => setField("contacts.consentProcessing", e.target.checked)}
                    />
                    <span>
                      Я согласен(а) на обработку персональных данных для рассмотрения моей кандидатуры.
                      <span className="block text-xs text-slate-500">Поля помеченные * обязательны.</span>
                    </span>
                  </label>
                  {errors["contacts.consentProcessing"] ? (
                    <div className="mt-2 text-xs text-rose-700">{errors["contacts.consentProcessing"]}</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {step === 1 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Роль</h2>

                <div className="mt-5">
                  <div className="text-sm font-medium text-slate-800">На какой уровень вы претендуете? *</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {LEVEL_OPTIONS.map((o) => {
                      const safeLevels = application.role.desiredLevels ?? [];
                      const checked = safeLevels.includes(o.value);
                      return (
                        <label key={o.value} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setApplication((prev) => {
                                const next: any = structuredClone(prev);
                                next.role.desiredLevels = (next.role.desiredLevels ?? []).includes(o.value)
                                  ? next.role.desiredLevels.filter((x: string) => x !== o.value)
                                  : [...(next.role.desiredLevels ?? []), o.value];
                                return next as CandidateApplication;
                              });
                            }}
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                  {errors["role.desiredLevels"] ? <div className="mt-2 text-xs text-rose-700">{errors["role.desiredLevels"]}</div> : null}
                </div>

                <div className="mt-6">
                  <div className="text-sm font-medium text-slate-800">Предмет(ы) *</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {SUBJECT_OPTIONS.map((o) => {
                      const safeSubjects = application.role.subjects ?? [];
                      const checked = safeSubjects.includes(o.code);
                      return (
                        <label key={o.code} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setApplication((prev) => {
                                const next: any = structuredClone(prev);
                                const arr: string[] = next.role.subjects ?? [];
                                next.role.subjects = arr.includes(o.code) ? arr.filter((x) => x !== o.code) : [...arr, o.code];
                                return next as CandidateApplication;
                              })
                            }
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                  {errors["role.subjects"] ? <div className="mt-2 text-xs text-rose-700">{errors["role.subjects"]}</div> : null}
                  {(application.role.subjects ?? []).includes("other") ? (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-slate-600">Другое (уточните)</div>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        value={application.role.subjectsOtherText ?? ""}
                        onChange={(e) => setField("role.subjectsOtherText", e.target.value)}
                      />
                      {errors["role.subjectsOtherText"] ? <div className="mt-1 text-xs text-rose-700">{errors["role.subjectsOtherText"]}</div> : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6">
                  <div className="text-sm font-medium text-slate-800">Формат занятости</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {[
                      { value: "staff", label: "Штат" },
                      { value: "part_time", label: "Частичная" },
                      { value: "internship", label: "Стажировка" },
                    ].map((o) => (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <span className="text-slate-800">{o.label}</span>
                        <input
                          type="radio"
                          name="employmentFormat"
                          checked={application.role.employmentFormat === o.value}
                          onChange={() => setField("role.employmentFormat", o.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Образование и квалификация</h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Уровень образования</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {[
                        { value: "higher_ped", label: "Высшее пед" },
                        { value: "higher_nonped", label: "Высшее непед" },
                        { value: "sppo_ped", label: "СПО пед" },
                        { value: "sppo_nonped", label: "СПО непед" },
                      ].map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="radio"
                            name="educationLevel"
                            checked={application.education.educationLevel === o.value}
                            onChange={() => setField("education.educationLevel", o.value)}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Педпереподготовка на учителя</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {[
                        { value: "yes", label: "Да" },
                        { value: "no", label: "Нет" },
                        { value: "in_process", label: "В процессе" },
                      ].map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="radio"
                            name="teacherReprep"
                            checked={application.education.teacherReprepStatus === o.value}
                            onChange={() => setField("education.teacherReprepStatus", o.value)}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Год окончания</div>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.education.graduationYear ?? ""}
                      onChange={(e) => setField("education.graduationYear", e.target.value === "" ? null : Math.floor(Number(e.target.value)))}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Учебное заведение *</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.education.institutionName}
                      onChange={(e) => setField("education.institutionName", e.target.value)}
                    />
                    {errors["education.institutionName"] ? <div className="mt-1 text-xs text-rose-700">{errors["education.institutionName"]}</div> : null}
                  </label>

                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Специальность *</div>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={application.education.specialtyText}
                      onChange={(e) => setField("education.specialtyText", e.target.value)}
                    />
                    {errors["education.specialtyText"] ? <div className="mt-1 text-xs text-rose-700">{errors["education.specialtyText"]}</div> : null}
                  </label>
                </div>

                {application.education.teacherReprepStatus !== "no" ? (
                  <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Данные о педпереподготовке</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block md:col-span-2">
                        <div className="text-xs font-medium text-slate-600">Программа</div>
                        <textarea
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          rows={3}
                          value={application.education.reprepProgramText ?? ""}
                          onChange={(e) => setField("education.reprepProgramText", e.target.value)}
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <div className="text-xs font-medium text-slate-600">Организация</div>
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={application.education.reprepOrganizationText ?? ""}
                          onChange={(e) => setField("education.reprepOrganizationText", e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-slate-600">Часы</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={application.education.reprepHours ?? ""}
                          onChange={(e) => setField("education.reprepHours", e.target.value === "" ? null : Math.floor(Number(e.target.value)))}
                        />
                      </label>
                      <label className="block">
                        <div className="text-xs font-medium text-slate-600">Год</div>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={application.education.reprepYear ?? ""}
                          onChange={(e) => setField("education.reprepYear", e.target.value === "" ? null : Math.floor(Number(e.target.value)))}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5">
                  <div className="text-sm font-semibold text-slate-900">Дополнительное обучение за последние 2 года</div>
                  <textarea
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm"
                    rows={4}
                    value={application.education.additionalTrainingText ?? ""}
                    onChange={(e) => setField("education.additionalTrainingText", e.target.value)}
                    placeholder="Курсы / ПК / сертификаты (текстом)"
                  />
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Опыт преподавания</h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <div className="text-sm font-medium text-slate-800">Опыт преподавания в школе/центре</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {[
                        { value: "none", label: "нет" },
                        { value: "lt1", label: "до 1" },
                        { value: "1-3", label: "1–3" },
                        { value: "3plus", label: "3+ года" },
                      ].map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <span>{o.label}</span>
                          <input type="radio" name="teachingSchoolExperience" checked={application.teachingExperience.teachingSchoolExperience === o.value} onChange={() => setField("teachingExperience.teachingSchoolExperience", o.value)} />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-sm font-medium text-slate-800">Опыт репетиторства</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {[
                        { value: "none", label: "нет" },
                        { value: "lt1", label: "<1" },
                        { value: "1-2", label: "1–2" },
                        { value: "2plus", label: "2+ года" },
                      ].map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <span>{o.label}</span>
                          <input type="radio" name="tutoringExperience" checked={application.teachingExperience.tutoringExperience === o.value} onChange={() => setField("teachingExperience.tutoringExperience", o.value)} />
                        </label>
                      ))}
                    </div>
                  </div>

                  {application.teachingExperience.tutoringExperience !== "none" ? (
                    <label className="block md:col-span-2">
                      <div className="text-xs font-medium text-slate-600">Сколько учеников стабильно в месяц *</div>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={application.teachingExperience.stableTutoringStudentsPerMonth ?? ""}
                        onChange={(e) =>
                          setField(
                            "teachingExperience.stableTutoringStudentsPerMonth",
                            e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))),
                          )
                        }
                      />
                      {errors["teachingExperience.stableTutoringStudentsPerMonth"] ? (
                        <div className="mt-1 text-xs text-rose-700">{errors["teachingExperience.stableTutoringStudentsPerMonth"]}</div>
                      ) : null}
                    </label>
                  ) : null}

                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Краткое «о себе» / резюме</div>
                    <textarea
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                      rows={3}
                      value={application.teachingExperience.aboutMeText ?? ""}
                      onChange={(e) => setField("teachingExperience.aboutMeText", e.target.value)}
                      placeholder="Небольшой текст (2–5 предложений)"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Примеры результатов (было → стало)</div>
                    <textarea
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                      rows={4}
                      value={application.teachingExperience.examplesResultsText ?? ""}
                      onChange={(e) => setField("teachingExperience.examplesResultsText", e.target.value)}
                      placeholder="Кейсы / истории успеха"
                    />
                  </label>

                  <div className="md:col-span-2">
                    <div className="text-sm font-medium text-slate-800">С какими возрастами работали? *</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {[
                        { v: "1-4", label: "1–4" },
                        { v: "5-9", label: "5–9" },
                        { v: "10-11", label: "10–11" },
                        { v: "adults", label: "Взрослые" },
                      ].map((o) => {
                        const checked = (
                          application.teachingExperience.agesWorked as readonly string[]
                        ).includes(o.v);
                        return (
                          <label key={o.v} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setApplication((prev) => {
                                  const next: any = structuredClone(prev);
                                  const arr: string[] = next.teachingExperience.agesWorked;
                                  next.teachingExperience.agesWorked = arr.includes(o.v) ? arr.filter((x) => x !== o.v) : [...arr, o.v];
                                  return next as CandidateApplication;
                                })
                              }
                            />
                            {o.label}
                          </label>
                        );
                      })}
                    </div>
                    {errors["teachingExperience.agesWorked"] ? (
                      <div className="mt-1 text-xs text-rose-700">{errors["teachingExperience.agesWorked"]}</div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 4 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Предметность</h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Уверенность в предмете (0–10) *</div>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={application.subject.subjectConfidence0to10 ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : clamp0to10(Math.floor(Number(e.target.value)));
                        setField("subject.subjectConfidence0to10", v);
                      }}
                    />
                    {errors["subject.subjectConfidence0to10"] ? <div className="mt-1 text-xs text-rose-700">{errors["subject.subjectConfidence0to10"]}</div> : null}
                  </label>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-600">Сложнее всего даются</div>
                    <textarea
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                      rows={3}
                      value={application.subject.difficultTopicsText ?? ""}
                      onChange={(e) => setField("subject.difficultTopicsText", e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-sm font-medium text-slate-800">Готовность пройти предметный мини‑тест</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {[
                        { v: true, label: "Да, готов(а)" },
                        { v: false, label: "Пока нет" },
                      ].map((o) => (
                        <label key={String(o.v)} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                          <span className="text-slate-800">{o.label}</span>
                          <input type="radio" name="readyMiniTest" checked={application.subject.readyMiniTest === o.v} onChange={() => setField("subject.readyMiniTest", o.v)} />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {step === 5 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Готовность к стандартам Архимеда</h2>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Готовность работать по единому шаблону (0–10) *</div>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={application.standards.arhimedesReadiness0to10 ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : clamp0to10(Math.floor(Number(e.target.value)));
                        setField("standards.arhimedesReadiness0to10", v);
                      }}
                    />
                    {errors["standards.arhimedesReadiness0to10"] ? (
                      <div className="mt-1 text-xs text-rose-700">{errors["standards.arhimedesReadiness0to10"]}</div>
                    ) : null}
                  </label>

                  <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-600">Опыт: журнал / критерии / аналитика / ИОМ *</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {EXPERIENCE_CHECKBOXES.map((x) => {
                        const safeArr = application.standards.experienceJournalCriteriaAnalyticsIom ?? [];
                        const checked = safeArr.includes(x.id);
                        return (
                          <label key={x.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setApplication((prev) => {
                                  const next: any = structuredClone(prev);
                                  const arr: string[] = next.standards.experienceJournalCriteriaAnalyticsIom ?? [];
                                  next.standards.experienceJournalCriteriaAnalyticsIom = checked
                                    ? arr.filter((v) => v !== x.id)
                                    : [...arr, x.id];
                                  return next as CandidateApplication;
                                });
                              }}
                            />
                            {x.label}
                          </label>
                        );
                      })}
                    </div>
                    {errors["standards.experienceJournalCriteriaAnalyticsIom"] ? (
                      <div className="mt-2 text-xs text-rose-700">{errors["standards.experienceJournalCriteriaAnalyticsIom"]}</div>
                    ) : null}
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-sm font-medium text-slate-800">Отношение к наблюдению уроков, чек‑листам *</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {[
                        { v: "positive", label: "Позитивно" },
                        { v: "neutral", label: "Нейтрально" },
                        { v: "not_ready", label: "Не готов(а)" },
                      ].map((o) => (
                        <label key={o.v} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                          <span>{o.label}</span>
                          <input type="radio" name="observationAttitude" checked={application.standards.observationAttitude === o.v} onChange={() => setField("standards.observationAttitude", o.v)} />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-600">Комментарий (опционально)</div>
                    <textarea
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                      rows={3}
                      value={application.standards.experienceText ?? ""}
                      onChange={(e) => setField("standards.experienceText", e.target.value)}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {step === 6 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Мини‑STAR кейсы</h2>

                <div className="mt-4 grid gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">STAR по дисциплине *</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        { key: "disciplineS", label: "S — Ситуация" },
                        { key: "disciplineT", label: "T — Задача" },
                        { key: "disciplineA", label: "A — Действие" },
                        { key: "disciplineR", label: "R — Результат" },
                      ].map((o) => (
                        <label key={o.key} className="block md:col-span-1">
                          <div className="text-xs font-medium text-slate-600">{o.label}</div>
                          <textarea
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                            rows={2}
                            value={(application.starCases.disciplineStarCase as any)[o.key] ?? ""}
                            onChange={(e) => {
                              setApplication((prev) => {
                                const next: any = structuredClone(prev);
                                next.starCases.disciplineStarCase[o.key] = e.target.value;
                                return next as CandidateApplication;
                              });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    {errors["starCases.disciplineStarCase"] ? <div className="mt-2 text-xs text-rose-700">{errors["starCases.disciplineStarCase"]}</div> : null}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">STAR по родителям/оценке *</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        { key: "disciplineS", label: "S — Ситуация" },
                        { key: "disciplineT", label: "T — Задача" },
                        { key: "disciplineA", label: "A — Действие" },
                        { key: "disciplineR", label: "R — Результат" },
                      ].map((o) => (
                        <label key={o.key} className="block md:col-span-1">
                          <div className="text-xs font-medium text-slate-600">{o.label}</div>
                          <textarea
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                            rows={2}
                            value={(application.starCases.parentsAssessmentStarCase as any)[o.key] ?? ""}
                            onChange={(e) => {
                              setApplication((prev) => {
                                const next: any = structuredClone(prev);
                                next.starCases.parentsAssessmentStarCase[o.key] = e.target.value;
                                return next as CandidateApplication;
                              });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    {errors["starCases.parentsAssessmentStarCase"] ? (
                      <div className="mt-2 text-xs text-rose-700">{errors["starCases.parentsAssessmentStarCase"]}</div>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {step === 7 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Файлы</h2>
                <p className="mt-2 text-sm text-slate-600">Загрузите документы кандидата. Поддерживаемые типы: PDF, DOC/DOCX, JPG/PNG.</p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-1">
                    <div className="text-xs font-medium text-slate-600">Фото профиля (опционально)</div>
                    <input
                      type="file"
                      multiple={false}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"
                      accept=".jpg,.jpeg,.png"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setFiles((prev) => ({ ...prev, avatarFiles: list.slice(0, 1) }));
                      }}
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Резюме</div>
                    <input
                      type="file"
                      multiple
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setFiles((prev) => ({ ...prev, resumeFiles: list }));
                      }}
                    />
                    {files.resumeFiles.length ? <div className="mt-1 text-xs text-slate-500">{files.resumeFiles.length} файл(ов)</div> : null}
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Дипломы / подтверждения</div>
                    <input
                      type="file"
                      multiple
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setFiles((prev) => ({ ...prev, diplomaFiles: list }));
                      }}
                    />
                    {files.diplomaFiles.length ? <div className="mt-1 text-xs text-slate-500">{files.diplomaFiles.length} файл(ов)</div> : null}
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Конспект / методические материалы (опционально)</div>
                    <input
                      type="file"
                      multiple
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setFiles((prev) => ({ ...prev, lessonPlanFiles: list }));
                      }}
                    />
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-slate-600">Портфолио (опционально)</div>
                    <input
                      type="file"
                      multiple
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setFiles((prev) => ({ ...prev, portfolioFiles: list }));
                      }}
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <div className="text-xs font-medium text-slate-600">Справка о несудимости (опционально)</div>
                    <input
                      type="file"
                      multiple={false}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        setFiles((prev) => ({ ...prev, noConvictionFiles: list }));
                      }}
                    />
                  </label>
                </div>

                {errors["files"] ? <div className="mt-3 text-xs text-rose-700">{errors["files"]}</div> : null}
              </section>
            ) : null}

            {step === 8 ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Условия и финал</h2>

                <div className="mt-4">
                  <div className="text-sm font-medium text-slate-800">Когда готовы выйти на работу? *</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[
                      { v: "soon", label: "Скоро" },
                      { v: "in_month", label: "В течение месяца" },
                      { v: "in_semester", label: "В течение учебного семестра" },
                      { v: "later", label: "Позже" },
                    ].map((o) => (
                      <label key={o.v} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                        <span>{o.label}</span>
                        <input type="radio" name="readyToStart" checked={application.conditions.readyToStart === o.v} onChange={() => setField("conditions.readyToStart", o.v)} />
                      </label>
                    ))}
                  </div>
                  {errors["conditions.readyToStart"] ? <div className="mt-1 text-xs text-rose-700">{errors["conditions.readyToStart"]}</div> : null}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-xs font-medium text-slate-600">Дополнительные комментарии</div>
                  <textarea
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                    rows={4}
                    value={application.conditions.additionalCommentsText ?? ""}
                    onChange={(e) => setField("conditions.additionalCommentsText", e.target.value)}
                  />
                </div>

                {submitError ? <div className="mt-3 text-sm text-rose-700">{submitError}</div> : null}
              </section>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={back}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-40"
                disabled={step === 0 || busy}
              >
                ← Назад
              </button>
              {step < 8 ? (
                <button
                  type="button"
                  onClick={next}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  disabled={busy}
                >
                  Далее →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  disabled={busy}
                >
                  {busy ? "Отправляем…" : "Отправить анкету"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

