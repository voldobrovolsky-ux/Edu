import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatClassTeachingLabel } from "../lib/classLabels";
import { QrCodeImage } from "../components/QrCodeImage";
import {
  canClearEntireDatabase,
  canAccessSchoolUserManagement,
  isSysAdminUser,
} from "../lib/viewerRoles";
import { useAuth } from "../state/auth";
import type { PrimaryRole, SecondaryRole } from "../types/roles";
import { PRIMARY_ROLES, SECONDARY_ROLES } from "../types/roles";
import type { User } from "../types/user";
import type { CandidateListItem } from "../types/candidates";

type TeachingAssignmentPart = "whole_class" | "group1" | "group2";
type TeachingAssignmentDraft = {
  disciplineCode: string;
  grade: string;
  part: TeachingAssignmentPart;
};

type RolesDraft = {
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];
};

type UserEditDraft = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  username: string;
  primaryRole: PrimaryRole;
  secondaryRoles: SecondaryRole[];
  password: string;
};

type UsersTab = "teachers" | "children" | "candidates" | "all_users";

function isTeacherUser(u: User): boolean {
  return u.primaryRole === "teacher" || u.secondaryRoles.includes("teacher");
}

function roleOptionsForViewer(viewer: User | null | undefined): PrimaryRole[] {
  const base = PRIMARY_ROLES.filter((r) => r !== "bot");
  if (isSysAdminUser(viewer)) return base;
  return base.filter((r) => r !== "sysadmin");
}

