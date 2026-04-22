import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ALARM_SOUND_ID_LIST,
  type AlarmSoundId,
  NOTIFICATION_SOUND_ID_LIST,
  type NotificationSoundId,
  SERVICE_SOUND_ID_LIST,
  type ServiceSoundId,
} from "../audio/systemSoundConfig";
import {
  playIncomingNotificationSample,
  primeServiceAudioFromUserGesture,
  systemSounds,
} from "../audio/systemSounds";
import { PersonalizationPreviewPanel } from "../components/PersonalizationPreviewPanel";
import { SECTION_LABELS } from "../lib/office";
import {
  PERSONALIZATION_SIDEBAR_SYNC_EVENT,
  type PersonalizationSidebarSectionId,
  type PersonalizationSidebarSyncPayload,
} from "../lib/personalizationSidebarSync";
import { scrollDownToFullyReveal } from "../florium/popoverViewport";
import type { SidebarAutoCollapse } from "../state/uiPersonalization";
import { usePersonalizationForm, usePersonalizationPreview } from "../state/personalizationPreview";
import { useUiPreferences } from "../state/uiPreferences";
import type { OfficeSection } from "../types/office";

const CAT_IDS = {
  interface: "personalization-cat-interface",
  notify: "personalization-cat-notify",
  florium: "personalization-cat-florium",
  a11y: "personalization-cat-a11y",
  security: "personalization-cat-security",
} as const;

const PERSONALIZATION_SECTION_ORDER: OfficeSection[] = [
  "main",
  "analytics",
  "parent_finance",
  "student_finance",
  "document_archive",
  "journal",
  "timetable",
  "methospace",
  "payroll",
  "diary",
  "users_admin",
];

const RIGHT_SIDEBAR_SECTION_ITEMS: Array<{ id: PersonalizationSidebarSectionId; label: string }> = [
  ...PERSONALIZATION_SECTION_ORDER.map((sectionId) => ({ id: sectionId, label: SECTION_LABELS[sectionId] })),
  { id: "tasks", label: "Трекер задач" },
];

function PrefSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-b-0">
      <div className="w-full min-w-[140px] max-w-[220px] shrink-0 text-sm font-medium text-slate-800">{label}</div>
      <div className="min-w-[200px] flex-1">
        <select
          className="ed-input w-full max-w-md px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function PrefToggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-b-0">
      <div className="w-full min-w-[140px] max-w-[220px] shrink-0 text-sm font-medium text-slate-800">{label}</div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {checked ? "Включено" : "Выключено"}
      </label>
      {hint ? <p className="w-full text-xs text-slate-500 sm:pl-[calc(220px+1rem)]">{hint}</p> : null}
    </div>
  );
}

const SERVICE_SOUND_LABELS: Record<ServiceSoundId, string> = {
  intro: "Интро",
  sending: "Отправка",
  success: "Успех (стандарт)",
  error: "Ошибка (стандарт)",
};

function ServiceSoundPopover({
  value,
  onPick,
}: {
  value: ServiceSoundId | "none";
  onPick: (id: ServiceSoundId | "none") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLUListElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) || t.closest("[data-sound-popover='service']")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const update = () => setAnchorRect(wrapRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const rect = popRef.current?.getBoundingClientRect();
      if (!rect) return;
      scrollDownToFullyReveal(rect, wrapRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [open, anchorRect]);

  const selectedLabel = value === "none" ? "Без звука" : SERVICE_SOUND_LABELS[value];
  return (
    <div className="relative min-w-[200px] flex-1" ref={wrapRef}>
      <button
        type="button"
        className="ed-input flex w-full max-w-md items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{selectedLabel}</span>
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && anchorRect ? createPortal(
        <ul
          ref={popRef}
          data-sound-popover="service"
          className="fixed z-[70000] max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: anchorRect.left, top: anchorRect.bottom + 6, width: anchorRect.width }}
          role="listbox"
        >
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === "none"}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                value === "none" ? "bg-sky-100 font-medium text-sky-900" : "text-slate-800 hover:bg-slate-50",
              ].join(" ")}
              onClick={() => onPick("none")}
            >
              <input type="checkbox" readOnly checked={value === "none"} className="h-4 w-4 rounded border-slate-300" />
              Без звука
            </button>
          </li>
          {SERVICE_SOUND_ID_LIST.map((id) => {
            const selected = id === value;
            return (
              <li key={id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    selected ? "bg-sky-100 font-medium text-sky-900" : "text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => {
                    primeServiceAudioFromUserGesture();
                    onPick(id);
                    systemSounds.play(id);
                  }}
                >
                  <input type="checkbox" readOnly checked={selected} className="h-4 w-4 rounded border-slate-300" />
                  {SERVICE_SOUND_LABELS[id]}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      ) : null}
    </div>
  );
}

