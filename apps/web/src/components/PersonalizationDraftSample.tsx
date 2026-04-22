import { useEffect, useState, type CSSProperties } from "react";
import type { FullUiPreferences } from "../state/uiPersonalization";
import {
  personalizationRootClasses,
  personalizationSandboxCssVars,
} from "../state/uiPersonalization";

export type PersonalizationDemoPhase = "idle" | "exit" | "enter" | "hover" | "press";

function routeEnterClass(tx: FullUiPreferences["sectionTransition"]): string {
  switch (tx) {
    case "instant":
      return "";
    case "fade_fast":
      return "ed-route-enter-fade";
    case "slide_fade":
      return "ed-route-enter-slide";
    default:
      return "ed-route-enter-fade";
  }
}

const NON_VISUAL: (keyof FullUiPreferences)[] = [
  "soundOutgoing",
  "soundIncoming",
  "incomingNotificationSound",
  "soundServiceSounds",
  "serviceSuccessSoundId",
  "serviceErrorSoundId",
  "soundAllEnabled",
  "audioGuidanceMode",
  "soundTrackerDeadline",
  "soundTrackerStatus",
  "defaultTrackerAlarmSound",
  "showLoginSplash",
  "showLogoutSplash",
  "browserNotifications",
  "suppressPersonalizationEyeHighlight",
  "sidebarAutoCollapse",
];

function pickFocus(
  explicit: keyof FullUiPreferences | null,
  draft: FullUiPreferences,
  baseline: FullUiPreferences,
): keyof FullUiPreferences | null {
  if (explicit && !NON_VISUAL.includes(explicit)) return explicit;
  const keys = Object.keys(draft) as (keyof FullUiPreferences)[];
  for (const k of keys) {
    if (NON_VISUAL.includes(k)) continue;
    if (draft[k] !== baseline[k]) return k;
  }
  return null;
}

function focusCopy(key: keyof FullUiPreferences | null): { title: string; subtitle: string } {
  if (!key || NON_VISUAL.includes(key)) {
    return {
      title: "Новые настройки",
      subtitle:
        "Фрагмент интерфейса с теми же классами, что применяются к приложению после сохранения (без изменения <html>).",
    };
  }
  const map: Partial<Record<keyof FullUiPreferences, { title: string; subtitle: string }>> = {
    theme: { title: "Тема", subtitle: "Фон и палитра текста в блоках превью." },
    themeIntensity: { title: "Палитра", subtitle: "Мягкая или контрастная интенсивность темы." },
    density: { title: "Плотность", subtitle: "Отступы и размеры элементов (ed-density-*)." },
    focus: { title: "Фокус", subtitle: "Подсветка фокуса клавиатуры (ed-focus-*)." },
    blockEnter: { title: "Появление блоков", subtitle: "Анимация появления панелей (ed-blocks-enter-*)." },
    blockHover: { title: "Hover блоков", subtitle: "Подсветка панелей при наведении (ed-blocks-hover-*)." },
    buttonPress: { title: "Нажатие кнопок", subtitle: "Микроанимация нажатия (ed-btn-press-*)." },
    buttonHover: { title: "Hover кнопок", subtitle: "Подсветка кнопок (ed-btn-hover-*)." },
    sectionTransition: {
      title: "Переходы разделов",
      subtitle: "Длительность и тип входа (ed-section-tx-* + --ed-route-ms).",
    },
    sectionLoading: { title: "Загрузка", subtitle: "Skeleton, спиннер или без индикатора (ed-section-load-*)." },
    listAppear: { title: "Списки", subtitle: "Появление строк списка (ed-list-appear-*)." },
    listActive: { title: "Активный элемент", subtitle: "Выделение активной строки (ed-list-active-*)." },
    chatDensity: { title: "Лента сообщений", subtitle: "Плотность сообщений (ed-chat-density-*)." },
    chatSendAnimation: { title: "Отправка", subtitle: "Анимация ухода сообщения (ed-chat-send-*)." },
    popoverAnimation: { title: "Всплывающие панели", subtitle: "Появление popover (ed-popover-*)." },
    tooltipDisplay: { title: "Подсказки", subtitle: "Режим подсказок (ed-tooltips-*)." },
  };
  return (
    map[key] ?? {
      title: "Новые настройки",
      subtitle: "Параметр применён в этом сэндбоксе так же, как будет на всём интерфейсе.",
    }
  );
}