export function UsersAdminPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const token = auth.accessToken;
  const viewer = auth.user;
  const sysAdminViewer = isSysAdminUser(viewer ?? undefined);
  const mayClearDb = canClearEntireDatabase(viewer ?? undefined);

  const [users, setUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<UsersTab>("teachers");
  const [teacherLinesById, setTeacherLinesById] = useState<Record<string, string[]>>({});
  const [teacherCardsLoading, setTeacherCardsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [createCandidateBusy, setCreateCandidateBusy] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminUsers.list(token);
      setUsers(res.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "USERS_LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCandidates = async () => {
    if (!token) return;
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const r = await api.candidates.list(token);
      setCandidates(r.candidates ?? []);
    } catch (e) {
      setCandidatesError(e instanceof Error ? e.message : "CANDIDATES_LOAD_FAILED");
    } finally {
      setCandidatesLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (tab !== "candidates") return;
    void refreshCandidates();
    const id = window.setInterval(() => void refreshCandidates(), 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  const createCandidate = async () => {
    if (!token) return;
    setCreateCandidateBusy(true);
    setCandidatesError(null);
    try {
      await api.candidates.create(token);
      await refreshCandidates();
    } catch (e) {
      setCandidatesError(e instanceof Error ? e.message : "CANDIDATE_CREATE_FAILED");
    } finally {
      setCreateCandidateBusy(false);
    }
  };

  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearPhrase, setClearPhrase] = useState("");
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<Array<{ id: string; grade: number; groups: Array<{ id: string; grade: number; groupNumber: number }> }>>([]);
  const [disciplinesByGrade, setDisciplinesByGrade] = useState<
    Record<number, Array<{ code: string; name: string; grade: number }>>
  >({});
  const [createDraft, setCreateDraft] = useState<{
    lastName: string;
    firstName: string;
    patronymic: string;
    username: string;
    password: string;
    primaryRole: PrimaryRole;
    grade: string;
    group: string;
    teachingAssignments: TeachingAssignmentDraft[];
  }>({
    lastName: "",
    firstName: "",
    patronymic: "",
    username: "",
    password: "",
    primaryRole: "teacher",
    grade: "",
    group: "",
    teachingAssignments: [{ disciplineCode: "", grade: "", part: "whole_class" }],
  });

  const createNeedsStudentMeta = createDraft.primaryRole === "student";
  const createNeedsTeacherMeta = createDraft.primaryRole === "teacher";

  useEffect(() => {
    if (!token) return;
    void api
      .schoolClasses(token)
      .then((r) => {
        const next = [...(r.classes ?? [])].sort((a, b) => a.grade - b.grade);
        setSchoolClasses(next);
      })
      .catch(() => {
        setSchoolClasses([]);
      });
  }, [token]);

  const schoolGrades = useMemo(() => schoolClasses.map((item) => item.grade).sort((a, b) => a - b), [schoolClasses]);
  const selectedStudentGrade = Number(createDraft.grade);
  const selectedStudentGroups = useMemo(() => {
    if (!Number.isInteger(selectedStudentGrade) || selectedStudentGrade <= 0) return [];
    const schoolClass = schoolClasses.find((item) => item.grade === selectedStudentGrade);
    return [...(schoolClass?.groups ?? [])].sort((a, b) => a.groupNumber - b.groupNumber);
  }, [schoolClasses, selectedStudentGrade]);

  const ensureDisciplinesLoaded = async (grade: number) => {
    if (!token) return;
    if (!Number.isFinite(grade) || grade <= 0) return;
    if (disciplinesByGrade[grade]) return;
    const r = await api.teacherLoadOptions(token, grade);
    setDisciplinesByGrade((prev) => ({ ...prev, [grade]: r.disciplines }));
  };
  const createCanSubmit = useMemo(() => {
    if (createBusy) return false;
    if (!createDraft.lastName.trim()) return false;
    if (!createDraft.firstName.trim()) return false;
    if (!createDraft.patronymic.trim()) return false;
    if (createDraft.username.trim().length < 5) return false;
    if (!createDraft.password.trim()) return false;
    if (createNeedsStudentMeta) {
      const grade = Number(createDraft.grade);
      const group = Number(createDraft.group);
      return Number.isFinite(grade) && Number.isFinite(group) && Number.isInteger(grade) && Number.isInteger(group) && grade > 0 && group > 0;
    }
    if (createNeedsTeacherMeta) {
      if (!createDraft.teachingAssignments.length) return false;
      for (const a of createDraft.teachingAssignments) {
        const g = Number(a.grade);
        if (!Number.isInteger(g) || g <= 0) return false;
        if (!a.disciplineCode.trim()) return false;
        if (!a.part) return false;
      }
      return true;
    }
    return true;
  }, [createBusy, createDraft, createNeedsStudentMeta, createNeedsTeacherMeta]);

  const onCreate = async () => {
    if (!token) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      if (createNeedsStudentMeta) {
        const grade = Number(createDraft.grade);
        const group = Number(createDraft.group);
        await api.adminUsers.create(token, {
          lastName: createDraft.lastName,
          firstName: createDraft.firstName,
          patronymic: createDraft.patronymic,
          username: createDraft.username.trim(),
          password: createDraft.password,
          primaryRole: "student",
          grade,
          group,
        });
      } else if (createNeedsTeacherMeta) {
        await api.adminUsers.create(token, {
          lastName: createDraft.lastName,
          firstName: createDraft.firstName,
          patronymic: createDraft.patronymic,
          username: createDraft.username.trim(),
          password: createDraft.password,
          primaryRole: "teacher",
          teachingAssignments: createDraft.teachingAssignments.map((a) => ({
            disciplineCode: a.disciplineCode.trim(),
            grade: Number(a.grade),
            part: a.part,
          })),
        });
      } else {
        await api.adminUsers.create(token, {
          lastName: createDraft.lastName,
          firstName: createDraft.firstName,
          patronymic: createDraft.patronymic,
          username: createDraft.username.trim(),
          password: createDraft.password,
          primaryRole: createDraft.primaryRole as Exclude<PrimaryRole, "student" | "teacher">,
        });
      }

      setCreateOpen(false);
      setCreateDraft({
        lastName: "",
        firstName: "",
        patronymic: "",
        username: "",
        password: "",
        primaryRole: "teacher",
        grade: "",
        group: "",
        teachingAssignments: [{ disciplineCode: "", grade: "", part: "whole_class" }],
      });
      await refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "USER_CREATE_FAILED");
    } finally {
      setCreateBusy(false);
    }
  };

  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [rolesTarget, setRolesTarget] = useState<UserEditDraft | null>(null);
  const [rolesBusy, setRolesBusy] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesDraft, setRolesDraft] = useState<RolesDraft>({ primaryRole: "teacher", secondaryRoles: [] });
  const [editTeachingAssignments, setEditTeachingAssignments] = useState<TeachingAssignmentDraft[]>([
    { disciplineCode: "", grade: "", part: "whole_class" },
  ]);
  const [editChildrenIds, setEditChildrenIds] = useState<string[]>([]);

  const openRolesModal = async (u: User) => {
    if ((u.primaryRole === "sysadmin" || u.username.trim().toLowerCase() === "admin") && !sysAdminViewer) {
      window.alert("Изменение этой учётной записи доступно только системному администратору.");
      return;
    }
    setRolesTarget({
      id: u.id,
      lastName: u.lastName,
      firstName: u.firstName,
      patronymic: u.patronymic,
      username: u.username,
      primaryRole: u.primaryRole,
      secondaryRoles: [...u.secondaryRoles] as SecondaryRole[],
      password: "",
    });
    setRolesDraft({ primaryRole: u.primaryRole, secondaryRoles: [...u.secondaryRoles] as SecondaryRole[] });
    setRolesError(null);
    setRolesModalOpen(true);
    if (!token) return;
    try {
      const details = await api.adminUsers.details(token, u.id);
      setEditTeachingAssignments(
        (details.teachingAssignments ?? []).map((a) => ({
          disciplineCode: a.disciplineCode,
          grade: String(a.grade),
          part: a.part,
        })),
      );
      setEditChildrenIds(details.childrenUserIds ?? []);
    } catch {
      setEditTeachingAssignments([{ disciplineCode: "", grade: "", part: "whole_class" }]);
      setEditChildrenIds([]);
    }
  };

  const closeRolesModal = () => {
    setRolesModalOpen(false);
    setRolesTarget(null);
    setRolesBusy(false);
    setRolesError(null);
    setEditTeachingAssignments([{ disciplineCode: "", grade: "", part: "whole_class" }]);
    setEditChildrenIds([]);
  };

  const toggleSecondary = (r: SecondaryRole) => {
    setRolesDraft((d) => {
      const exists = d.secondaryRoles.includes(r);
      return { ...d, secondaryRoles: exists ? d.secondaryRoles.filter((x) => x !== r) : [...d.secondaryRoles, r] };
    });
  };

  const saveRoles = async () => {
    if (!token || !rolesTarget) return;
    setRolesBusy(true);
    setRolesError(null);
    const allRoles = new Set<string>([rolesDraft.primaryRole, ...rolesDraft.secondaryRoles]);
    try {
      await api.adminUsers.update(token, rolesTarget.id, {
        lastName: rolesTarget.lastName,
        firstName: rolesTarget.firstName,
        patronymic: rolesTarget.patronymic,
        username: rolesTarget.username,
        password: rolesTarget.password.trim() ? rolesTarget.password : undefined,
        primaryRole: rolesDraft.primaryRole,
        secondaryRoles: rolesDraft.secondaryRoles as any,
        teachingAssignments: allRoles.has("teacher")
          ? editTeachingAssignments.map((a) => ({
              disciplineCode: a.disciplineCode.trim(),
              grade: Number(a.grade),
              part: a.part,
            }))
          : [],
        childrenUserIds: allRoles.has("parent") ? editChildrenIds : [],
      });
      closeRolesModal();
      await refresh();
    } catch (e) {
      setRolesError(e instanceof Error ? e.message : "USER_ROLES_SAVE_FAILED");
      setRolesBusy(false);
    }
  };

  const deleteUser = async () => {
    if (!token || !rolesTarget) return;
    const ok = window.confirm(
      `Вы действительно хотите удалить ${rolesTarget.lastName} ${rolesTarget.firstName}? Это действие нельзя отменить.`,
    );
    if (!ok) return;
    const phrase = window.prompt("Введите «УДАЛИТЬ» для подтверждения");
    if (phrase?.trim() !== "УДАЛИТЬ") return;
    setRolesBusy(true);
    setRolesError(null);
    try {
      await api.adminUsers.delete(token, rolesTarget.id, "УДАЛИТЬ");
      closeRolesModal();
      await refresh();
    } catch (e) {
      setRolesError(e instanceof Error ? e.message : "USER_DELETE_FAILED");
      setRolesBusy(false);
    }
  };

  useEffect(() => {
    if (!token || tab !== "teachers") return;
    const teachers = users.filter((u) => isTeacherUser(u));
    if (!teachers.length) {
      setTeacherLinesById({});
      return;
    }
    let cancelled = false;
    setTeacherCardsLoading(true);
    void Promise.all(
      teachers.map((u) =>
        api.adminUsers.details(token, u.id).then((d) => ({
          id: u.id,
          lines: (d.teachingAssignments ?? []).map((a) => {
            const lbl = a.classLabel ?? formatClassTeachingLabel(a.grade, a.groupNumber ?? null);
            const subj = a.disciplineName ?? a.disciplineCode;
            return `${lbl} — ${subj}`;
          }),
        })),
      ),
    )
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, string[]> = {};
        for (const r of rows) next[r.id] = r.lines;
        setTeacherLinesById(next);
      })
      .catch(() => {
        if (!cancelled) setTeacherLinesById({});
      })
      .finally(() => {
        if (!cancelled) setTeacherCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, users, token]);

  if (!viewer || !canAccessSchoolUserManagement(viewer)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">Нет доступа к разделу.</p>
      </div>
    );
  }

  const teachersList = users.filter((u) => isTeacherUser(u));
  const childrenList = users.filter((u) => u.primaryRole === "student");
  const tabBtn = (id: UsersTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={[
        "rounded-full px-4 py-2 text-sm font-medium transition",
        tab === id ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">Слой 0 • Кабинет • Учебное управление</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Управление пользователями</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabBtn("teachers", "Учителя")}
        {tabBtn("children", "Дети")}
        {tabBtn("candidates", "Кандидаты")}
        {sysAdminViewer ? tabBtn("all_users", "Все пользователи") : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {tab === "teachers"
            ? `Педагоги: ${teachersList.length}`
            : tab === "children"
              ? `Ученики: ${childrenList.length}`
              : tab === "candidates"
                ? `Кандидаты: ${candidates.length}`
                : `Всего: ${users.length}`}
        </div>
        {tab === "candidates" ? (
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            onClick={() => void createCandidate()}
            disabled={createCandidateBusy}
          >
            {createCandidateBusy ? "Создаём…" : "Создать кандидата"}
          </button>
        ) : (
          <button
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setCreateOpen(true)}
          >
            Создать пользователя
          </button>
        )}
      </div>

      {loading ? <div className="mt-3 text-sm text-slate-600">Загрузка...</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      {!loading && tab === "teachers" ? (
        <div className="mt-4">
          {teacherCardsLoading ? <div className="text-sm text-slate-500">Загрузка карточек…</div> : null}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teachersList.map((u) => {
              const lines = teacherLinesById[u.id] ?? [];
              const hr =
                u.homeroomGrade != null && u.homeroomGroupNumber != null
                  ? formatClassTeachingLabel(u.homeroomGrade, u.homeroomGroupNumber)
                  : null;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => nav(`/section/users_admin/teacher/${encodeURIComponent(u.id)}`)}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
                        {(u.lastName?.[0] ?? "") + (u.firstName?.[0] ?? "")}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold leading-snug text-slate-900">
                        {u.lastName} {u.firstName} {u.patronymic}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">В каком классе что ведёт</div>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {lines.length === 0 ? <li>—</li> : lines.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                      {hr ? (
                        <div className="mt-2 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-800">
                          классный руководитель {hr}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
            {teachersList.length === 0 ? (
              <div className="col-span-full text-sm text-slate-600">Нет пользователей с ролью педагога.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && tab === "children" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {childrenList.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => openRolesModal(u)}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm shadow-sm hover:bg-slate-50"
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="h-12 w-12 rounded-full border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
                  {(u.lastName?.[0] ?? "") + (u.firstName?.[0] ?? "")}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-medium text-slate-900">
                  {u.lastName} {u.firstName}
                </div>
                <div className="text-xs text-slate-500">@{u.username}</div>
              </div>
            </button>
          ))}
          {childrenList.length === 0 ? <div className="text-sm text-slate-600">Нет учеников.</div> : null}
        </div>
      ) : null}

      {!loading && tab === "candidates" ? (
        <div className="mt-4">
          {candidatesLoading ? <div className="text-sm text-slate-600">Загрузка кандидатов…</div> : null}
          {candidatesError ? <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{candidatesError}</div> : null}

          {!candidatesLoading ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.map((c) => {
                const link = `${window.location.origin}/candidate/apply/${encodeURIComponent(c.candidateId)}`;
                const isSubmitted = c.status === "submitted";
                const initials = (c.fio?.[0] ?? "К") + (c.fio?.split(" ")?.[1]?.[0] ?? "");
                return (
                  <button
                    key={c.candidateId}
                    type="button"
                    onClick={() => nav(`/section/users_admin/candidate/${encodeURIComponent(c.candidateId)}`)}
                    className={[
                      "rounded-2xl border p-4 text-left shadow-sm transition",
                      isSubmitted ? "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md",
                    ].join(" ")}
                  >
                    {isSubmitted ? (
                      <div className="flex items-start gap-3">
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
                            {initials.toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-semibold text-slate-900 truncate">{c.fio ?? "—"}</div>
                          {c.aboutMe ? (
                            <div className="mt-2 line-clamp-3 text-sm text-slate-700">{c.aboutMe}</div>
                          ) : (
                            <div className="mt-2 text-sm text-slate-500">Описание не заполнено</div>
                          )}
                          {c.keyWorkplaces ? <div className="mt-2 line-clamp-3 text-xs text-slate-600">{c.keyWorkplaces}</div> : null}
                          {c.teachingSchoolExperience ? (
                            <div className="mt-2 text-xs text-slate-600">Стаж в школе: {c.teachingSchoolExperience}</div>
                          ) : null}
                          {c.tutoringExperience && c.tutoringExperience !== "none" ? (
                            <div className="mt-1 text-xs text-slate-600">Репетиторство: {c.tutoringExperience}</div>
                          ) : null}
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
                            Анкета заполнена
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-[132px] w-[132px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                          <QrCodeImage value={link} size={120} />
                        </div>
                        <a href={link} target="_blank" rel="noreferrer" className="w-full truncate text-center text-xs font-medium text-slate-900 underline underline-offset-2">
                          {link}
                        </a>
                        <div className="text-xs text-slate-600">Отсканируйте QR или перейдите по ссылке, чтобы заполнить анкету</div>
                      </div>
                    )}
                  </button>
                );
              })}

              {candidates.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-600">
                  Пока нет кандидатов.
                  <div className="mt-2 text-xs text-slate-500">Нажмите «Создать кандидата», чтобы начать приглашение.</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && tab === "all_users" && sysAdminViewer ? (
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-slate-600">
                <th className="px-3 py-2 font-medium">ФИО</th>
                <th className="px-3 py-2 font-medium">username</th>
                <th className="px-3 py-2 font-medium">primaryRole</th>
                <th className="px-3 py-2 font-medium">secondaryRoles</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="cursor-pointer border-t border-slate-200 text-sm hover:bg-slate-50" onClick={() => openRolesModal(u)}>
                  <td className="px-3 py-2">
                    {u.lastName} {u.firstName} {u.patronymic}
                  </td>
                  <td className="px-3 py-2 text-slate-600">@{u.username}</td>
                  <td className="px-3 py-2">{u.primaryRole}</td>
                  <td className="px-3 py-2 text-slate-600">{u.secondaryRoles.join(", ") || "—"}</td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-sm text-slate-600" colSpan={4}>
                    Пока нет пользователей.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {mayClearDb ? (
      <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/80 p-4">
        <div className="text-sm font-semibold text-rose-900">Опасные действия</div>
        <p className="mt-2 text-sm text-rose-800">
          Полная очистка базы удалит пользователей, документы, чаты, расписание, журналы и остальные данные. Используйте только на тестовых стендах или
          после явного решения администрации.
        </p>
        <button
          type="button"
          className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          onClick={() => {
            setClearPhrase("");
            setClearError(null);
            setClearModalOpen(true);
          }}
        >
          Очистить базу данных
        </button>
      </div>
      ) : null}

      {clearModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-rose-800">Подтверждение очистки базы</div>
            <p className="mt-3 text-sm text-slate-700">
              Будут удалены все созданные пользователи, документы, чаты, расписания, журналы и т.п. Останется только системный администратор{" "}
              <code className="rounded bg-slate-100 px-1">admin</code> с паролем по умолчанию{" "}
              <code className="rounded bg-slate-100 px-1">Admin123!</code>.
            </p>
            <label className="mt-4 block text-sm">
              <div className="text-slate-600">Введите «ОЧИСТИТЬ» для подтверждения</div>
              <input
                value={clearPhrase}
                onChange={(e) => setClearPhrase(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                autoComplete="off"
              />
            </label>
            {clearError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{clearError}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                disabled={clearBusy}
                onClick={() => setClearModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                disabled={clearBusy || clearPhrase.trim() !== "ОЧИСТИТЬ"}
                onClick={() => {
                  if (!token) return;
                  setClearBusy(true);
                  setClearError(null);
                  void api.adminUsers
                    .clearDatabase(token, { confirmPhrase: "ОЧИСТИТЬ" })
                    .then(() => {
                      auth.logout();
                      nav("/login", {
                        replace: true,
                        state: { message: "База очищена. Войдите под учётной записью admin / Admin123!" },
                      });
                    })
                    .catch((e) => setClearError(e instanceof Error ? e.message : "CLEAR_FAILED"))
                    .finally(() => setClearBusy(false));
                }}
              >
                {clearBusy ? "Выполняем…" : "Подтвердить очистку"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm text-slate-500">Пользователи • Создание</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">Новый пользователь</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <div className="text-slate-600">Фамилия</div>
                <input
                  value={createDraft.lastName}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, lastName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Имя</div>
                <input
                  value={createDraft.firstName}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, firstName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">Отчество</div>
                <input
                  value={createDraft.patronymic}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, patronymic: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>

              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">username</div>
                <input
                  value={createDraft.username}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, username: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
                {createNeedsStudentMeta && createDraft.grade && createDraft.group ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Код ученика будет сохранён как{" "}
                    <code>
                      student{createDraft.username.trim() || "username"}
                      {createDraft.grade}
                      {createDraft.group}
                    </code>
                    .
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">
                    Для ученика используйте логин по схеме <code>studentusernamegradegroup</code>.
                  </div>
                )}
              </label>

              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">Пароль</div>
                <input
                  value={createDraft.password}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, password: e.target.value }))}
                  type="password"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>

              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">primaryRole</div>
                <select
                  value={createDraft.primaryRole}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, primaryRole: e.target.value as PrimaryRole }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                >
                  {roleOptionsForViewer(viewer).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              {createNeedsStudentMeta ? (
                <>
                  <label className="block text-sm">
                    <div className="text-slate-600">Класс</div>
                    <select
                      value={createDraft.grade}
                      onChange={(e) =>
                        setCreateDraft((d) => ({
                          ...d,
                          grade: e.target.value,
                          group: "",
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    >
                      <option value="">Выберите...</option>
                      {schoolGrades.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <div className="text-slate-600">Группа</div>
                    <select
                      value={createDraft.group}
                      onChange={(e) => setCreateDraft((d) => ({ ...d, group: e.target.value }))}
                      disabled={selectedStudentGroups.length === 0}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                    >
                      <option value="">{selectedStudentGroups.length ? "Выберите..." : "Сначала класс"}</option>
                      {selectedStudentGroups.map((group) => (
                        <option key={group.id} value={group.groupNumber}>
                          {group.groupNumber} группа
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              {createNeedsTeacherMeta ? (
                <div className="md:col-span-2">
                  <div className="mt-2 text-sm font-medium text-slate-900">Преподаёт</div>
                  <div className="mt-2 space-y-3">
                    {createDraft.teachingAssignments.map((a, idx) => {
                      const gradeNum = Number(a.grade);
                      const subjectOptions =
                        Number.isFinite(gradeNum) && gradeNum > 0 ? disciplinesByGrade[gradeNum] ?? [] : [];

                      return (
                        <div key={idx} className="grid gap-3 md:grid-cols-3 md:items-end">
                          <label className="block text-sm">
                            <div className="text-slate-600">Предмет</div>
                            <select
                              value={a.disciplineCode}
                              disabled={!Number.isFinite(gradeNum) || gradeNum <= 0}
                              onFocus={() => {
                                if (Number.isFinite(gradeNum) && gradeNum > 0) void ensureDisciplinesLoaded(gradeNum);
                              }}
                              onChange={(e) =>
                                setCreateDraft((d) => {
                                  const next = [...d.teachingAssignments];
                                  next[idx] = { ...next[idx], disciplineCode: e.target.value };
                                  return { ...d, teachingAssignments: next };
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                            >
                              <option value="">
                                {Number.isFinite(gradeNum) && gradeNum > 0 ? "Выберите..." : "Сначала класс"}
                              </option>
                              {subjectOptions.map((s) => (
                                <option key={s.code} value={s.code}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-sm">
                            <div className="text-slate-600">Класс</div>
                            <select
                              value={a.grade}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCreateDraft((d) => {
                                  const next = [...d.teachingAssignments];
                                  next[idx] = { ...next[idx], grade: v, disciplineCode: "" };
                                  return { ...d, teachingAssignments: next };
                                });
                                const g = Number(v);
                                if (Number.isFinite(g) && g > 0) void ensureDisciplinesLoaded(g);
                              }}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                            >
                              <option value="">Выберите...</option>
                              {schoolGrades.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-sm">
                            <div className="text-slate-600">Часть класса</div>
                            <select
                              value={a.part}
                              onChange={(e) =>
                                setCreateDraft((d) => {
                                  const next = [...d.teachingAssignments];
                                  next[idx] = { ...next[idx], part: e.target.value as TeachingAssignmentPart };
                                  return { ...d, teachingAssignments: next };
                                })
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                            >
                              <option value="whole_class">Весь класс</option>
                              <option value="group1">1 группа</option>
                              <option value="group2">2 группа</option>
                            </select>
                          </label>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        setCreateDraft((d) => ({
                          ...d,
                          teachingAssignments: [
                            ...d.teachingAssignments,
                            { disciplineCode: "", grade: "", part: "whole_class" },
                          ],
                        }))
                      }
                      className="mt-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                    >
                      Добавить ещё связку
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {createError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                disabled={createBusy}
              >
                Отмена
              </button>
              <button
                onClick={() => void onCreate()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                disabled={!createCanSubmit}
              >
                {createBusy ? "Создаём..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rolesModalOpen && rolesTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm text-slate-500">Пользователи • Роли</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{rolesTarget.lastName} {rolesTarget.firstName}</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block text-sm">
                <div className="text-slate-600">Фамилия</div>
                <input
                  value={rolesTarget.lastName}
                  onChange={(e) => setRolesTarget((d) => (d ? { ...d, lastName: e.target.value } : d))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm">
                <div className="text-slate-600">Имя</div>
                <input
                  value={rolesTarget.firstName}
                  onChange={(e) => setRolesTarget((d) => (d ? { ...d, firstName: e.target.value } : d))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">Отчество</div>
                <input
                  value={rolesTarget.patronymic}
                  onChange={(e) => setRolesTarget((d) => (d ? { ...d, patronymic: e.target.value } : d))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">username</div>
                <input
                  value={rolesTarget.username}
                  onChange={(e) => setRolesTarget((d) => (d ? { ...d, username: e.target.value } : d))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <div className="text-slate-600">primaryRole</div>
                <select
                  value={rolesDraft.primaryRole}
                  onChange={(e) => setRolesDraft((d) => ({ ...d, primaryRole: e.target.value as PrimaryRole }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                >
                  {roleOptionsForViewer(viewer).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-900">secondaryRoles</div>
                <div className="mt-2 space-y-2">
                  {SECONDARY_ROLES.map((r) => (
                    <label key={r} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="text-slate-800">{r}</span>
                      <input type="checkbox" checked={rolesDraft.secondaryRoles.includes(r)} onChange={() => toggleSecondary(r)} />
                    </label>
                  ))}
                </div>
              </div>
              {(rolesDraft.primaryRole === "teacher" || rolesDraft.secondaryRoles.includes("teacher")) ? (
                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-slate-900">Назначения teacher</div>
                  <div className="mt-2 space-y-2">
                    {editTeachingAssignments.map((a, idx) => {
                      const gradeNum = Number(a.grade);
                      const subjectOptions = Number.isFinite(gradeNum) && gradeNum > 0 ? disciplinesByGrade[gradeNum] ?? [] : [];
                      return (
                        <div key={idx} className="grid gap-2 md:grid-cols-3">
                          <select
                            value={a.grade}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditTeachingAssignments((prev) => prev.map((x, i) => (i === idx ? { ...x, grade: v, disciplineCode: "" } : x)));
                              const g = Number(v);
                              if (Number.isFinite(g) && g > 0) void ensureDisciplinesLoaded(g);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Класс</option>
                            {schoolGrades.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                          <select
                            value={a.disciplineCode}
                            onFocus={() => {
                              if (Number.isFinite(gradeNum) && gradeNum > 0) void ensureDisciplinesLoaded(gradeNum);
                            }}
                            onChange={(e) => setEditTeachingAssignments((prev) => prev.map((x, i) => (i === idx ? { ...x, disciplineCode: e.target.value } : x)))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Предмет</option>
                            {subjectOptions.map((s) => (
                              <option key={s.code} value={s.code}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            value={a.part}
                            onChange={(e) => setEditTeachingAssignments((prev) => prev.map((x, i) => (i === idx ? { ...x, part: e.target.value as TeachingAssignmentPart } : x)))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="whole_class">Весь класс</option>
                            <option value="group1">1 группа</option>
                            <option value="group2">2 группа</option>
                          </select>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setEditTeachingAssignments((prev) => [...prev, { disciplineCode: "", grade: "", part: "whole_class" }])}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    >
                      + Добавить назначение
                    </button>
                  </div>
                </div>
              ) : null}
              {(rolesDraft.primaryRole === "parent" || rolesDraft.secondaryRoles.includes("parent")) ? (
                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-slate-900">Привязка детей</div>
                  <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-auto rounded-xl border border-slate-200 p-2">
                    {users
                      .filter((u) => u.primaryRole === "student")
                      .map((u) => (
                        <label key={u.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                          <input
                            type="checkbox"
                            checked={editChildrenIds.includes(u.id)}
                            onChange={(e) =>
                              setEditChildrenIds((prev) => (e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)))
                            }
                          />
                          <span className="truncate">{u.lastName} {u.firstName}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ) : null}
              {(rolesDraft.primaryRole === "parent" || rolesDraft.secondaryRoles.includes("parent")) && rolesTarget ? (
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-600">Быстрое удаление привязки:</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editChildrenIds.map((childId) => {
                      const child = users.find((u) => u.id === childId);
                      return (
                        <button
                          key={childId}
                          type="button"
                          onClick={() => {
                            void api.adminUsers.unlinkChild(token!, rolesTarget.id, childId).then(() => {
                              setEditChildrenIds((prev) => prev.filter((x) => x !== childId));
                            });
                          }}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                        >
                          Отвязать: {child ? `${child.lastName} ${child.firstName}` : childId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {rolesError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{rolesError}</div> : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => void deleteUser()}
                className="mr-auto rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                disabled={rolesBusy}
              >
                Удалить пользователя
              </button>
              <button
                onClick={closeRolesModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                disabled={rolesBusy}
              >
                Отмена
              </button>
              <button
                onClick={() => void saveRoles()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                disabled={rolesBusy}
              >
                {rolesBusy ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