const EYE_RING_OFFSETS = [
  { tx: "0px", ty: "-22px" },
  { tx: "20px", ty: "2px" },
  { tx: "-20px", ty: "2px" },
  { tx: "0px", ty: "18px" },
] as const;

function NotificationSoundPopover({
  value,
  onPick,
}: {
  value: NotificationSoundId | "none";
  onPick: (id: NotificationSoundId | "none") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLUListElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) || t.closest("[data-sound-popover='notification']")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const update = () => setAnchorRect(wrapRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const rect = popRef.current?.getBoundingClientRect();
      if (!rect) return;
      scrollDownToFullyReveal(rect, wrapRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [open, anchorRect]);

  const idx = value === "none" ? -1 : NOTIFICATION_SOUND_ID_LIST.indexOf(value);
  const label = value === "none" ? "Без звука" : idx >= 0 ? `Уведомление ${idx + 1}` : value;

  return (
    <div className="relative min-w-[200px] flex-1" ref={wrapRef}>
      <button
        type="button"
        className="ed-input flex w-full max-w-md items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && anchorRect ? createPortal(
        <ul
          ref={popRef}
          data-sound-popover="notification"
          className="fixed z-[70000] max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: anchorRect.left, top: anchorRect.bottom + 6, width: anchorRect.width }}
          role="listbox"
          aria-label="Мелодии уведомлений"
        >
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === "none"}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                value === "none" ? "bg-sky-100 font-medium text-sky-900" : "text-slate-800 hover:bg-slate-50",
              ].join(" ")}
              onClick={() => onPick("none")}
            >
              <input type="checkbox" readOnly checked={value === "none"} className="h-4 w-4 rounded border-slate-300" />
              Без звука
            </button>
          </li>
          {NOTIFICATION_SOUND_ID_LIST.map((id, i) => {
            const selected = id === value;
            return (
              <li key={id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    selected ? "bg-sky-100 font-medium text-sky-900" : "text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => {
                    primeServiceAudioFromUserGesture();
                    onPick(id);
                    playIncomingNotificationSample(id);
                  }}
                >
                  <input type="checkbox" readOnly checked={selected} className="h-4 w-4 rounded border-slate-300" />
                  Уведомление {i + 1}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      ) : null}
    </div>
  );
}