function renderFocusedBody({
  focus,
  draft,
  phase,
  demoNonce,
  panelMotion,
  btnMotion,
  enterCls,
}: {
  focus: keyof FullUiPreferences | null;
  draft: FullUiPreferences;
  phase: PersonalizationDemoPhase;
  demoNonce: number;
  panelMotion: string;
  btnMotion: string;
  enterCls: string;
}) {
  const key = `${demoNonce}-${phase}`;

  if (!focus || NON_VISUAL.includes(focus)) {
    return (
      <div className={`ed-preview-sample-panel ed-panel-hover space-y-2 ${panelMotion}`}>
        <div className="text-xs font-medium text-[var(--ed-text)]">Блок</div>
        <p className="text-[11px] text-[var(--ed-text-muted)]">Панель и кнопка с актуальными классами персонализации.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className={`ed-preview-sample-btn transition-all duration-200 ease-out ${btnMotion}`}>
            Кнопка
          </button>
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800">
            список
          </span>
        </div>
      </div>
    );
  }

  if (focus === "sectionTransition") {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-[var(--ed-text-muted)]">Имитация входа экрана (классы маршрута):</p>
        <div
          key={key}
          className={[
            "rounded-lg border border-slate-200/80 bg-[var(--ed-surface)] px-3 py-4 text-xs text-[var(--ed-text)]",
            enterCls,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Содержимое раздела
        </div>
      </div>
    );
  }

  if (focus === "sectionLoading") {
    if (draft.sectionLoading === "skeleton") {
      return (
        <div className="space-y-2">
          <div className="h-3 w-3/4 max-w-[200px] animate-pulse rounded bg-slate-200/80" />
          <div className="h-16 max-w-full animate-pulse rounded-lg bg-slate-200/60" />
          <div className="h-3 w-1/2 max-w-[120px] animate-pulse rounded bg-slate-200/80" />
        </div>
      );
    }
    if (draft.sectionLoading === "spinner") {
      return (
        <div className="flex items-center gap-2 text-[11px] text-[var(--ed-text-muted)]">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          Загрузка…
        </div>
      );
    }
    return <p className="text-[11px] text-[var(--ed-text-muted)]">Без индикатора загрузки.</p>;
  }

  if (focus === "listAppear" || focus === "listActive") {
    const rowEnter = draft.listAppear === "none" ? "" : "communitoria-chat-row-enter";
    const activeRow =
      draft.listActive === "border"
        ? "border-sky-500 bg-white shadow-md ring-2 ring-sky-100"
        : draft.listActive === "background"
          ? "border-sky-300 bg-sky-50 shadow-[0_6px_20px_rgba(14,165,233,0.12)] ring-1 ring-sky-200/60"
          : draft.listActive === "icon_only"
            ? "border-slate-100 bg-white shadow-sm"
            : "border-sky-300 bg-sky-50 shadow-[0_6px_20px_rgba(14,165,233,0.12)] ring-1 ring-sky-200/60";
    return (
      <ul className="communitoria-chat-list-mount flex flex-col gap-1.5 rounded-lg border border-slate-200/60 p-2">
        {["Активный чат", "Второй", "Третий"].map((label, i) => (
          <li
            key={label}
            className={`${rowEnter} list-none`}
            style={{
              animationDelay: draft.listAppear === "stagger" ? `${Math.min(i, 12) * 38}ms` : "0ms",
            }}
          >
            <div
              className={[
                "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] text-[var(--ed-text)] shadow-sm",
                i === 0 ? activeRow : "border-slate-100 bg-white",
              ].join(" ")}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs">
                {i === 0 && draft.listActive === "icon_only" ? "★" : "•"}
              </span>
              <span className="min-w-0 truncate">{label}</span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (focus === "chatDensity" || focus === "chatSendAnimation") {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200/60 p-2">
        <div className="rounded-lg bg-sky-100/80 px-2 py-1 text-[10px] text-sky-900">Входящее сообщение</div>
        <div
          className={[
            "ml-6 rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-800",
            phase === "exit" ? "opacity-40" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Исходящее (ed-chat-send / density)
        </div>
      </div>
    );
  }

  if (focus === "popoverAnimation") {
    return (
      <div className="relative min-h-[72px] rounded-lg border border-dashed border-slate-300/80 p-2">
        <div className="text-[10px] text-[var(--ed-text-muted)]">Область экрана</div>
        <div className="communitoria-emoji-popover-mount mt-2 inline-block rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] shadow-md">
          Всплывающая панель
        </div>
      </div>
    );
  }

  if (focus === "tooltipDisplay") {
    return (
      <div className="rounded-lg border border-slate-200/60 p-3 text-[11px] text-[var(--ed-text)]">
        Элемент с подсказкой{" "}
        <span className="cursor-default border-b border-dotted border-slate-400" title="Пример title / tooltip">
          (наведите)
        </span>
      </div>
    );
  }

  if (focus === "theme" || focus === "themeIntensity" || focus === "density") {
    return (
      <div className={`ed-preview-sample-panel ed-panel-hover space-y-2 ${panelMotion}`}>
        <div className="text-xs font-medium text-[var(--ed-text)]">Панель в выбранной теме и плотности</div>
        <p className="text-[11px] text-[var(--ed-text-muted)]">Классы ed-theme-* и ed-density-* применены к этому блоку.</p>
        <button type="button" className={`ed-preview-sample-btn ${btnMotion}`}>
          Кнопка
        </button>
      </div>
    );
  }

  if (focus === "focus") {
    return (
      <div className="rounded-lg border border-slate-200/60 p-2">
        <button type="button" className="ed-preview-sample-btn text-[11px] outline-none ring-offset-2">
          Сфокусируйте Tab →
        </button>
      </div>
    );
  }

  if (focus === "blockEnter" || focus === "blockHover") {
    return (
      <div className={`ed-preview-sample-panel ed-panel-hover min-h-[80px] space-y-2 ${panelMotion}`}>
        <div className="text-xs font-medium text-[var(--ed-text)]">Панель</div>
        <p className="text-[11px] text-[var(--ed-text-muted)]">ed-blocks-enter / ed-blocks-hover</p>
      </div>
    );
  }

  if (focus === "buttonPress" || focus === "buttonHover") {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className={`ed-preview-sample-btn transition-all duration-200 ease-out ${btnMotion}`}>
          Основная
        </button>
        <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700">
          Вторичная
        </button>
      </div>
    );
  }

  return (
    <div className={`ed-preview-sample-panel ed-panel-hover space-y-2 ${panelMotion}`}>
      <div className="text-xs font-medium text-[var(--ed-text)]">Блок</div>
      <p className="text-[11px] text-[var(--ed-text-muted)]">Общий фрагмент с полным набором классов сэндбокса.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className={`ed-preview-sample-btn transition-all duration-200 ease-out ${btnMotion}`}>
          Кнопка
        </button>
      </div>
    </div>
  );
}

export function PersonalizationDraftSample({
  draft,
  baseline,
  phase,
  demoNonce,
  focusField,
}: {
  draft: FullUiPreferences;
  baseline: FullUiPreferences;
  phase: PersonalizationDemoPhase;
  demoNonce: number;
  focusField: keyof FullUiPreferences | null;
}) {
  const classes = personalizationRootClasses(draft);
  const cssVars = personalizationSandboxCssVars(draft) as CSSProperties;
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const dark = draft.theme === "dark" || (draft.theme === "system" && systemDark);
  const focus = pickFocus(focusField, draft, baseline);
  const { title, subtitle } = focusCopy(focus);

  const panelMotion =
    phase === "exit"
      ? "opacity-0 translate-x-3 scale-[0.98]"
      : phase === "enter"
        ? "opacity-100 translate-x-0 scale-100"
        : "opacity-100 translate-x-0 scale-100";

  const btnMotion =
    phase === "hover"
      ? "ring-2 ring-sky-400/80 scale-105 shadow-md"
      : phase === "press"
        ? "scale-95"
        : "";

  const enterCls = routeEnterClass(draft.sectionTransition);

  return (
    <div
      className={`ed-personalization-preview-sandbox flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 rounded-lg border border-slate-200/80 p-3 ${dark ? "dark" : ""} ${classes.join(" ")}`}
      style={cssVars}
    >
      <div className="shrink-0 text-xs font-semibold text-[var(--ed-text)]">{title}</div>
      <p className="shrink-0 text-[10px] leading-snug text-[var(--ed-text-muted)]">{subtitle}</p>
      <div className="min-h-0 flex-1 overflow-auto">
        {focus && NON_VISUAL.includes(focus) ? (
          <p className="mb-2 text-[11px] text-[var(--ed-text-muted)]">
            Этот параметр не меняет внешний вид экрана; ниже — общий фрагмент интерфейса.
          </p>
        ) : null}
        {renderFocusedBody({
          focus,
          draft,
          phase,
          demoNonce,
          panelMotion,
          btnMotion,
          enterCls,
        })}
      </div>
    </div>
  );
}
