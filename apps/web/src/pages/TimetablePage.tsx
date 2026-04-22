import { Fragment, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import type { User } from "../types/user";

type SchoolClass = { id: string; grade: number };
type LessonOption = {
  teacherLoadId: string;
  partLabel: string;
  groupNumber: number | null;
  disciplineCode: string;
  disciplineName: string;
  teacherUserId: string;
  teacherName: string;
};

type CalendarOverlay = {
  id: string;
  title: string;
  description?: string;
  eventType?: string;
};

type WeekCell = {
  slotPatternId: string;
  dayOfWeek: number;
  date: string;
  slotIndex: number;
  slotIndexEnd: number;
  kind: "lesson" | "service";
  serviceType: "lunch" | "walk" | "self_study" | "other" | null;
  serviceDescription?: string | null;
  wholeClassEvents?: CalendarOverlay[];
  wholeClass: { label: string; lesson: any | null; availableOptions: LessonOption[] };
  groups: Array<{ id: string; label: string; groupNumber: number; lesson: any | null; events?: CalendarOverlay[]; availableOptions: LessonOption[] }>;
};

type VisualBlock = {
  id: string;
  weekStart: string;
  dayOfWeek: number;
  grade: number;
  /** Верхняя граница по классам (включительно); если нет — только `grade`. */
  gradeEnd?: number;
  slotIndexStart: number;
  slotIndexEnd: number;
  label: string;
  colorIndex: number;
  kind: "service" | "blocked";
  serviceType: "lunch" | "walk" | "self_study" | "other" | null;
  serviceDescription: string | null;
};

const DAY_LABELS: Record<string, string> = { "1": "ПН", "2": "ВТ", "3": "СР", "4": "ЧТ", "5": "ПТ" };

/** Маркеры учителей в сетке (спокойные, различимые). */
const TIMETABLE_MARKER_COLORS = [
  "#93c5fd",
  "#c4b5fd",
  "#6ee7b7",
  "#fcd34d",
  "#f9a8d4",
  "#86efac",
  "#38bdf8",
  "#fbbf24",
  "#a78bfa",
  "#5eead4",
];

const MY_SCHEDULE_DISCIPLINE_TINTS = [
  "bg-sky-100 border-sky-300",
  "bg-amber-100 border-amber-300",
  "bg-emerald-100 border-emerald-300",
  "bg-violet-100 border-violet-300",
  "bg-rose-100 border-rose-300",
  "bg-cyan-100 border-cyan-300",
  "bg-lime-100 border-lime-300",
  "bg-indigo-100 border-indigo-300",
];

function canManageTimetable(user: User | null): boolean {
  if (!user) return false;
  if (user.username.trim().toLowerCase() === "admin") return true;
  return user.primaryRole === "head_teacher" || user.primaryRole === "director" || user.primaryRole === "sysadmin";
}

function isTeacherViewer(user: User | null): boolean {
  if (!user) return false;
  return user.primaryRole === "teacher" || user.secondaryRoles.includes("teacher");
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(date: Date): Date {
  const copy = new Date(date);
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  return copy;
}

function shiftWeek(weekStart: string, delta: number): string {
  return isoDateLocal(mondayOf(new Date(new Date(`${weekStart}T00:00:00`).getTime() + delta * 7 * 86400000)));
}

function serviceLabel(v: WeekCell["serviceType"]): string {
  if (v === "lunch") return "Обед";
  if (v === "walk") return "Прогулка";
  if (v === "self_study") return "Самоподготовка";
  if (v === "other") return "Другое";
  return "Служебный интервал";
}

function getCombinedOptions(cell: WeekCell): LessonOption[] {
  return [...cell.wholeClass.availableOptions, ...cell.groups.flatMap((group) => group.availableOptions)];
}

function SlotActionsPopover(props: {
  token: string;
  weekStart: string;
  canManageTimetable: boolean;
  slot: WeekCell;
  grade: number;
  part: "whole" | 1 | 2;
  onClose: () => void;
  onRefresh: () => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  setActiveSlotPopover: (v: any) => void;
}) {
  const { token, weekStart, canManageTimetable, slot, grade, part, onClose, onRefresh, setLoading, setError } = props;

  const hasOverlayEvents = Boolean((slot.wholeClassEvents?.length ?? 0) > 0 || slot.groups.some((g) => (g.events?.length ?? 0) > 0));

  const combinedOptions = getCombinedOptions(slot);
  const uniqueSubjects = Array.from(
    new Map(
      combinedOptions.map((o) => [
        o.disciplineCode,
        { disciplineCode: o.disciplineCode, disciplineName: o.disciplineName },
      ]),
    ).values(),
  );

  const [subjectCode, setSubjectCode] = useState<string>(() => uniqueSubjects[0]?.disciplineCode ?? "");
  const subjectOptions = useMemo(() => combinedOptions.filter((o) => o.disciplineCode === subjectCode), [combinedOptions, subjectCode]);

  const uniqueTeachers = Array.from(new Map(subjectOptions.map((o) => [o.teacherUserId, { teacherUserId: o.teacherUserId, teacherName: o.teacherName }])).values());
  const [teacherUserId, setTeacherUserId] = useState<string>(() => uniqueTeachers[0]?.teacherUserId ?? "");

  useEffect(() => {
    if (!uniqueSubjects.some((s) => s.disciplineCode === subjectCode)) setSubjectCode(uniqueSubjects[0]?.disciplineCode ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.slotPatternId]);

  useEffect(() => {
    const teachers = Array.from(new Set(subjectOptions.map((o) => o.teacherUserId)));
    if (!teachers.includes(teacherUserId)) setTeacherUserId(teachers[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectCode, slot.slotPatternId]);

  const teacherTeacherLoads = subjectOptions.filter((o) => o.teacherUserId === teacherUserId);
  const partOptions: Array<{ label: string; groupNumber: number | null }> = [];
  if (teacherTeacherLoads.some((o) => o.groupNumber == null)) partOptions.push({ label: "Весь класс", groupNumber: null });
  if (teacherTeacherLoads.some((o) => o.groupNumber === 1)) partOptions.push({ label: "Группа 1", groupNumber: 1 });
  if (teacherTeacherLoads.some((o) => o.groupNumber === 2)) partOptions.push({ label: "Группа 2", groupNumber: 2 });

  const [selectedPartLabel, setSelectedPartLabel] = useState<string>(() => {
    if (part === "whole") return "Весь класс";
    if (part === 1) return "Группа 1";
    return "Группа 2";
  });

  useEffect(() => {
    const desired =
      part === "whole" ? "Весь класс" : part === 1 ? "Группа 1" : "Группа 2";
    if (partOptions.some((p) => p.label === desired)) setSelectedPartLabel(desired);
    else setSelectedPartLabel(partOptions[0]?.label ?? "Весь класс");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.slotPatternId, teacherUserId, subjectCode]);

  const selectedPartGroupNumber = partOptions.find((p) => p.label === selectedPartLabel)?.groupNumber ?? null;
  const selectedOption = teacherTeacherLoads.find((o) => o.groupNumber === selectedPartGroupNumber) ?? null;

  // Status editor
  const [statusKind, setStatusKind] = useState<"lesson" | "service">(() => (slot.kind === "lesson" ? "lesson" : "service"));
  const [statusServiceType, setStatusServiceType] = useState<"lunch" | "walk" | "self_study" | "other">(() => slot.serviceType ?? "lunch");
  const [otherText, setOtherText] = useState<string>(() => (slot.serviceType === "other" ? slot.serviceDescription ?? "" : ""));

  useEffect(() => {
    setStatusKind(slot.kind === "lesson" ? "lesson" : "service");
    setStatusServiceType((slot.serviceType as any) ?? "lunch");
    setOtherText(slot.serviceType === "other" ? slot.serviceDescription ?? "" : "");
  }, [slot.slotPatternId, slot.kind, slot.serviceType, slot.serviceDescription]);

  const canDeleteSlot =
    canManageTimetable &&
    slot.kind === "lesson" &&
    !hasOverlayEvents &&
    slot.slotIndex === slot.slotIndexEnd &&
    !slot.wholeClass.lesson &&
    !slot.groups.some((g) => Boolean(g.lesson));

  const handleDeleteSlot = async () => {
    if (!canDeleteSlot) return;
    if (!window.confirm("Удалить слот?")) return;
    try {
      setLoading(true);
      await api.deleteTimetableSlot(token, slot.slotPatternId, weekStart);
      onClose();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSubject = async () => {
    if (!canManageTimetable) return;
    if (slot.kind !== "lesson") return;
    if (hasOverlayEvents) return;
    if (!selectedOption) return;

    const groupNumber = selectedOption.groupNumber; // null | 1 | 2

    // Удаляем конфликтующие уроки в рамках этого слота (только те части, которые затрагиваем).
    try {
      setLoading(true);

      const deleteIds: string[] = [];
      if (groupNumber == null) {
        if (slot.wholeClass.lesson?.id) deleteIds.push(slot.wholeClass.lesson.id);
        for (const g of slot.groups) if (g.lesson?.id) deleteIds.push(g.lesson.id);
      } else {
        if (slot.wholeClass.lesson?.id) deleteIds.push(slot.wholeClass.lesson.id);
        const targetGroup = slot.groups.find((g) => g.groupNumber === groupNumber);
        if (targetGroup?.lesson?.id) deleteIds.push(targetGroup.lesson.id);
      }
      for (const id of deleteIds) {
        await api.deleteTimetableLesson(token, id);
      }

      await api.createTimetableLesson(token, {
        date: slot.date,
        slotIndex: slot.slotIndex,
        grade,
        groupNumber: groupNumber,
        disciplineCode: selectedOption.disciplineCode,
        teacherUserId: selectedOption.teacherUserId,
        teacherLoadId: selectedOption.teacherLoadId,
      });

      onClose();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!canManageTimetable) return;
    try {
      setLoading(true);
      const kind = statusKind === "lesson" ? "lesson" : ("service" as const);
      const serviceType = statusKind === "service" ? statusServiceType : null;
      const serviceDescription = statusKind === "service" && statusServiceType === "other" ? otherText : null;

      await api.updateTimetableSlot(token, slot.slotPatternId, {
        weekStart,
        kind,
        serviceType,
        serviceDescription,
      });

      onClose();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Действия по слоту</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {slot.date} • урок {slot.slotIndex === slot.slotIndexEnd ? slot.slotIndex : `${slot.slotIndex}-${slot.slotIndexEnd}`}
            </div>
          </div>
          <button onClick={onClose} className="ed-btn ed-btn-close ed-interactive px-2 py-1 text-sm">
            Закрыть
          </button>
        </div>

        {!canManageTimetable ? <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Редактирование доступно только руководителю.</div> : null}

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">Добавить предмет</div>
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <div className="mb-1 text-slate-600">Предмет</div>
                <select
                  disabled={!canManageTimetable || hasOverlayEvents || slot.kind !== "lesson" || uniqueSubjects.length === 0}
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {uniqueSubjects.length === 0 ? <option value="">Нет вариантов</option> : null}
                  {uniqueSubjects.map((s) => (
                    <option key={s.disciplineCode} value={s.disciplineCode}>
                      {s.disciplineName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-1 text-slate-600">Учитель</div>
                <select
                  disabled={!canManageTimetable || hasOverlayEvents || slot.kind !== "lesson" || uniqueTeachers.length === 0}
                  value={teacherUserId}
                  onChange={(e) => setTeacherUserId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {uniqueTeachers.length === 0 ? <option value="">Нет вариантов</option> : null}
                  {uniqueTeachers.map((t) => (
                    <option key={t.teacherUserId} value={t.teacherUserId}>
                      {t.teacherName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <div className="mb-1 text-slate-600">Часть класса</div>
                <select
                  disabled={!canManageTimetable || hasOverlayEvents || slot.kind !== "lesson" || partOptions.length === 0}
                  value={selectedPartLabel}
                  onChange={(e) => setSelectedPartLabel(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  {partOptions.length === 0 ? <option value="">Недоступно</option> : null}
                  {partOptions.map((p) => (
                    <option key={String(p.groupNumber)} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              {hasOverlayEvents ? <div className="text-xs text-amber-800">Слот заменён мероприятием. Изменение предмета недоступно.</div> : null}

              <button
                disabled={!canManageTimetable || hasOverlayEvents || slot.kind !== "lesson" || !selectedOption || partOptions.length === 0}
                onClick={() => void handleSaveSubject()}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Сохранить предмет
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">Изменить статус</div>
            <div className="mt-3 space-y-2">
              <select
                disabled={!canManageTimetable}
                value={statusKind === "lesson" ? "lesson" : statusServiceType}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "lesson") {
                    setStatusKind("lesson");
                    return;
                  }
                  setStatusKind("service");
                  setStatusServiceType(v as any);
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="lesson">Учебный слот</option>
                <option value="lunch">Обед</option>
                <option value="walk">Прогулка</option>
                <option value="self_study">Самоподготовка</option>
                <option value="other">Другое</option>
              </select>

              {statusKind === "service" && statusServiceType === "other" ? (
                <div>
                  <div className="mb-1 text-sm text-slate-600">Описание</div>
                  <textarea
                    disabled={!canManageTimetable}
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    className="w-full min-h-[70px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              <button
                disabled={!canManageTimetable}
                onClick={() => void handleSaveStatus()}
                className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Сохранить статус
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-semibold text-slate-900">Удалить слот</div>
            <div className="mt-3">
              <button
                disabled={!canDeleteSlot}
                onClick={() => void handleDeleteSlot()}
                className="w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Удалить слот
              </button>
              {!canDeleteSlot ? <div className="mt-1 text-xs text-slate-500">Доступно только если в слоте нет урока и нет служебного интервала.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualBlockPopover(props: {
  token: string;
  block: VisualBlock;
  onClose: () => void;
  onRefresh: () => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
}) {
  const { token, block, onClose, onRefresh, setLoading, setError } = props;
  const [label, setLabel] = useState(block.label);
  const [colorIdx, setColorIdx] = useState(block.colorIndex);
  const [kind, setKind] = useState<"service" | "blocked">(block.kind);
  const [serviceType, setServiceType] = useState(block.serviceType ?? "lunch");
  const [otherText, setOtherText] = useState(block.serviceDescription ?? "");

  useEffect(() => {
    setLabel(block.label);
    setColorIdx(block.colorIndex);
    setKind(block.kind);
    setServiceType(block.serviceType ?? "lunch");
    setOtherText(block.serviceDescription ?? "");
  }, [block.id, block.label, block.colorIndex, block.kind, block.serviceType, block.serviceDescription]);

  const handleSave = async () => {
    const t = label.trim();
    if (!t) {
      setError("Укажите название блока");
      return;
    }
    try {
      setLoading(true);
      await api.updateTimetableVisualBlock(token, block.id, {
        label: t,
        colorIndex: colorIdx,
        kind,
        serviceType: kind === "service" ? serviceType : undefined,
        serviceDescription: kind === "service" && serviceType === "other" ? otherText : null,
      });
      onClose();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Удалить объединённый блок? Слоты сетки останутся, восстановятся отдельные ячейки.")) return;
    try {
      setLoading(true);
      await api.deleteTimetableVisualBlock(token, block.id);
      onClose();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Объединённый блок</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {(block.gradeEnd ?? block.grade) > block.grade
                ? `Классы ${block.grade}–${block.gradeEnd ?? block.grade}`
                : `Класс ${block.grade}`}
              {" · "}
              {block.slotIndexStart === block.slotIndexEnd
                ? `слот ${block.slotIndexStart}`
                : `слоты ${block.slotIndexStart}–${block.slotIndexEnd}`}
            </div>
          </div>
          <button type="button" onClick={onClose} className="ed-btn ed-btn-close ed-interactive px-2 py-1 text-sm">
            Закрыть
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <div className="mb-1 text-slate-600">Название блока *</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <div className="mb-1 text-sm text-slate-600">Цвет плашки</div>
            <div className="flex flex-wrap gap-1.5">
              {TIMETABLE_MARKER_COLORS.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setColorIdx(i)}
                  className={[
                    "h-7 w-7 rounded border-2",
                    colorIdx === i ? "border-slate-900 ring-1 ring-slate-400" : "border-slate-200",
                  ].join(" ")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <div className="mb-1 text-slate-600">Тип</div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "service" | "blocked")}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="service">Служебный интервал</option>
              <option value="blocked">Блок / окно</option>
            </select>
          </label>
          {kind === "service" ? (
            <>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as typeof serviceType)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="lunch">Обед</option>
                <option value="walk">Прогулка</option>
                <option value="self_study">Самоподготовка</option>
                <option value="other">Другое</option>
              </select>
              {serviceType === "other" ? (
                <textarea
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  className="w-full min-h-[60px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="w-full rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700"
          >
            Удалить блок
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimetablePage() {
  const auth = useAuth();
  const token = auth.accessToken!;
  const user = auth.user;
  const manage = canManageTimetable(user);
  const teacherView = isTeacherViewer(user);
  const myUserId = user?.id ?? "";

  const [weekStart, setWeekStart] = useState(() => isoDateLocal(mondayOf(new Date())));
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [week, setWeek] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlotRowKeys, setSelectedSlotRowKeys] = useState<Set<string>>(() => new Set());
  const [weekSwitchModal, setWeekSwitchModal] = useState<{
    targetWeekStart: string;
    canCopy: boolean;
    sourceWeekStart: string | null;
    previewWeek: any;
  } | null>(null);
  const [activeSlotPopover, setActiveSlotPopover] = useState<{
    key: string;
    cell: WeekCell;
    grade: number;
    part: "whole" | 1 | 2;
  } | null>(null);
  const [activeVisualBlock, setActiveVisualBlock] = useState<VisualBlock | null>(null);

  const [myScheduleMode, setMyScheduleMode] = useState(false);
  const [clearWeekOpen, setClearWeekOpen] = useState(false);
  const [dupWeekOpen, setDupWeekOpen] = useState(false);
  const [colorPanelOpen, setColorPanelOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printMode, setPrintMode] = useState<"class" | "multi-class" | "teacher">("class");
  const [printPageCount, setPrintPageCount] = useState<2 | 4 | 6 | 9>(2);
  const [printTeacherUserId, setPrintTeacherUserId] = useState("");
  const [teacherColors, setTeacherColors] = useState<Record<string, number>>({});
  const [lessonTimesDraft, setLessonTimesDraft] = useState<Record<string, { startTime: string; endTime: string }>>({});

  /** Выбор диапазона для визуального объединения (квадратики): один ряд времени, горизонтально по классам. */
  const [mergePick, setMergePick] = useState<{ day: string; slotIndex: number; grade: number } | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<{
    day: string;
    slotIndex: number;
    gradeStart: number;
    gradeEnd: number;
  } | null>(null);

  const refreshClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const classesRes = await api.schoolClasses(token);
      const grades = (classesRes.classes ?? []).map((c) => c.grade).sort((a, b) => a - b);
      setClasses(classesRes.classes ?? []);
      setSelectedGrades((prev) => {
        const existing = prev.filter((grade) => grades.includes(grade));
        return existing.length ? existing : grades;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadWeek = useCallback(
    async (targetWeekStart: string) => {
      if (selectedGrades.length === 0) {
        setWeek(null);
        return null;
      }
      const weekRes = await api.timetableWeekView(token, { weekStart: targetWeekStart, grades: selectedGrades });
      return weekRes;
    },
    [selectedGrades, token],
  );

  const refreshWeek = useCallback(
    async (targetWeekStart = weekStart) => {
      if (selectedGrades.length === 0) {
        setWeek(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const weekRes = await loadWeek(targetWeekStart);
        setWeek(weekRes);
        setWeekStart(targetWeekStart);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadWeek, selectedGrades.length, weekStart],
  );

  useEffect(() => {
    void refreshClasses();
  }, [refreshClasses]);

  useEffect(() => {
    void refreshWeek();
  }, [refreshWeek]);

  useEffect(() => {
    setSelectedSlotRowKeys(new Set());
  }, [weekStart, selectedGrades]);

  useEffect(() => {
    if (!week) return;
    if (week.lessonTimesBySlotIndex) setLessonTimesDraft(week.lessonTimesBySlotIndex);
    if (week.teacherColors) setTeacherColors(week.teacherColors);
  }, [week]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMergePick(null);
        setMergeConfirm(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allGrades = useMemo(() => classes.map((c) => c.grade).sort((a, b) => a - b), [classes]);

  const teachersInWeek = useMemo(() => {
    if (!week?.days) return [];
    const map = new Map<string, { teacherUserId: string; teacherName: string; disciplines: Set<string> }>();
    for (const day of ["1", "2", "3", "4", "5"] as const) {
      const gradesBlock = week.days[day]?.grades ?? {};
      for (const g of Object.keys(gradesBlock)) {
        const cells = gradesBlock[g] as WeekCell[];
        for (const cell of cells ?? []) {
          const push = (lesson: any) => {
            if (!lesson?.teacherUserId) return;
            const id = lesson.teacherUserId as string;
            const name = String(lesson.teacherName ?? id);
            const disc = String(lesson.disciplineName ?? lesson.disciplineCode ?? "");
            if (!map.has(id)) map.set(id, { teacherUserId: id, teacherName: name, disciplines: new Set() });
            if (disc) map.get(id)!.disciplines.add(disc);
          };
          if (cell.wholeClass?.lesson) push(cell.wholeClass.lesson);
          for (const gr of cell.groups ?? []) if (gr.lesson) push(gr.lesson);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName, "ru"));
  }, [week]);

  const disciplineTintMap = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const t of teachersInWeek) {
      for (const d of t.disciplines) {
        const k = `${t.teacherUserId}:${d}`;
        if (!m.has(k)) {
          m.set(k, i % MY_SCHEDULE_DISCIPLINE_TINTS.length);
          i++;
        }
      }
    }
    return m;
  }, [teachersInWeek]);

  const tryChangeWeek = useCallback(
    async (targetWeekStart: string) => {
      setLoading(true);
      setError(null);
      try {
        const nextWeek = await loadWeek(targetWeekStart);
        if (!nextWeek) return;
        if (nextWeek.hasSchedule) {
          setWeek(nextWeek);
          setWeekStart(targetWeekStart);
          return;
        }
        setWeekSwitchModal({
          targetWeekStart,
          canCopy: Boolean(nextWeek.canCopyFromPreviousWeek && nextWeek.previousScheduledWeekStart),
          sourceWeekStart: nextWeek.previousScheduledWeekStart ?? null,
          previewWeek: nextWeek,
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadWeek],
  );

  const popoverKey = useCallback((cell: WeekCell, part: "whole" | 1 | 2, grade: number) => {
    return `${cell.slotPatternId}:${grade}:${part}`;
  }, []);

  const getSelectedSlotPatternIdsForDay = useCallback(
    (day: string) => {
      const prefix = `${day}:`;
      return Array.from(selectedSlotRowKeys)
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    },
    [selectedSlotRowKeys],
  );

  const teacherMarkerStyle = (teacherUserId: string | undefined): CSSProperties | undefined => {
    if (!teacherUserId) return undefined;
    const idx = teacherColors[teacherUserId];
    if (idx == null) return undefined;
    const c = TIMETABLE_MARKER_COLORS[idx % TIMETABLE_MARKER_COLORS.length];
    return { backgroundColor: `${c}40`, borderColor: c };
  };

  const renderLessonCard = (cell: WeekCell, grade: number, lesson: any) => {
    const mine = myUserId && lesson.teacherUserId === myUserId;
    const tintKey = `${lesson.teacherUserId}:${lesson.disciplineCode ?? lesson.disciplineName}`;
    const tintIdx = disciplineTintMap.get(tintKey) ?? 0;
    const tintClass = MY_SCHEDULE_DISCIPLINE_TINTS[tintIdx % MY_SCHEDULE_DISCIPLINE_TINTS.length] ?? MY_SCHEDULE_DISCIPLINE_TINTS[0];
    const markerStyle = teacherMarkerStyle(lesson.teacherUserId);
    const dimOthers = myScheduleMode && teacherView && mine === false;
    const highlightMine = myScheduleMode && teacherView && mine;

    return (
      <div
        className={[
          "ed-card ed-card-interactive relative flex h-24 flex-col border p-2 cursor-pointer",
          dimOthers ? "border-slate-900 bg-white" : highlightMine ? `${tintClass}` : markerStyle ? "border-slate-200" : "border-slate-200 bg-white",
        ].join(" ")}
        style={!dimOthers && !highlightMine ? markerStyle : undefined}
        onClick={() => {
          if (!manage) return;
          const part: "whole" | 1 | 2 = lesson.groupNumber == null ? "whole" : lesson.groupNumber === 1 ? 1 : 2;
          setActiveSlotPopover({ key: popoverKey(cell, part, grade), cell, grade, part });
        }}
      >
        <div className="absolute right-2 top-2 text-[16px] text-slate-600 select-none">+</div>
        <div className="mt-2 truncate text-xs font-semibold text-slate-900">{lesson.disciplineName}</div>
        <div className="mt-1 flex min-h-[2rem] items-start gap-1 text-[11px] leading-4 text-slate-600">
          {markerStyle && lesson.teacherUserId ? (
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-300"
              style={{ backgroundColor: TIMETABLE_MARKER_COLORS[(teacherColors[lesson.teacherUserId] ?? 0) % TIMETABLE_MARKER_COLORS.length] }}
            />
          ) : null}
          <span className="line-clamp-2">{lesson.teacherName}</span>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const defaultMode: "class" | "multi-class" | "teacher" =
      teacherView && selectedGrades.length <= 1 ? "teacher" : selectedGrades.length > 1 ? "multi-class" : "class";
    setPrintMode(defaultMode);
  }, [selectedGrades.length, teacherView]);

  useEffect(() => {
    if (!printTeacherUserId) {
      setPrintTeacherUserId(myUserId || teachersInWeek[0]?.teacherUserId || "");
      return;
    }
    if (printTeacherUserId === myUserId) return;
    if (!teachersInWeek.some((t) => t.teacherUserId === printTeacherUserId)) {
      setPrintTeacherUserId(myUserId || teachersInWeek[0]?.teacherUserId || "");
    }
  }, [myUserId, printTeacherUserId, teachersInWeek]);

  const openPrintVersion = () => {
    const grades = selectedGrades.slice().sort((a, b) => a - b);
    const query = new URLSearchParams({
      weekStart,
      grades: grades.join(","),
      mode: printMode,
    });
    if (printMode === "teacher" && (printTeacherUserId || myUserId)) query.set("teacherUserId", printTeacherUserId || myUserId);
    if (printMode === "multi-class") query.set("pageCount", String(printPageCount));
    window.open(`/timetable/print?${query.toString()}`, "_blank", "noopener,noreferrer");
    setPrintDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="ed-panel ed-panel-hover p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">Раздел • Расписание</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Недельный вид</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void tryChangeWeek(shiftWeek(weekStart, -1))} className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium">
              ←
            </button>
            <button onClick={() => void tryChangeWeek(isoDateLocal(mondayOf(new Date())))} className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium">
              Текущая неделя
            </button>
            <button onClick={() => void tryChangeWeek(shiftWeek(weekStart, 1))} className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium">
              →
            </button>
            <button onClick={() => void refreshWeek()} className="ed-btn ed-btn-primary ed-interactive px-3 py-1.5 text-xs font-medium text-white">
              Обновить
            </button>
            <button onClick={() => setPrintDialogOpen(true)} className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium">
              Печать / PDF
            </button>
          </div>
        </div>
        <div className="mt-2 text-sm text-slate-500">Неделя с {weekStart}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {allGrades.map((grade) => {
            const active = selectedGrades.includes(grade);
            return (
              <button
                key={grade}
                onClick={() =>
                  setSelectedGrades((prev) => (prev.includes(grade) ? prev.filter((x) => x !== grade) : [...prev, grade].sort((a, b) => a - b)))
                }
                className={[
                  active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-900 ring-slate-200",
                  "ed-interactive rounded-full px-3 py-1 text-xs font-medium ring-1",
                ].join(" ")}
              >
                {grade}
              </button>
            );
          })}
        </div>
        {error ? <div className="mt-3 text-sm text-rose-700">{error}</div> : null}
        {loading ? <div className="mt-3 text-sm text-slate-500">Загрузка...</div> : null}

        {manage ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setClearWeekOpen(true)}
              className="ed-btn ed-btn-secondary ed-interactive rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800"
            >
              Очистить расписание
            </button>
            <button
              type="button"
              onClick={() => setDupWeekOpen(true)}
              className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              Дублировать предыдущее
            </button>
            <button
              type="button"
              onClick={() => setColorPanelOpen(true)}
              className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              Цветовой маркер
            </button>
          </div>
        ) : null}
        {teacherView ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setMyScheduleMode((v) => !v)}
              className={[
                "ed-interactive rounded-xl px-3 py-1.5 text-xs font-medium ring-1",
                myScheduleMode ? "bg-indigo-900 text-white ring-indigo-900" : "bg-white text-slate-800 ring-slate-200",
              ].join(" ")}
            >
              {myScheduleMode ? "Выключить «моё расписание»" : "Показать моё расписание"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="ed-panel ed-panel-hover p-5" data-dedus-id="timetable.weekGrid">
        {selectedGrades.length === 0 ? (
          <div className="text-sm text-slate-500">Выберите хотя бы один класс, чтобы показать расписание.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="sticky left-0 top-0 z-40 border-b border-slate-200 bg-white px-2 py-2">День</th>
                  <th className="sticky left-[72px] top-0 z-40 border-b border-slate-200 bg-white px-1 py-2">Время</th>
                  {selectedGrades.map((g) => (
                    <th key={g} className="sticky top-0 z-30 border-b border-slate-200 bg-white px-2 py-2">
                      {g} класс
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["1", "2", "3", "4", "5"].map((day) => {
                  const selectedSlotPatternIdsForDay = getSelectedSlotPatternIdsForDay(day);
                  const checkboxGrade = selectedGrades[0];
                  const daySlotRowsForCheckboxGrade = checkboxGrade
                    ? (((week?.days?.[day]?.grades?.[String(checkboxGrade)] ?? []) as WeekCell[]) ?? [])
                    : [];
                  const slotById = new Map(daySlotRowsForCheckboxGrade.map((c) => [c.slotPatternId, c] as const));
                  const formatSlotRangeLabel = (cell: WeekCell) =>
                    cell.slotIndex === cell.slotIndexEnd ? String(cell.slotIndex) : `${cell.slotIndex}-${cell.slotIndexEnd}`;
                  const selectedLabels = selectedSlotPatternIdsForDay
                    .map((id) => slotById.get(id))
                    .filter(Boolean)
                    .map((c) => formatSlotRangeLabel(c!));

                  const handleResetDay = async () => {
                    if (selectedSlotPatternIdsForDay.length === 0) return;
                    const ok = window.confirm(
                      `Сбросить ряд(ы) слотов (${DAY_LABELS[day]})?\nБудут удалены все уроки и сброшен статус на учебный.\nРяды: ${selectedLabels.join(", ") || "—"}`,
                    );
                    if (!ok) return;
                    setLoading(true);
                    setError(null);
                    try {
                      await api.resetTimetableSlotRows(token, { weekStart, slotPatternIds: selectedSlotPatternIdsForDay });
                      setActiveSlotPopover(null);
                      setSelectedSlotRowKeys(new Set());
                      await refreshWeek();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setLoading(false);
                    }
                  };

                  const handleDeleteDay = async () => {
                    if (selectedSlotPatternIdsForDay.length === 0) return;

                    const idSet = new Set(selectedSlotPatternIdsForDay);
                    const hasService = selectedSlotPatternIdsForDay.some((id) => slotById.get(id)?.kind === "service");
                    let hasLessons = false;
                    if (week) {
                      for (const grade of selectedGrades) {
                        const cells = ((week?.days?.[day]?.grades?.[String(grade)] ?? []) as WeekCell[]) ?? [];
                        for (const cell of cells) {
                          if (!idSet.has(cell.slotPatternId)) continue;
                          if (cell.wholeClass.lesson) {
                            hasLessons = true;
                            break;
                          }
                          if (cell.groups.some((g) => Boolean(g.lesson))) {
                            hasLessons = true;
                            break;
                          }
                        }
                        if (hasLessons) break;
                      }
                    }

                    const ok = window.confirm(
                      hasService || hasLessons
                        ? `Удалить ряд(ы) слотов (${DAY_LABELS[day]})?\nВсе уроки и статусы будут удалены.\nРяды: ${selectedLabels.join(", ") || "—"}`
                        : `Удалить ряд(ы) слотов (${DAY_LABELS[day]})?\nРяды: ${selectedLabels.join(", ") || "—"}`,
                    );
                    if (!ok) return;

                    setLoading(true);
                    setError(null);
                    try {
                      await api.deleteTimetableSlotRows(token, { weekStart, slotPatternIds: selectedSlotPatternIdsForDay });
                      setActiveSlotPopover(null);
                      setSelectedSlotRowKeys(new Set());
                      await refreshWeek();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setLoading(false);
                    }
                  };

                  const slotTimes: Array<{ slotPatternId: string; slotIndex: number; slotIndexEnd: number; startTime: string; endTime: string }> =
                    week?.days?.[day]?.slotTimes ?? [];
                  const rowTemplates = daySlotRowsForCheckboxGrade;
                  const rowCount = rowTemplates.length;

                  const visualBlocks: VisualBlock[] = week?.visualBlocks ?? [];
                  const vbGradeEnd = (b: VisualBlock) => b.gradeEnd ?? b.grade;
                  const findVbForSlot = (grade: number, slotIndex: number) =>
                    visualBlocks.find(
                      (b) =>
                        b.dayOfWeek === Number(day) &&
                        grade >= b.grade &&
                        grade <= vbGradeEnd(b) &&
                        slotIndex >= b.slotIndexStart &&
                        slotIndex <= b.slotIndexEnd,
                    );

                  const handleMergeSquare = (grade: number, slotIndex: number) => {
                    if (!manage) return;
                    const existing = findVbForSlot(grade, slotIndex);
                    if (existing) {
                      setActiveVisualBlock(existing);
                      return;
                    }
                    if (!mergePick) {
                      setMergePick({ day, slotIndex, grade });
                      return;
                    }
                    if (mergePick.day !== day || mergePick.slotIndex !== slotIndex) return;
                    if (mergePick.grade === grade) {
                      setMergePick(null);
                      return;
                    }
                    const gradeStart = Math.min(mergePick.grade, grade);
                    const gradeEnd = Math.max(mergePick.grade, grade);
                    setMergeConfirm({ day, slotIndex, gradeStart, gradeEnd });
                    setMergePick(null);
                  };

                  const renderVisualBlockCard = (vb: VisualBlock, rowSpan: number) => {
                    const bg = TIMETABLE_MARKER_COLORS[vb.colorIndex % TIMETABLE_MARKER_COLORS.length];
                    const sub =
                      vb.kind === "service" ? serviceLabel(vb.serviceType) : "Окно / блок без уроков";
                    return (
                      <div
                        className="relative flex h-full min-h-[4.5rem] flex-col rounded-xl border p-3 shadow-sm cursor-pointer transition-all duration-150 hover:shadow-md"
                        style={{
                          backgroundColor: `${bg}44`,
                          borderColor: bg,
                          minHeight: rowSpan > 1 ? `${rowSpan * 6}rem` : undefined,
                        }}
                        onClick={() => setActiveVisualBlock(vb)}
                      >
                        <div className="pr-6 text-sm font-semibold leading-tight text-slate-900">{vb.label}</div>
                        <div className="mt-auto text-xs text-slate-600">{sub}</div>
                      </div>
                    );
                  };

                  const renderSlotColumn = (cell: WeekCell, grade: number) => {
                    const showGroups = !cell.wholeClass.lesson && cell.groups.some((g) => Boolean(g.lesson) || Boolean(g.events?.length));
                    const inVb = findVbForSlot(grade, cell.slotIndex);
                    const mergeRowActive = Boolean(mergePick && mergePick.day === day);
                    const showMergeSquare =
                      manage && !inVb && (!mergeRowActive || mergePick!.slotIndex === cell.slotIndex);
                    const pickHighlight =
                      mergePick &&
                      mergePick.day === day &&
                      mergePick.slotIndex === cell.slotIndex &&
                      mergePick.grade === grade;
                    const mergeRangeHighlight =
                      mergeConfirm &&
                      mergeConfirm.day === day &&
                      cell.slotIndex === mergeConfirm.slotIndex &&
                      grade >= mergeConfirm.gradeStart &&
                      grade <= mergeConfirm.gradeEnd;
                    const ringClass =
                      pickHighlight || mergeRangeHighlight ? "rounded-xl ring-2 ring-emerald-400 ring-offset-1 bg-emerald-50/50" : "";

                    const mergeBtn = showMergeSquare ? (
                      <button
                        type="button"
                        className="ed-interactive absolute right-2 top-2 z-10 h-3.5 w-3.5 rounded-sm border border-slate-600 bg-white shadow hover:bg-emerald-200"
                        title="Объединить с соседними классами в этом ряду (по времени)"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeSquare(grade, cell.slotIndex);
                        }}
                      />
                    ) : null;

                    const inner =
                      cell.wholeClassEvents && cell.wholeClassEvents.length > 0 ? (
                        <div
                          className={`ed-card ed-card-interactive relative flex h-24 flex-col border border-amber-200 bg-amber-50 p-2 cursor-pointer ${ringClass}`}
                          onClick={() => {
                            setActiveSlotPopover({ key: popoverKey(cell, "whole", grade), cell, grade, part: "whole" });
                          }}
                        >
                          {mergeBtn}
                          <div className="absolute right-8 top-2 text-[16px] text-slate-600 select-none">+</div>
                          <div className="mt-1 text-[11px] font-semibold text-amber-900 line-clamp-2">
                            {cell.wholeClassEvents[0]?.title}
                          </div>
                          <div className="mt-auto text-[10px] text-amber-700">мероприятие</div>
                        </div>
                      ) : cell.kind === "service" ? (
                        <div
                          className={`ed-card ed-card-interactive relative flex h-24 flex-col border border-emerald-300 bg-emerald-50 p-2 cursor-pointer ${ringClass}`}
                          onClick={() => {
                            setActiveSlotPopover({ key: popoverKey(cell, "whole", grade), cell, grade, part: "whole" });
                          }}
                        >
                          {mergeBtn}
                          <div className="absolute right-8 top-2 text-[16px] text-slate-600 select-none">+</div>
                          <div className="mt-2 line-clamp-2 text-xs font-semibold text-emerald-900">
                            {serviceLabel(cell.serviceType)}
                          </div>
                          {cell.serviceType === "other" ? (
                            <div className="mt-1 line-clamp-2 text-[11px] text-emerald-800">{cell.serviceDescription ?? ""}</div>
                          ) : null}
                        </div>
                      ) : cell.wholeClass.lesson ? (
                        <div className={`relative ${ringClass} rounded-xl`}>
                          {mergeBtn}
                          {renderLessonCard(cell, grade, cell.wholeClass.lesson)}
                        </div>
                      ) : showGroups ? (
                        <div className={`relative grid grid-cols-2 gap-2 ${ringClass} rounded-xl`}>
                          {mergeBtn}
                          {cell.groups.map((group) => {
                            const hasGroupEvent = (group.events?.length ?? 0) > 0;
                            return (
                              <div key={group.id}>
                                <div className="mb-1 text-[10px] font-medium text-slate-500">{group.label}</div>
                                {group.lesson ? (
                                  renderLessonCard(cell, grade, group.lesson)
                                ) : hasGroupEvent ? (
                                  <div
                                    className="ed-card ed-card-interactive relative flex h-24 flex-col border border-amber-200 bg-amber-50 p-2 cursor-pointer"
                                    onClick={() => {
                                      setActiveSlotPopover({
                                        key: popoverKey(cell, group.groupNumber === 1 ? 1 : 2, grade),
                                        cell,
                                        grade,
                                        part: group.groupNumber === 1 ? 1 : 2,
                                      });
                                    }}
                                  >
                                    <div className="absolute right-2 top-2 text-[16px] text-slate-600 select-none">+</div>
                                    <div className="mt-1 text-[11px] font-semibold text-amber-900 line-clamp-2">
                                      {group.events?.[0]?.title}
                                    </div>
                                    <div className="mt-auto text-[10px] text-amber-700">мероприятие</div>
                                  </div>
                                ) : (
                                  <div
                                    className="ed-card ed-card-interactive relative flex h-24 flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 p-2 cursor-pointer"
                                    onClick={() => {
                                      setActiveSlotPopover({
                                        key: popoverKey(cell, group.groupNumber === 1 ? 1 : 2, grade),
                                        cell,
                                        grade,
                                        part: group.groupNumber === 1 ? 1 : 2,
                                      });
                                    }}
                                  >
                                    <div className="text-lg text-slate-700 select-none">+</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div
                          className={`ed-card ed-card-interactive relative flex h-24 flex-col items-center justify-center border border-slate-200 bg-white p-2 cursor-pointer ${ringClass}`}
                          onClick={() => {
                            setActiveSlotPopover({ key: popoverKey(cell, "whole", grade), cell, grade, part: "whole" });
                          }}
                        >
                          {mergeBtn}
                          <div className="absolute right-8 top-2 text-[16px] text-slate-600 select-none">+</div>
                          <div className="text-lg text-slate-700 select-none">+</div>
                        </div>
                      );

                    const showRowCheckbox = checkboxGrade != null && grade === checkboxGrade;
                    const rowKey = `${day}:${cell.slotPatternId}`;
                    const checked = selectedSlotRowKeys.has(rowKey);

                    return (
                      <div key={cell.slotPatternId}>
                        {showRowCheckbox ? (
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const nextChecked = e.target.checked;
                                setSelectedSlotRowKeys((prev) => {
                                  const n = new Set(prev);
                                  if (nextChecked) n.add(rowKey);
                                  else n.delete(rowKey);
                                  return n;
                                });
                              }}
                              className="mt-3 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="min-w-0 flex-1">{inner}</div>
                          </div>
                        ) : (
                          inner
                        )}
                      </div>
                    );
                  };

                  const saveLessonTime = async (timeKey: string, startTime: string, endTime: string) => {
                    try {
                      setLoading(true);
                      const next = { ...lessonTimesDraft, [timeKey]: { startTime, endTime } };
                      setLessonTimesDraft(next);
                      await api.updateTimetableConfig(token, { lessonTimesBySlotIndex: next });
                      await refreshWeek();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setLoading(false);
                    }
                  };

                  return (
                    <>
                      {rowCount === 0 ? (
                        <tr>
                          <td colSpan={2 + selectedGrades.length} className="border-b border-slate-100 px-2 py-3 text-sm text-slate-500">
                            Нет строк слотов
                          </td>
                        </tr>
                      ) : null}
                      {rowTemplates.map((templateCell, rowIdx) => {
                        const st = slotTimes[rowIdx];
                        const timeKey =
                          templateCell.slotIndex === templateCell.slotIndexEnd
                            ? String(templateCell.slotIndex)
                            : `${templateCell.slotIndex}-${templateCell.slotIndexEnd}`;
                        const draft = lessonTimesDraft[timeKey] ?? {
                          startTime: st?.startTime ?? "08:00",
                          endTime: st?.endTime ?? "08:45",
                        };
                        return (
                          <tr key={`${day}-${templateCell.slotPatternId}`} className="align-top">
                            {rowIdx === 0 ? (
                              <td
                                rowSpan={Math.max(1, rowCount)}
                                className="sticky left-0 z-20 border-b border-slate-100 bg-white px-2 py-2 text-sm font-medium text-slate-900"
                              >
                                {DAY_LABELS[day]}
                                <div className="text-xs font-normal text-slate-500">{week?.days?.[day]?.date ?? ""}</div>
                              </td>
                            ) : null}
                            <td className="sticky left-[72px] z-20 w-[104px] border-b border-slate-100 bg-slate-50 px-1 py-1.5 align-top text-[10px] text-slate-800">
                              {manage ? (
                                <div className="flex flex-col gap-1">
                                  <input
                                    type="time"
                                    value={draft.startTime}
                                    onChange={(e) =>
                                      setLessonTimesDraft((prev) => ({
                                        ...prev,
                                        [timeKey]: { ...draft, startTime: e.target.value },
                                      }))
                                    }
                                    className="w-full rounded border border-slate-200 px-1 py-0.5"
                                  />
                                  <input
                                    type="time"
                                    value={draft.endTime}
                                    onChange={(e) =>
                                      setLessonTimesDraft((prev) => ({
                                        ...prev,
                                        [timeKey]: { ...draft, endTime: e.target.value },
                                      }))
                                    }
                                    className="w-full rounded border border-slate-200 px-1 py-0.5"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void saveLessonTime(timeKey, draft.startTime, draft.endTime)}
                                    className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px]"
                                  >
                                    ОК
                                  </button>
                                </div>
                              ) : (
                                <div className="py-6 text-center leading-tight">
                                  {st?.startTime ?? "—"}
                                  <br />
                                  <span className="text-slate-400">–</span>
                                  <br />
                                  {st?.endTime ?? "—"}
                                </div>
                              )}
                            </td>
                            {selectedGrades.map((grade) => {
                              const cell = ((week?.days?.[day]?.grades?.[String(grade)] ?? []) as WeekCell[])[rowIdx];
                              if (!cell) {
                                return (
                                  <td key={grade} className="border-b border-slate-100 px-2 py-1.5">
                                    —
                                  </td>
                                );
                              }
                              const vb = findVbForSlot(grade, cell.slotIndex);
                              if (vb) {
                                const g0 = vb.grade;
                                const g1 = vbGradeEnd(vb);
                                const s0 = vb.slotIndexStart;
                                const s1 = vb.slotIndexEnd;
                                const isVertical = g0 === g1 && s1 > s0;
                                const isHorizontal = s0 === s1 && g1 > g0;
                                const gradesInBlockVisible = selectedGrades.filter((gr) => gr >= g0 && gr <= g1).sort((a, b) => a - b);

                                if (isVertical && grade === g0 && cell.slotIndex > s0 && cell.slotIndex <= s1) {
                                  return <Fragment key={grade} />;
                                }
                                if (isHorizontal && cell.slotIndex !== s0) {
                                  return <Fragment key={grade} />;
                                }
                                if (
                                  isHorizontal &&
                                  cell.slotIndex === s0 &&
                                  gradesInBlockVisible.length > 0 &&
                                  grade !== gradesInBlockVisible[0]
                                ) {
                                  return <Fragment key={grade} />;
                                }

                                const anchorVertical = isVertical && grade === g0 && cell.slotIndex === s0;
                                const anchorHorizontal =
                                  isHorizontal &&
                                  cell.slotIndex === s0 &&
                                  gradesInBlockVisible.length > 0 &&
                                  grade === gradesInBlockVisible[0];
                                const anchorSingle = !isVertical && !isHorizontal && grade === g0 && cell.slotIndex === s0;
                                if (!anchorVertical && !anchorHorizontal && !anchorSingle) {
                                  return <Fragment key={grade} />;
                                }

                                const rowSpan = isVertical ? s1 - s0 + 1 : 1;
                                const colSpan = isHorizontal ? gradesInBlockVisible.length : 1;
                                return (
                                  <td
                                    key={grade}
                                    rowSpan={rowSpan}
                                    colSpan={colSpan}
                                    className="border-b border-slate-100 px-2 py-1.5 align-top"
                                  >
                                    {renderVisualBlockCard(vb, rowSpan)}
                                  </td>
                                );
                              }
                              return (
                                <td key={grade} className="border-b border-slate-100 px-2 py-1.5 align-top">
                                  {renderSlotColumn(cell, grade)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    <tr>
                      <td colSpan={2 + selectedGrades.length} className="border-b border-slate-100 bg-white px-2 py-2">
                        {manage ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                disabled={selectedSlotPatternIdsForDay.length === 0}
                                onClick={() => void handleResetDay()}
                                className="rounded-xl border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Сбросить ряд
                              </button>
                              <button
                                disabled={selectedSlotPatternIdsForDay.length === 0}
                                onClick={() => void handleDeleteDay()}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Удалить ряд
                              </button>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  setLoading(true);
                                  await api.createTimetableSlot(token, { dayOfWeek: Number(day), weekStart });
                                  await refreshWeek();
                                } catch (e) {
                                  setError((e as Error).message);
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              className="rounded-xl border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-700"
                            >
                              Добавить ряд слотов
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeSlotPopover ? (
        <SlotActionsPopover
          key={activeSlotPopover.key}
          token={token}
          weekStart={weekStart}
          canManageTimetable={manage}
          slot={activeSlotPopover.cell}
          grade={activeSlotPopover.grade}
          part={activeSlotPopover.part}
          onClose={() => setActiveSlotPopover(null)}
          onRefresh={() => refreshWeek()}
          setLoading={setLoading}
          setError={setError}
          setActiveSlotPopover={setActiveSlotPopover}
        />
      ) : null}

      {activeVisualBlock ? (
        <VisualBlockPopover
          key={activeVisualBlock.id}
          token={token}
          block={activeVisualBlock}
          onClose={() => setActiveVisualBlock(null)}
          onRefresh={() => refreshWeek()}
          setLoading={setLoading}
          setError={setError}
        />
      ) : null}

      {mergeConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMergeConfirm(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Объединить слоты?</div>
            <p className="mt-2 text-sm text-slate-600">
              Ряд времени: слот {mergeConfirm.slotIndex}. Классы {mergeConfirm.gradeStart}–{mergeConfirm.gradeEnd}. После объединения можно задать название и цвет блока.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setMergeConfirm(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                Нет
              </button>
              <button
                type="button"
                onClick={async () => {
                  const m = mergeConfirm;
                  if (!m) return;
                  try {
                    setLoading(true);
                    await api.createTimetableVisualBlock(token, {
                      weekStart,
                      dayOfWeek: Number(m.day),
                      grade: m.gradeStart,
                      gradeEnd: m.gradeEnd,
                      slotIndexStart: m.slotIndex,
                      slotIndexEnd: m.slotIndex,
                      label: "Объединённый блок",
                      colorIndex: 3,
                      kind: "service",
                      serviceType: "lunch",
                    });
                    setMergeConfirm(null);
                    await refreshWeek();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Да
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mergePick && !mergeConfirm ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-950 shadow-lg">
          <span>Выберите второй слот в этом ряду (другой класс) или Esc — отмена.</span>
          <button type="button" onClick={() => setMergePick(null)} className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs">
            Отмена
          </button>
        </div>
      ) : null}

      {weekSwitchModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm text-slate-500">Новой недели пока нет</div>
            <div className="mt-2 text-sm text-slate-700">Для недели с {weekSwitchModal.targetWeekStart} ещё нет расписания.</div>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => {
                  setWeek(weekSwitchModal.previewWeek);
                  setWeekStart(weekSwitchModal.targetWeekStart);
                  setWeekSwitchModal(null);
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 text-left text-sm"
              >
                Создать пустое расписание
              </button>
              <button
                disabled={!weekSwitchModal.canCopy}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.copyTimetableWeek(token, weekSwitchModal.targetWeekStart);
                    setWeekSwitchModal(null);
                    await refreshWeek(weekSwitchModal.targetWeekStart);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Оставить старое расписание
                <div className="mt-1 text-xs text-slate-500">
                  {weekSwitchModal.canCopy && weekSwitchModal.sourceWeekStart
                    ? `Источник: неделя с ${weekSwitchModal.sourceWeekStart}`
                    : "Опция доступна только для будущих недель с найденным источником."}
                </div>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setWeekSwitchModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clearWeekOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setClearWeekOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Очистить расписание</div>
            <p className="mt-2 text-sm text-slate-600">
              Будут удалены все уроки и сброшены статусы слотов для выбранных классов на неделю с {weekStart}. Структура сетки не изменится.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setClearWeekOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.clearTimetableWeek(token, { weekStart, grades: selectedGrades });
                    setClearWeekOpen(false);
                    await refreshWeek();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white"
              >
                Очистить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dupWeekOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDupWeekOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Дублировать предыдущую неделю</div>
            <p className="mt-2 text-sm text-slate-600">
              {week?.previousScheduledWeekStart
                ? `Текущая сетка будет очищена и заполнена копией с недели ${week.previousScheduledWeekStart}.`
                : "Нет данных о предыдущей неделе."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDupWeekOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                Отмена
              </button>
              <button
                type="button"
                disabled={!week?.previousScheduledWeekStart}
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.duplicateTimetablePreviousWeek(token, { targetWeekStart: weekStart, grades: selectedGrades });
                    setDupWeekOpen(false);
                    await refreshWeek();
                  } catch (e) {
                    const msg = (e as Error).message;
                    if (msg.includes("NO_PREVIOUS_WEEK") || msg.includes("400")) {
                      setError("За предыдущую неделю расписание не найдено.");
                    } else {
                      setError(msg);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Дублировать
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {colorPanelOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setColorPanelOpen(false);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Цветовой маркер учителей</div>
              <button type="button" onClick={() => setColorPanelOpen(false)} className="ed-btn ed-btn-close ed-interactive px-2 py-1 text-sm">
                Закрыть
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {teachersInWeek.length === 0 ? (
                <div className="text-sm text-slate-500">В расписании пока нет назначенных уроков.</div>
              ) : (
                teachersInWeek.map((t) => (
                  <div key={t.teacherUserId} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm border border-slate-300"
                      style={{ backgroundColor: TIMETABLE_MARKER_COLORS[(teacherColors[t.teacherUserId] ?? 0) % TIMETABLE_MARKER_COLORS.length] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">{t.teacherName}</div>
                      <div className="text-xs text-slate-500">
                        {Array.from(t.disciplines)
                          .slice(0, 6)
                          .join(", ")}
                        {t.disciplines.size > 6 ? "…" : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {TIMETABLE_MARKER_COLORS.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setTeacherColors((prev) => ({ ...prev, [t.teacherUserId]: i }))}
                          className={[
                            "h-7 w-7 rounded border-2",
                            (teacherColors[t.teacherUserId] ?? 0) === i ? "border-slate-900" : "border-slate-200",
                          ].join(" ")}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setLoading(true);
                    await api.updateTimetableTeacherColors(token, teacherColors);
                    setColorPanelOpen(false);
                    await refreshWeek();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPrintDialogOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Печать расписания</div>
                <div className="mt-1 text-xs text-slate-500">Неделя с {weekStart}</div>
              </div>
              <button type="button" onClick={() => setPrintDialogOpen(false)} className="ed-btn ed-btn-close ed-interactive px-2 py-1 text-sm">
                Закрыть
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-slate-800">Режим</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintMode("class")}
                    className={[
                      "rounded-xl px-3 py-1.5 text-xs font-medium ring-1",
                      printMode === "class" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200",
                    ].join(" ")}
                  >
                    Один класс
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode("multi-class")}
                    className={[
                      "rounded-xl px-3 py-1.5 text-xs font-medium ring-1",
                      printMode === "multi-class" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200",
                    ].join(" ")}
                  >
                    Несколько классов
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode("teacher")}
                    className={[
                      "rounded-xl px-3 py-1.5 text-xs font-medium ring-1",
                      printMode === "teacher" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200",
                    ].join(" ")}
                  >
                    Учитель
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="font-medium text-slate-900">Выбранные классы</div>
                <div className="mt-1 text-slate-600">{selectedGrades.length > 0 ? selectedGrades.join(", ") : "Классы не выбраны"}</div>
              </div>

              {printMode === "class" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Для печати будет использован первый выбранный класс: {selectedGrades[0] ?? "не выбран"}.
                </div>
              ) : null}

              {printMode === "multi-class" ? (
                <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Раскладка по листам A4</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Все выбранные классы будут собраны в сводные страницы и автоматически распределены по {printPageCount} листам формата A4.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[2, 4, 6, 9].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPrintPageCount(value as 2 | 4 | 6 | 9)}
                        className={[
                          "rounded-xl px-3 py-1.5 text-xs font-medium ring-1",
                          printPageCount === value ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-800 ring-slate-200",
                        ].join(" ")}
                      >
                        {value} листа
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {printMode === "teacher" ? (
                <label className="block text-sm">
                  <div className="mb-1 text-slate-600">Учитель</div>
                  <select
                    value={printTeacherUserId}
                    onChange={(e) => setPrintTeacherUserId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {myUserId ? <option value={myUserId}>Мое расписание</option> : null}
                    {teachersInWeek.map((teacher) => (
                      <option key={teacher.teacherUserId} value={teacher.teacherUserId}>
                        {teacher.teacherName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPrintDialogOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                Отмена
              </button>
              <button
                type="button"
                disabled={selectedGrades.length === 0 || (printMode === "teacher" && !printTeacherUserId && !myUserId)}
                onClick={openPrintVersion}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Открыть печатную версию
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
