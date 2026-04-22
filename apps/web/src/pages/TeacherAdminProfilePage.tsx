import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatClassTeachingLabel } from "../lib/classLabels";
import { ED_Z_MODAL_GLOBAL } from "../lib/zLayers";
import { canAccessSchoolUserManagement } from "../lib/viewerRoles";
import { useAuth } from "../state/auth";
import type { CandidateListItem } from "../types/candidates";
import type { TeacherQualificationCategory, User } from "../types/user";
import { TEACHER_QUALIFICATION_LABELS } from "../types/user";

type DocRow = { id: string; originalName: string; createdAt: string; storageRelPath: string };

type TeachingPart = "whole_class" | "group1" | "group2";

export function TeacherAdminProfilePage() {
  const { teacherUserId } = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const token = auth.accessToken;
  const viewer = auth.user;

  const [user, setUser] = useState<User | null>(null);
  const [teachingClassCards, setTeachingClassCards] = useState<
    Array<{ classLabel: string; disciplineCodes: string[]; disciplineNames: string[] }>
  >([]);
  const [iomDocs, setIomDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expYears, setExpYears] = useState<string>("");
  const [category, setCategory] = useState<TeacherQualificationCategory | "">("");
  const [homeroomGrade, setHomeroomGrade] = useState<string>("");
  const [homeroomGroup, setHomeroomGroup] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [teachingForPatch, setTeachingForPatch] = useState<Array<{ disciplineCode: string; grade: number; part: TeachingPart }>>([]);
  const [analyticsProfile, setAnalyticsProfile] = useState<any>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);

  const [cadreAttrs, setCadreAttrs] = useState<any>(null);

  const [attachCandidateOpen, setAttachCandidateOpen] = useState(false);
  const [manualBranchOpen, setManualBranchOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateList, setCandidateList] = useState<CandidateListItem[]>([]);
  const [candidateMetaById, setCandidateMetaById] = useState<Record<string, { subjects: string[]; levels: string[] }>>({});
  const [candidateListLoading, setCandidateListLoading] = useState(false);
  const [candidateActionBusy, setCandidateActionBusy] = useState(false);
  const [candidateActionErr, setCandidateActionErr] = useState<string | null>(null);

  const [manualBranchBusy, setManualBranchBusy] = useState(false);
  const [manualBranchErr, setManualBranchErr] = useState<string | null>(null);
  const [manualBranchOptionId, setManualBranchOptionId] = useState<string>("");

  const canEdit = canAccessSchoolUserManagement(viewer ?? undefined);
  const id = teacherUserId ?? "";

  const refreshIom = useCallback(async () => {
    if (!token || !id) return;
    try {
      const r = await api.documentsList(token, { iomTeacherUserId: id });
      setIomDocs((r.documents ?? []) as DocRow[]);
    } catch {
      setIomDocs([]);
    }
  }, [token, id]);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api.adminUsers.details(token, id);
      const u = d.user;
      if (u.primaryRole !== "teacher" && !u.secondaryRoles.includes("teacher")) {
        setError("Пользователь не является педагогом.");
        setUser(u);
        setLoading(false);
        return;
      }
      setUser(u);
      setTeachingClassCards(d.teachingClassCards ?? []);
      setTeachingForPatch(
        (d.teachingAssignments ?? []).map((a) => ({
          disciplineCode: a.disciplineCode,
          grade: a.grade,
          part: a.part,
        })),
      );
      setExpYears(u.pedagogicalExperienceYears != null ? String(u.pedagogicalExperienceYears) : "");
      setCategory((u.teacherQualificationCategory as TeacherQualificationCategory | null) ?? "");
      setHomeroomGrade(u.homeroomGrade != null ? String(u.homeroomGrade) : "");
      setHomeroomGroup(u.homeroomGroupNumber != null ? String(u.homeroomGroupNumber) : "");
      await refreshIom();

      try {
        const attrs = await api.analyticsTeacherCadreAttributes(token, id);
        setCadreAttrs(attrs);
      } catch {
        setCadreAttrs(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [token, id, refreshIom]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!attachCandidateOpen || !token) return;
    setCandidateActionErr(null);
    setCandidateSearch("");
    setCandidateListLoading(true);
    void api
      .candidates.list(token)
      .then(async (res) => {
        const submitted = (res.candidates ?? []).filter((c: any) => c.status === "submitted") as CandidateListItem[];
        setCandidateList(submitted);

        const detailRows = await Promise.all(
          submitted.map(async (candidate) => {
            try {
              const d = await api.candidates.details(token, candidate.candidateId);
              return {
                candidateId: candidate.candidateId,
                subjects: d.application?.role?.subjects ?? [],
                levels: d.application?.role?.desiredLevels ?? [],
              };
            } catch {
              return { candidateId: candidate.candidateId, subjects: [], levels: [] };
            }
          }),
        );
        const nextMeta: Record<string, { subjects: string[]; levels: string[] }> = {};
        for (const row of detailRows) nextMeta[row.candidateId] = { subjects: row.subjects, levels: row.levels };
        setCandidateMetaById(nextMeta);
      })
      .catch(() => {
        setCandidateList([]);
        setCandidateMetaById({});
      })
      .finally(() => {
        setCandidateListLoading(false);
      });
  }, [attachCandidateOpen, token]);

  const saveTeacherMeta = async () => {
    if (!token || !user || !canEdit) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const y = expYears.trim() === "" ? null : Math.max(0, Math.floor(Number(expYears)));
      if (expYears.trim() !== "" && !Number.isFinite(y as number)) {
        setSaveErr("Некорректный стаж");
        setSaving(false);
        return;
      }
      const hg = homeroomGrade.trim() === "" ? null : Number(homeroomGrade);
      const hgn = homeroomGroup.trim() === "" ? null : Number(homeroomGroup);
      if (homeroomGrade.trim() !== "" && (!Number.isInteger(hg) || (hg as number) <= 0)) {
        setSaveErr("Некорректный класс (параллель)");
        setSaving(false);
        return;
      }
      if (homeroomGroup.trim() !== "" && (!Number.isInteger(hgn) || (hgn as number) <= 0)) {
        setSaveErr("Некорректная группа");
        setSaving(false);
        return;
      }
      const body: {
        homeroomGrade: number | null;
        homeroomGroupNumber: number | null;
        pedagogicalExperienceYears: number | null;
        teacherQualificationCategory: TeacherQualificationCategory | null;
        teachingAssignments?: Array<{ disciplineCode: string; grade: number; part: TeachingPart }>;
      } = {
        homeroomGrade: hg as number | null,
        homeroomGroupNumber: hgn as number | null,
        pedagogicalExperienceYears: y as number | null,
        teacherQualificationCategory: category === "" ? null : category,
      };
      const isTeacher = user.primaryRole === "teacher" || user.secondaryRoles.includes("teacher");
      if (isTeacher) {
        if (!teachingForPatch.length) {
          setSaveErr("Нет данных нагрузки для сохранения");
          setSaving(false);
          return;
        }
        body.teachingAssignments = teachingForPatch;
      }
      await api.adminUsers.update(token, user.id, body);
      await load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "SAVE_FAILED");
    } finally {
      setSaving(false);
    }
  };

  const onUploadIom = async (file: File | null) => {
    if (!file || !token || !id) return;
    setUploadBusy(true);
    try {
      await api.uploadDocument(token, {
        file,
        folder: {
          schoolId: "school-1",
          officeSection: "document_archive",
          iomTeacherUserId: id,
        },
        sectionId: null,
        folderId: null,
      });
      await refreshIom();
    } catch {
      // ignore
    } finally {
      setUploadBusy(false);
    }
  };

  const initials = (u: User) => `${u.lastName?.[0] ?? ""}${u.firstName?.[0] ?? ""}`.toUpperCase() || "?";
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const openAnalyticsProfile = async () => {
    if (!token || !id) return;
    setAnalyticsBusy(true);
    try {
      const result = await api.analyticsTeacherProfile(token, { teacherUserId: id, from, to });
      setAnalyticsProfile(result);
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const homeroomText = (u: User | null) => {
    if (!u?.homeroomGrade || !u.homeroomGroupNumber) return null;
    return formatClassTeachingLabel(u.homeroomGrade, u.homeroomGroupNumber);
  };

  const branchKnown = Boolean(cadreAttrs?.branchKnown);
  const sourceCandidateId = cadreAttrs?.sourceCandidateId ?? null;
  const categoryExplicit = Boolean(cadreAttrs?.categoryExplicit);
  const pcExplicit = Boolean(cadreAttrs?.pcExplicit);

  const needsCadreFix = Boolean(cadreAttrs) && (!branchKnown || !sourceCandidateId || !categoryExplicit || !pcExplicit);

  const manualBranchOptions: Array<{
    optionId: string;
    branchCode: string;
    branchTitle: string;
    startCategory: "highest" | "first" | "none";
    recommendedRateMin: number | null;
    recommendedRateMax: number | null;
    uiLabel: string;
  }> = [
    {
      optionId: "higher_ped_school_exp_first",
      branchCode: "higher_ped_school_exp",
      branchTitle: "Высшее пед + опыт школы от 1 года",
      startCategory: "first",
      recommendedRateMin: 39,
      recommendedRateMax: 41,
      uiLabel: "Высшее пед + опыт школы (1-3 года) => категория первая, ПК 39–41",
    },
    {
      optionId: "higher_ped_school_exp_highest",
      branchCode: "higher_ped_school_exp",
      branchTitle: "Высшее пед + опыт школы от 1 года",
      startCategory: "highest",
      recommendedRateMin: 42,
      recommendedRateMax: 48,
      uiLabel: "Высшее пед + опыт школы (3+ лет) => категория высшая, ПК 42–48",
    },
    {
      optionId: "higher_ped_tutoring_exp_lt2",
      branchCode: "higher_ped_tutoring_exp",
      branchTitle: "Высшее пед + репетиторский опыт",
      startCategory: "none",
      recommendedRateMin: 33,
      recommendedRateMax: 35,
      uiLabel: "Высшее пед + репетиторство (1-2) => категория без, ПК 33–35",
    },
    {
      optionId: "higher_ped_tutoring_exp_2plus",
      branchCode: "higher_ped_tutoring_exp",
      branchTitle: "Высшее пед + репетиторский опыт",
      startCategory: "none",
      recommendedRateMin: 36,
      recommendedRateMax: 38,
      uiLabel: "Высшее пед + репетиторство (2+) => категория без, ПК 36–38",
    },
    {
      optionId: "higher_ped_no_exp",
      branchCode: "higher_ped_no_exp",
      branchTitle: "Высшее пед без значимого опыта",
      startCategory: "none",
      recommendedRateMin: 30,
      recommendedRateMax: 32,
      uiLabel: "Высшее пед без опыта => категория без, ПК 30–32",
    },
    {
      optionId: "nonped_no_reprep",
      branchCode: "nonped_no_reprep",
      branchTitle: "Непедагогическое образование без переподготовки",
      startCategory: "none",
      recommendedRateMin: null,
      recommendedRateMax: null,
      uiLabel: "Непед без переподготовки => ПК не назначается",
    },
    {
      optionId: "nonped_reprep_school_exp_none",
      branchCode: "nonped_reprep_school_exp",
      branchTitle: "Непед + переподготовка + опыт школы",
      startCategory: "none",
      recommendedRateMin: 36,
      recommendedRateMax: 38,
      uiLabel: "Непед + переподготовка + опыт школы (1-3) => категория без, ПК 36–38",
    },
    {
      optionId: "nonped_reprep_school_exp_first",
      branchCode: "nonped_reprep_school_exp",
      branchTitle: "Непед + переподготовка + опыт школы",
      startCategory: "first",
      recommendedRateMin: 39,
      recommendedRateMax: 41,
      uiLabel: "Непед + переподготовка + опыт школы (3+) => категория первая, ПК 39–41",
    },
    {
      optionId: "spo_ped_with_exp",
      branchCode: "spo_ped_with_exp",
      branchTitle: "СПО пед + практический опыт",
      startCategory: "none",
      recommendedRateMin: 33,
      recommendedRateMax: 35,
      uiLabel: "СПО пед + опыт => категория без, ПК 33–35",
    },
    {
      optionId: "spo_ped_no_exp",
      branchCode: "spo_ped_no_exp",
      branchTitle: "СПО пед без опыта",
      startCategory: "none",
      recommendedRateMin: 30,
      recommendedRateMax: 32,
      uiLabel: "СПО пед без опыта => категория без, ПК 30–32",
    },
    {
      optionId: "nonped_reprep_tutoring_exp",
      branchCode: "nonped_reprep_tutoring_exp",
      branchTitle: "Непед + переподготовка + репетиторство",
      startCategory: "none",
      recommendedRateMin: 33,
      recommendedRateMax: 35,
      uiLabel: "Непед + переподготовка + репетиторство => категория без, ПК 33–35",
    },
    {
      optionId: "nonped_reprep_no_exp",
      branchCode: "nonped_reprep_no_exp",
      branchTitle: "Непед + переподготовка без опыта",
      startCategory: "none",
      recommendedRateMin: 30,
      recommendedRateMax: 32,
      uiLabel: "Непед + переподготовка без опыта => категория без, ПК 30–32",
    },
  ];

  const branchDisplay = () => {
    if (!branchKnown) return "неизвестно";
    return cadreAttrs?.branchTitle ?? "неизвестно";
  };

  const categoryDisplay = () => {
    if (!cadreAttrs) return "—";
    if (!cadreAttrs.category) return "не указано";
    const v = cadreAttrs.category as TeacherQualificationCategory;
    return TEACHER_QUALIFICATION_LABELS[v] ?? "—";
  };

  const pcDisplay = () => {
    if (!cadreAttrs) return "—";
    if (cadreAttrs.pcRate == null) return "не назначено";
    return `${cadreAttrs.pcRate} руб/АЧ`;
  };

  const attachCandidate = async (candidateId: string) => {
    if (!token || !id) return;
    setCandidateActionErr(null);
    setCandidateActionBusy(true);
    try {
      await api.analyticsTeacherAttachCandidate(token, id, { candidateId });
      await load();
      window.dispatchEvent(new CustomEvent("edumed:analytics-refresh"));
      setAttachCandidateOpen(false);
    } catch (e) {
      setCandidateActionErr(e instanceof Error ? e.message : "ATTACH_FAILED");
    } finally {
      setCandidateActionBusy(false);
    }
  };

  const applyManualBranch = async () => {
    if (!token || !id) return;
    const selected = manualBranchOptions.find((o) => o.optionId === manualBranchOptionId) ?? null;
    if (!selected) return;

    setManualBranchErr(null);
    setManualBranchBusy(true);
    try {
      await api.analyticsTeacherSetManualBranch(token, id, {
        branchCode: selected.branchCode,
        branchTitle: selected.branchTitle,
        startCategory: selected.startCategory,
        recommendedRateMin: selected.recommendedRateMin,
        recommendedRateMax: selected.recommendedRateMax,
      });
      await load();
      window.dispatchEvent(new CustomEvent("edumed:analytics-refresh"));
      setManualBranchOpen(false);
    } catch (e) {
      setManualBranchErr(e instanceof Error ? e.message : "SET_BRANCH_FAILED");
    } finally {
      setManualBranchBusy(false);
    }
  };

  if (!viewer || !canAccessSchoolUserManagement(viewer)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Нет доступа к разделу.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">Загрузка…</div>;
  }

  if (error || !user) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {error ?? "Не найдено"}
        <div className="mt-3">
          <Link to="/section/users_admin" className="text-sm font-medium text-slate-900 underline">
            ← К управлению пользователями
          </Link>
        </div>
      </div>
    );
  }

  const hr = homeroomText(user);

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:w-[280px]">
        <button
          type="button"
          onClick={() => nav("/section/users_admin")}
          className="mb-4 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          ← Управление пользователями
        </button>
        <div className="flex flex-col items-center text-center">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-28 w-28 rounded-full border border-slate-200 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-semibold text-slate-600">
              {initials(user)}
            </div>
          )}
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            {user.lastName} {user.firstName} {user.patronymic}
          </h2>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">Классное руководство</p>
          {hr ? (
            <p className="mt-1 text-sm text-slate-800">Классный руководитель: {hr}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Не назначен классным руководителем</p>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Аналитический профиль</h3>
              <p className="mt-1 text-xs text-slate-500">Качество и участие в проектах за последние 30 дней.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void openAnalyticsProfile()} disabled={analyticsBusy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-40">
                {analyticsBusy ? "Загрузка..." : "Открыть аналитический профиль"}
              </button>
            </div>
          </div>
          {analyticsProfile ? (
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Индекс качества</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{analyticsProfile.qualityIndex ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Показать участие в мероприятиях</div>
                <div className="mt-2 space-y-1 text-sm text-slate-800">
                  {(analyticsProfile.projects?.items ?? []).length === 0 ? "Нет данных." : (analyticsProfile.projects?.items ?? []).map((item: any) => (
                    <div key={`${item.eventId}:${item.stationTitle}`}>{item.date} • {item.title} • {item.stationTitle} • {item.actualAcademicHours.toFixed(2)} ч</div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Кадровые атрибуты</h3>
          <p className="mt-1 text-xs text-slate-500">Проверьте ветку, категорию и ставку для корректной управленческой аналитики.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">Категория</div>
              <div className="mt-1 text-sm text-slate-900">
                {categoryDisplay()}{" "}
                {categoryExplicit ? <span className="text-emerald-700">(задана явно)</span> : <span className="text-amber-700">(по умолчанию/не заполнена)</span>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-medium text-slate-500">Текущий ПК</div>
              <div className="mt-1 text-sm text-slate-900">
                {pcDisplay()}{" "}
                {pcExplicit ? <span className="text-emerald-700">(задано)</span> : <span className="text-amber-700">(не назначено)</span>}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
              <div className="text-xs font-medium text-slate-500">Ветка</div>
              <div className="mt-1 text-sm text-slate-900">
                {branchDisplay()}{" "}
                {branchKnown ? <span className="text-emerald-700">(из кандидата/вручную)</span> : <span className="text-amber-700">(неизвестно)</span>}
              </div>
            </div>
          </div>

          {canEdit && needsCadreFix ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={candidateActionBusy || manualBranchBusy}
                onClick={() => setAttachCandidateOpen(true)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-40"
              >
                Привязать к кандидату
              </button>
              <button
                type="button"
                disabled={candidateActionBusy || manualBranchBusy}
                onClick={() => setManualBranchOpen(true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Указать ветку вручную
              </button>
            </div>
          ) : null}

          {candidateActionErr ? <div className="mt-3 text-sm text-rose-600">{candidateActionErr}</div> : null}
          {manualBranchErr ? <div className="mt-3 text-sm text-rose-600">{manualBranchErr}</div> : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Стаж и категория</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-slate-500">Педагогический стаж</div>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={expYears}
                  onChange={(e) => setExpYears(e.target.value)}
                  placeholder="лет"
                />
              ) : (
                <div className="mt-1 text-sm text-slate-800">
                  {user.pedagogicalExperienceYears != null ? `${user.pedagogicalExperienceYears} лет` : "—"}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Категория</div>
              {canEdit ? (
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TeacherQualificationCategory | "")}
                >
                  <option value="">Не указано</option>
                  {(Object.keys(TEACHER_QUALIFICATION_LABELS) as TeacherQualificationCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {TEACHER_QUALIFICATION_LABELS[k]}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 text-sm text-slate-800">
                  {user.teacherQualificationCategory
                    ? TEACHER_QUALIFICATION_LABELS[user.teacherQualificationCategory]
                    : "—"}
                </div>
              )}
            </div>
            {canEdit ? (
              <>
                <div>
                  <div className="text-xs font-medium text-slate-500">Класс (параллель) для классного руководства</div>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={homeroomGrade}
                    onChange={(e) => setHomeroomGrade(e.target.value)}
                    placeholder="например, 5"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Группа (1 → А, 2 → Б)</div>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={homeroomGroup}
                    onChange={(e) => setHomeroomGroup(e.target.value)}
                    placeholder="например, 1"
                  />
                </div>
              </>
            ) : null}
          </div>
          {canEdit ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveTeacherMeta()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? "Сохранение…" : "Сохранить данные педагога"}
              </button>
              {saveErr ? <span className="text-sm text-rose-600">{saveErr}</span> : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Классы и группы</h3>
          <p className="mt-1 text-xs text-slate-500">Где ведёт предметы (карточки можно расширить позже).</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {teachingClassCards.length === 0 ? (
              <div className="text-sm text-slate-600">Нет назначенных классов в нагрузке.</div>
            ) : (
              teachingClassCards.map((c) => (
                <button
                  key={c.classLabel}
                  type="button"
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="text-sm font-semibold text-slate-900">{c.classLabel}</div>
                  <div className="mt-1 text-xs text-slate-600">{c.disciplineNames.join(", ")}</div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">ИОМ (индивидуальный образовательный маршрут)</h3>
          <p className="mt-1 text-xs text-slate-500">Документы ИОМ для этого педагога.</p>
          {canEdit ? (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium">Загрузить файл</span>
              <input
                type="file"
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onUploadIom(f);
                }}
              />
              {uploadBusy ? <span className="text-xs text-slate-500">Загрузка…</span> : null}
            </label>
          ) : null}
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {iomDocs.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-600">Пока нет документов.</li>
            ) : (
              iomDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <a
                    href={`/files/${d.storageRelPath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium text-slate-800 underline-offset-2 hover:underline"
                  >
                    {d.originalName}
                  </a>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString("ru-RU")}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        {attachCandidateOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            style={{ zIndex: ED_Z_MODAL_GLOBAL }}
            role="dialog"
            aria-modal
          >
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Привязать к кандидату</div>
                  <div className="mt-1 text-xs text-slate-600">Выберите кандидата, чтобы пересчитать ветку, категорию и ПК.</div>
                </div>
                <button type="button" onClick={() => setAttachCandidateOpen(false)} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
                  ✕
                </button>
              </div>

              <div className="mt-4">
                <input
                  type="text"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  placeholder="Поиск по ФИО…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              {candidateListLoading ? <div className="mt-4 text-sm text-slate-500">Загрузка кандидатов…</div> : null}

              <div className="mt-4 overflow-auto">
                <table className="w-full min-w-[760px] border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="border-b border-slate-200 px-2 py-2 font-medium">ФИО</th>
                      <th className="border-b border-slate-200 px-2 py-2 font-medium">Предметы</th>
                      <th className="border-b border-slate-200 px-2 py-2 font-medium">Ступени</th>
                      <th className="border-b border-slate-200 px-2 py-2 font-medium">Опыт в школе</th>
                      <th className="border-b border-slate-200 px-2 py-2 font-medium">Репетиторство</th>
                      <th className="border-b border-slate-200 px-2 py-2 font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(candidateList ?? [])
                      .filter((c) => {
                        const q = candidateSearch.trim().toLowerCase();
                        if (!q) return true;
                        const meta = candidateMetaById[c.candidateId];
                        const subjectText = (meta?.subjects ?? []).join(" ").toLowerCase();
                        return (
                          (c.fio ?? "").toLowerCase().includes(q) ||
                          c.candidateId.toLowerCase().includes(q) ||
                          subjectText.includes(q)
                        );
                      })
                      .map((c) => (
                        <tr key={c.candidateId} className="text-sm">
                          <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{c.fio ?? c.candidateId}</td>
                          <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{(candidateMetaById[c.candidateId]?.subjects ?? []).join(", ") || "—"}</td>
                          <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{(candidateMetaById[c.candidateId]?.levels ?? []).join(", ") || "—"}</td>
                          <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{c.teachingSchoolExperience ?? "—"}</td>
                          <td className="border-b border-slate-100 px-2 py-2 text-slate-900">{c.tutoringExperience ?? "—"}</td>
                          <td className="border-b border-slate-100 px-2 py-2">
                            <button
                              type="button"
                              disabled={candidateActionBusy}
                              onClick={() => void attachCandidate(c.candidateId)}
                              className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                            >
                              Привязать
                            </button>
                          </td>
                        </tr>
                      ))}
                    {candidateList.length === 0 ? (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-600" colSpan={6}>
                          Кандидаты не найдены.
                        </td>
                      </tr>
                    ) : null}
                    {!candidateListLoading &&
                    candidateList.length > 0 &&
                    (candidateList ?? []).filter((c) => {
                      const q = candidateSearch.trim().toLowerCase();
                      if (!q) return true;
                      const meta = candidateMetaById[c.candidateId];
                      const subjectText = (meta?.subjects ?? []).join(" ").toLowerCase();
                      return (
                        (c.fio ?? "").toLowerCase().includes(q) ||
                        c.candidateId.toLowerCase().includes(q) ||
                        subjectText.includes(q)
                      );
                    }).length === 0 ? (
                      <tr>
                        <td className="px-2 py-3 text-sm text-slate-600" colSpan={6}>
                          Кандидаты не найдены по этому запросу.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {manualBranchOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            style={{ zIndex: ED_Z_MODAL_GLOBAL }}
            role="dialog"
            aria-modal
          >
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Указать ветку вручную</div>
                  <div className="mt-1 text-xs text-slate-600">Выбор ветки пересчитает категорию и текущий ПК для учителя.</div>
                </div>
                <button type="button" onClick={() => setManualBranchOpen(false)} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
                  ✕
                </button>
              </div>

              <div className="mt-4">
                <div className="text-xs font-medium text-slate-500">Вариант</div>
                <div className="mt-2 space-y-2">
                  {manualBranchOptions.map((o) => {
                    const selected = manualBranchOptionId === o.optionId;
                    return (
                      <button
                        key={o.optionId}
                        type="button"
                        onClick={() => setManualBranchOptionId(o.optionId)}
                        className={[
                          "w-full rounded-xl border p-3 text-left",
                          selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300",
                        ].join(" ")}
                      >
                        <div className="text-sm font-medium text-slate-900">{o.branchTitle}</div>
                        <div className="mt-1 text-xs text-slate-600">{o.uiLabel.split("=>")[0]?.trim() ?? o.uiLabel}</div>
                        <div className="mt-1 text-xs text-slate-700">
                          {o.recommendedRateMin == null
                            ? "Ставка учителя по этой ветке не назначается."
                            : `Рекомендуемый диапазон ПК: ${o.recommendedRateMin}–${o.recommendedRateMax}.`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={manualBranchBusy || !manualBranchOptionId}
                  onClick={() => void applyManualBranch()}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {manualBranchBusy ? "Сохранение…" : "Сохранить"}
                </button>
                <button type="button" onClick={() => setManualBranchOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