function DefaultAlarmPopover({
  value,
  onPick,
}: {
  value: AlarmSoundId | "none";
  onPick: (id: AlarmSoundId | "none") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLUListElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) || t.closest("[data-sound-popover='alarm']")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const update = () => setAnchorRect(wrapRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const rect = popRef.current?.getBoundingClientRect();
      if (!rect) return;
      scrollDownToFullyReveal(rect, wrapRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [open, anchorRect]);

  const idx = value === "none" ? -1 : ALARM_SOUND_ID_LIST.indexOf(value);
  const label = value === "none" ? "Без звука" : idx >= 0 ? `Сигнал ${idx + 1}` : value;

  return (
    <div className="relative min-w-[200px] flex-1" ref={wrapRef}>
      <button
        type="button"
        className="ed-input flex w-full max-w-md items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{label}</span>
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && anchorRect ? createPortal(
        <ul
          ref={popRef}
          data-sound-popover="alarm"
          className="fixed z-[70000] max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: anchorRect.left, top: anchorRect.bottom + 6, width: anchorRect.width }}
          role="listbox"
          aria-label="Сигналы дедлайна"
        >
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={value === "none"}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                value === "none" ? "bg-sky-100 font-medium text-sky-900" : "text-slate-800 hover:bg-slate-50",
              ].join(" ")}
              onClick={() => {
                onPick("none");
              }}
            >
              <input type="checkbox" readOnly checked={value === "none"} className="h-4 w-4 rounded border-slate-300" />
              Без звука
            </button>
          </li>
          {ALARM_SOUND_ID_LIST.map((id, i) => {
            const selected = id === value;
            return (
              <li key={id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    selected ? "bg-sky-100 font-medium text-sky-900" : "text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => {
                    primeServiceAudioFromUserGesture();
                    onPick(id);
                    systemSounds.play(id);
                  }}
                >
                  <input type="checkbox" readOnly checked={selected} className="h-4 w-4 rounded border-slate-300" />
                  Сигнал {i + 1}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      ) : null}
    </div>
  );
}

export function PersonalizationPage() {
  const { editing, route, togglePreviewViaEye } = usePersonalizationForm();
  const pv = usePersonalizationPreview();
  const { previewEyeButtonRef } = pv;
  const ui = useUiPreferences();
  const [activeCat, setActiveCat] = useState<keyof typeof CAT_IDS>("interface");
  const [syncedSidebarSelected, setSyncedSidebarSelected] = useState<PersonalizationSidebarSectionId | null>(null);
  const [syncedSidebarHovered, setSyncedSidebarHovered] = useState<PersonalizationSidebarSectionId | null>(null);
  const [manualRightPanel, setManualRightPanel] = useState<PersonalizationSidebarSectionId>("main");
  const [eyeCue, setEyeCue] = useState(false);

  const closePreviewRef = useRef(pv.closePreview);
  closePreviewRef.current = pv.closePreview;
  useEffect(() => () => closePreviewRef.current(), []);

  useEffect(() => {
    if (ui.suppressPersonalizationEyeHighlight) return;
    setEyeCue(true);
    const t = window.setTimeout(() => setEyeCue(false), 950);
    return () => window.clearTimeout(t);
    // Один раз за монтирование страницы «Персонализация» (повтор при возврате в раздел).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- намеренно не привязываем к переключателю «Не выделять»
  }, []);

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<PersonalizationSidebarSyncPayload>).detail;
      if (!detail) return;
      if (detail.selected !== undefined) setSyncedSidebarSelected(detail.selected ?? null);
      if (detail.hovered !== undefined) setSyncedSidebarHovered(detail.hovered ?? null);
    };
    window.addEventListener(PERSONALIZATION_SIDEBAR_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PERSONALIZATION_SIDEBAR_SYNC_EVENT, onSync);
  }, []);

  const activeRightPanel = syncedSidebarHovered ?? syncedSidebarSelected ?? manualRightPanel;
  const audioFullyDisabled = !editing.soundAllEnabled || editing.audioGuidanceMode === "none";
  const effectiveShowLoginSplash = !audioFullyDisabled && editing.audioGuidanceMode === "full" ? editing.showLoginSplash : false;
  const effectiveShowLogoutSplash = !audioFullyDisabled && editing.audioGuidanceMode === "full" ? editing.showLogoutSplash : false;
  const effectiveIncomingNotificationSound = audioFullyDisabled ? "none" : editing.incomingNotificationSound;
  const effectiveServiceSuccessSoundId =
    !audioFullyDisabled && editing.audioGuidanceMode === "full" ? editing.serviceSuccessSoundId : "none";
  const effectiveServiceErrorSoundId =
    !audioFullyDisabled && editing.audioGuidanceMode === "full" ? editing.serviceErrorSoundId : "none";
  const effectiveDefaultTrackerAlarmSound =
    audioFullyDisabled ? "none" : editing.defaultTrackerAlarmSound;
  const effectiveSoundOutgoing = audioFullyDisabled ? false : editing.soundOutgoing;
  const effectiveSoundIncoming = audioFullyDisabled ? false : editing.soundIncoming;
  const effectiveSoundServiceSounds = audioFullyDisabled ? false : editing.soundServiceSounds;
  const effectiveSoundTrackerDeadline = audioFullyDisabled ? false : editing.soundTrackerDeadline;
  const effectiveSoundTrackerStatus = audioFullyDisabled ? false : editing.soundTrackerStatus;

  const scrollToCat = (key: keyof typeof CAT_IDS) => {
    setActiveCat(key);
    document.getElementById(CAT_IDS[key])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const r = route;

  const navBtn = (key: keyof typeof CAT_IDS, title: string, desc: string) => (
    <button
      type="button"
      onClick={() => scrollToCat(key)}
      className={[
        "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
        activeCat === key
          ? "border-sky-300 bg-sky-50/90 shadow-[0_6px_18px_rgba(14,165,233,0.12)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80",
      ].join(" ")}
    >
      <span className="block text-sm font-semibold text-slate-900">{title}</span>
      <span className="mt-1 block text-xs leading-snug text-slate-600">{desc}</span>
    </button>
  );

  const rightSidebarContent = (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] lg:shrink-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Категории настроек</div>
        <p className="mt-1 text-xs text-slate-600">Выберите группу, чтобы быстро перейти к нужным параметрам.</p>
        <nav className="mt-3 flex flex-col gap-2" aria-label="Категории персонализации">
          {navBtn("interface", "Интерфейс", "Тема, блоки, кнопки, переходы, сворачивание меню.")}
          {navBtn("notify", "Уведомления и звуки", "Звуки отправки и входящих, всплывающие уведомления, поведение чатов.")}
          {navBtn("florium", "Рабочие пространства Flörium", "Communitoria, Fmail, Rivi: плотность, анимации и поведение элементов.")}
          {navBtn("a11y", "Доступность и фокус", "Уровень движения, подсветка фокуса, подсказки и вспомогательные метки.")}
          {navBtn("security", "Безопасность и приватность", "Предпочтения по защите данных и видимости отдельных элементов.")}
        </nav>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Разделы системы</div>
        <p className="mt-1 text-xs text-slate-600">
          Панели справа повторяют пункты левого меню и задают внешний вид каждого раздела.
        </p>
        <nav className="mt-3 grid grid-cols-1 gap-1.5" aria-label="Панели персонализации по разделам">
          {RIGHT_SIDEBAR_SECTION_ITEMS.map((item) => {
            const isActive = activeRightPanel === item.id;
            const isSync = item.id === syncedSidebarHovered || item.id === syncedSidebarSelected;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setManualRightPanel(item.id)}
                className={[
                  "w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  isActive ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {isSync ? <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">SYNC</span> : null}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Настройки внешнего вида для {RIGHT_SIDEBAR_SECTION_ITEMS.find((item) => item.id === activeRightPanel)?.label}
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Здесь появятся настройки цветов, фона, плотности интерфейса и представления карточек для выбранного раздела.
          </p>
          <div className="mt-3 space-y-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
              Акцентный цвет раздела
              <input type="checkbox" disabled className="h-4 w-4 rounded border-slate-300" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
              Плотность карточек
              <input type="range" min={0} max={100} defaultValue={35} disabled className="w-20 accent-sky-600" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
              Вид карточек и блоков
              <select defaultValue="Стандарт" disabled className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                <option>Стандарт</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        <section className="ed-panel ed-panel-hover p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="ed-caption">Раздел • Персонализация</div>
              <h1 className="ed-h2 mt-1">Персонализация интерфейса</h1>
              <p className="mt-2 text-sm text-slate-600">
                Изменения применяются сразу и сохраняются локально в этом браузере. При открытом окне предпросмотра вы
                сначала увидите пример, а затем сможете решить — сохранить или отменить.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <label
                className="flex cursor-pointer items-start gap-2 rounded-xl border border-transparent px-1 py-0.5 text-left hover:border-slate-200/80 hover:bg-slate-50/80"
                title="Отключить анимацию подсказки на кнопке предпросмотра. Само окно продолжит работать."
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
                  checked={ui.suppressPersonalizationEyeHighlight}
                  onChange={(e) => ui.setSuppressPersonalizationEyeHighlight(e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-800">Не выделять</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                    Отключить анимацию подсказки на кнопке предпросмотра. Само окно продолжит работать.
                  </span>
                </span>
              </label>
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center self-end sm:self-auto">
                {eyeCue
                  ? EYE_RING_OFFSETS.map((ring, i) => (
                      <span
                        key={i}
                        className="ed-personalization-eye-ring pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400/75"
                        style={
                          {
                            "--ed-eye-tx": ring.tx,
                            "--ed-eye-ty": ring.ty,
                            animationDelay: `${i * 65}ms`,
                          } as CSSProperties
                        }
                      />
                    ))
                  : null}
                <button
                  ref={previewEyeButtonRef}
                  type="button"
                  data-dedus-id="personalization.preview"
                  className="ed-btn ed-btn-secondary ed-interactive relative z-[1] px-3 py-2 text-lg leading-none"
                  title="Предпросмотр: открыть или свернуть в кнопку"
                  aria-label="Предпросмотр персонализации"
                onClick={(e) => togglePreviewViaEye({ x: e.clientX, y: e.clientY })}
                >
                  👁
                </button>
              </div>
            </div>
          </div>
        </section>

        <PersonalizationPreviewPanel />

        <section id={CAT_IDS.interface} className="ed-panel ed-panel-hover scroll-mt-4 p-5">
          <h2 className="ed-h3">Интерфейс</h2>
          <p className="mt-1 text-sm text-slate-600">Тема, блоки, кнопки, переходы, меню.</p>
          <div className="mt-2">
            <PrefToggle
              label="Заставка после входа (login)"
              checked={effectiveShowLoginSplash}
              onChange={(v) => r({ showLoginSplash: v })}
              hint="Если выключено — вход открывает рабочий экран без стартовой заставки."
            />
            <PrefToggle
              label="Заставка при выходе (logout)"
              checked={effectiveShowLogoutSplash}
              onChange={(v) => r({ showLogoutSplash: v })}
              hint="Если выключено — выход выполняется сразу, без анимации EDUMED."
            />
            <PrefSelect
              label="Тема"
              value={editing.theme}
              onChange={(v) => r({ theme: v })}
              options={[
                { value: "light", label: "Светлая" },
                { value: "dark", label: "Тёмная" },
                { value: "system", label: "Системная" },
              ]}
            />
            <PrefSelect
              label="Палитра"
              value={editing.themeIntensity}
              onChange={(v) => r({ themeIntensity: v })}
              options={[
                { value: "soft", label: "Мягкая" },
                { value: "contrast", label: "Контрастная" },
              ]}
              hint="Контрастная усиливает границы и различимость текста."
            />
            <PrefSelect
              label="Появление блоков"
              value={editing.blockEnter}
              onChange={(v) => r({ blockEnter: v })}
              options={[
                { value: "none", label: "Без анимации" },
                { value: "fade", label: "Мягкий fade" },
                { value: "fade_shift", label: "Fade + лёгкий сдвиг" },
              ]}
            />
            <PrefSelect
              label="Подсветка блоков (hover)"
              value={editing.blockHover}
              onChange={(v) => r({ blockHover: v })}
              options={[
                { value: "none", label: "Нет" },
                { value: "subtle", label: "Лёгкая" },
                { value: "strong", label: "Выраженная" },
              ]}
            />
            <PrefSelect
              label="Анимация нажатия кнопок"
              value={editing.buttonPress}
              onChange={(v) => r({ buttonPress: v })}
              options={[
                { value: "flat", label: "Плоское нажатие" },
                { value: "lift_scale", label: "Лёгкий подъём / scale" },
                { value: "none", label: "Без анимации" },
              ]}
            />
            <PrefSelect
              label="Подсветка кнопок (hover)"
              value={editing.buttonHover}
              onChange={(v) => r({ buttonHover: v })}
              options={[
                { value: "none", label: "Нет" },
                { value: "color", label: "Только цвет" },
                { value: "shadow_color", label: "Тень + цвет" },
              ]}
            />
            <PrefSelect
              label="Переходы между разделами"
              value={editing.sectionTransition}
              onChange={(v) => r({ sectionTransition: v })}
              options={[
                { value: "instant", label: "Мгновенно" },
                { value: "fade_fast", label: "Быстрый fade" },
                { value: "slide_fade", label: "Slide + fade" },
              ]}
            />
            <PrefSelect
              label="Загрузка (skeleton / спиннер)"
              value={editing.sectionLoading}
              onChange={(v) => r({ sectionLoading: v })}
              options={[
                { value: "skeleton", label: "Skeleton" },
                { value: "spinner", label: "Индикатор (спиннер)" },
                { value: "none", label: "Без прогрузки" },
              ]}
            />
            <PrefSelect
              label="Автосворачивание левого меню"
              value={editing.sidebarAutoCollapse}
              onChange={(v) => r({ sidebarAutoCollapse: v as SidebarAutoCollapse })}
              options={[
                { value: "each_section", label: "Каждый раз при открытии раздела" },
                { value: "idle_timeout", label: "Через время после бездействия" },
                { value: "never", label: "Никогда" },
              ]}
              hint="Управляет тем, как часто боковая панель автоматически сворачивается, чтобы освободить место для контента."
            />
            <p className="py-2 text-xs text-slate-500">
              <strong className="font-medium text-slate-700">Каждый раз при открытии раздела:</strong> после перехода в
              новый раздел панель автоматически сворачивается. Максимум пространства для рабочих экранов. Переключение
              только между модулями Flörium (Communitoria / Fmail / Rivi) панель не сворачивает.
            </p>
            <p className="text-xs text-slate-500">
              <strong className="font-medium text-slate-700">Через время после бездействия:</strong> панель остаётся
              открытой, но автоматически сворачивается через паузу, если вы ей не пользуетесь.
            </p>
            <p className="text-xs text-slate-500">
              <strong className="font-medium text-slate-700">Никогда:</strong> панель сворачивается только вручную.
              Подходит, если вы часто переключаетесь между разделами.
            </p>
            <PrefSelect
              label="Плотность интерфейса"
              value={editing.density}
              onChange={(v) => r({ density: v })}
              options={[
                { value: "compact", label: "Компактный" },
                { value: "normal", label: "Стандартный" },
                { value: "comfortable", label: "Крупный" },
              ]}
            />
          </div>
        </section>

        <section id={CAT_IDS.notify} className="ed-panel ed-panel-hover scroll-mt-4 p-5">
          <h2 className="ed-h3">Уведомления и звуки</h2>
          <p className="mt-1 text-sm text-slate-600">Звуки и всплывающие уведомления.</p>
          <div className="mt-2">
            <PrefToggle
              label="Выключить все звуки"
              checked={!editing.soundAllEnabled}
              onChange={(v) => r({ soundAllEnabled: !v })}
              hint="Мастер-переключатель. Если включен — не проигрывается ни один звук в приложении."
            />
            <PrefSelect
              label="Аудиосопровождение"
              value={editing.audioGuidanceMode}
              onChange={(v) => r({ audioGuidanceMode: v })}
              options={[
                { value: "full", label: "Полное" },
                { value: "partial", label: "Частичное" },
                { value: "none", label: "Отсутствует" },
              ]}
              hint="Полное: все звуки. Частичное: без заставок и success/error. Отсутствует: все звуки выключены."
            />
            <PrefToggle label="Звук отправки сообщения" checked={effectiveSoundOutgoing} onChange={(v) => r({ soundOutgoing: v })} />
            <PrefToggle
              label="Звук входящего сообщения"
              checked={effectiveSoundIncoming}
              onChange={(v) => r({ soundIncoming: v })}
              hint="Короткий сигнал при росте числа непрочитанных в боковом меню (Communitoria)."
            />
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-b-0">
              <div className="w-full min-w-[140px] max-w-[220px] shrink-0 text-sm font-medium text-slate-800">
                Мелодия входящих
              </div>
              <NotificationSoundPopover
                value={effectiveIncomingNotificationSound}
                onPick={(id) => r({ incomingNotificationSound: id })}
              />
              <p className="w-full text-xs text-slate-500 sm:pl-[calc(220px+1rem)]">
                Выберите вариант в списке — звук сразу проиграется. Активный пункт подсвечен. Тот же сигнал звучит при
                новых непрочитанных, если включён «Звук входящего сообщения».
              </p>
            </div>
            <PrefToggle
              label="Сервисные звуки"
              checked={effectiveSoundServiceSounds}
              onChange={(v) => r({ soundServiceSounds: v })}
              hint="Включение воспроизведения; конкретные файлы задаются ниже."
            />
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-b-0">
              <div className="w-full min-w-[140px] max-w-[220px] shrink-0 text-sm font-medium text-slate-800">
                Звук успешного действия
              </div>
              <ServiceSoundPopover
                value={effectiveServiceSuccessSoundId}
                onPick={(id) => r({ serviceSuccessSoundId: id })}
              />
              <p className="w-full text-xs text-slate-500 sm:pl-[calc(220px+1rem)]">
                Используется при успешном сохранении и др.; выбор сразу проигрывается. По умолчанию — success.
              </p>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-b-0">
              <div className="w-full min-w-[140px] max-w-[220px] shrink-0 text-sm font-medium text-slate-800">
                Звук ошибки / неуспешного действия
              </div>
              <ServiceSoundPopover
                value={effectiveServiceErrorSoundId}
                onPick={(id) => r({ serviceErrorSoundId: id })}
              />
              <p className="w-full text-xs text-slate-500 sm:pl-[calc(220px+1rem)]">
                При ошибках сохранения и отказах. По умолчанию — error. Тот же набор файлов, что и выше.
              </p>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Трекер задач</h3>
              <p className="mt-1 text-xs text-slate-500">Настройки раздела «Трекер задач» (/section/tasks).</p>
              <div className="mt-2">
                <PrefToggle
                  label="Звуки дедлайнов трекера"
                  checked={effectiveSoundTrackerDeadline}
                  onChange={(v) => r({ soundTrackerDeadline: v })}
                  hint="Проигрывать сигнал при наступлении дедлайна и напоминаний задач."
                />
                <PrefToggle
                  label="Звуки изменения статуса"
                  checked={effectiveSoundTrackerStatus}
                  onChange={(v) => r({ soundTrackerStatus: v })}
                  hint="Короткий звук при отметке задачи как выполненной или при ошибке сохранения."
                />
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-slate-100 py-3 last:border-b-0">
                  <div className="w-full min-w-[140px] max-w-[220px] shrink-0 text-sm font-medium text-slate-800">
                    Сигнал по умолчанию для дедлайнов
                  </div>
                  <DefaultAlarmPopover
                    value={effectiveDefaultTrackerAlarmSound}
                    onPick={(id) => r({ defaultTrackerAlarmSound: id })}
                  />
                  <p className="w-full text-xs text-slate-500 sm:pl-[calc(220px+1rem)]">
                    Используется для новых задач, если для задачи не выбран свой сигнал. Выбор сразу проигрывается.
                  </p>
                </div>
              </div>
            </div>

            <PrefToggle
              label="Браузерные уведомления (намерение)"
              checked={editing.browserNotifications}
              onChange={(v) => r({ browserNotifications: v })}
              hint="Запрос разрешения браузера будет добавлен при появлении push."
            />
          </div>
        </section>

        <section id={CAT_IDS.florium} className="ed-panel ed-panel-hover scroll-mt-4 p-5">
          <h2 className="ed-h3">Рабочие пространства Flörium</h2>
          <p className="mt-1 text-sm text-slate-600">
            Communitoria, Fmail, Rivi: списки, плотность ленты и всплывающие панели.
          </p>
          <div className="mt-2">
            <PrefSelect
              label="Появление элементов списка"
              value={editing.listAppear}
              onChange={(v) => r({ listAppear: v })}
              options={[
                { value: "none", label: "Нет" },
                { value: "fade_together", label: "Одновременный fade" },
                { value: "stagger", label: "Stagger (по одному)" },
              ]}
            />
            <PrefSelect
              label="Активный чат в списке"
              value={editing.listActive}
              onChange={(v) => r({ listActive: v })}
              options={[
                { value: "border", label: "Рамка" },
                { value: "background", label: "Фон" },
                { value: "icon_only", label: "Только иконка / аватар" },
              ]}
            />
            <PrefSelect
              label="Плотность сообщений"
              value={editing.chatDensity}
              onChange={(v) => r({ chatDensity: v })}
              options={[
                { value: "compact", label: "Плотно" },
                { value: "medium", label: "Средне" },
                { value: "spacious", label: "Просторно" },
              ]}
            />
            <PrefSelect
              label="Анимация отправки сообщения"
              value={editing.chatSendAnimation}
              onChange={(v) => r({ chatSendAnimation: v })}
              options={[
                { value: "fade", label: "Простая (fade)" },
                { value: "bubbles", label: "Пузырьки" },
                { value: "none", label: "Без анимации" },
              ]}
            />
            <PrefSelect
              label="Анимация всплывающих панелей"
              value={editing.popoverAnimation}
              onChange={(v) => r({ popoverAnimation: v })}
              options={[
                { value: "none", label: "Нет" },
                { value: "scale_fade", label: "Scale + fade" },
                { value: "slide_fade", label: "Slide + fade" },
              ]}
            />
          </div>
        </section>

        <section id={CAT_IDS.a11y} className="ed-panel ed-panel-hover scroll-mt-4 p-5">
          <h2 className="ed-h3">Доступность и фокус</h2>
          <p className="mt-1 text-sm text-slate-600">Подсветка фокуса и подсказки.</p>
          <div className="mt-2">
            <PrefSelect
              label="Подсветка фокуса"
              value={editing.focus}
              onChange={(v) => r({ focus: v })}
              options={[
                { value: "strong", label: "Яркий" },
                { value: "normal", label: "Стандартный" },
                { value: "minimal", label: "Минимальный" },
              ]}
            />
            <PrefSelect
              label="Подсказки (базовая поддержка)"
              value={editing.tooltipDisplay}
              onChange={(v) => r({ tooltipDisplay: v })}
              options={[
                { value: "always", label: "Всегда (по возможности)" },
                { value: "hover_only", label: "Только по hover" },
                { value: "never", label: "Никогда" },
              ]}
              hint="Флаг для будущих компонентов; нативные title пока не отключаются полностью."
            />
          </div>
        </section>

        <section id={CAT_IDS.security} className="ed-panel ed-panel-hover scroll-mt-4 p-5">
          <h2 className="ed-h3">Безопасность и приватность</h2>
          <p className="mt-1 text-sm text-slate-600">
            Предпочтения по защите данных и видимости отдельных элементов. Дополнительные переключатели появятся здесь по
            мере развития продукта.
          </p>
          <p className="mt-3 text-sm text-slate-500">Пока нет отдельных локальных настроек в этой категории.</p>
        </section>
      </div>

      <div className="hidden lg:block lg:w-80 lg:shrink-0" aria-hidden />
      <aside className="w-full shrink-0 space-y-3 lg:fixed lg:right-4 lg:top-4 lg:z-40 lg:flex lg:h-[calc(100vh-2rem)] lg:w-80 lg:flex-col lg:gap-3 lg:overflow-hidden lg:space-y-0">
        {rightSidebarContent}
      </aside>
    </div>
  );
}
