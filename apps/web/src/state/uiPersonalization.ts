/** Granular UI personalization (local storage). */

import type { AlarmSoundId, NotificationSoundId, ServiceSoundId } from "../audio/systemSoundConfig";
import { isAlarmSoundId, isNotificationSoundId, isServiceSoundId } from "../audio/systemSoundConfig";

export type { AlarmSoundId, NotificationSoundId, ServiceSoundId } from "../audio/systemSoundConfig";

export type UiTheme = "light" | "dark" | "system";
export type UiDensity = "compact" | "normal" | "comfortable";
export type UiFocus = "strong" | "normal" | "minimal";

export type BlockEnterAnimation = "none" | "fade" | "fade_shift";
export type BlockHoverHighlight = "none" | "subtle" | "strong";

export type ButtonPressAnimation = "flat" | "lift_scale" | "none";
export type ButtonHoverHighlight = "none" | "color" | "shadow_color";

export type SectionTransitionType = "instant" | "fade_fast" | "slide_fade";
export type SectionLoadingStyle = "spinner" | "none" | "skeleton";

export type ListAppearAnimation = "none" | "fade_together" | "stagger";
export type ListActiveHighlight = "border" | "background" | "icon_only";

export type ChatMessageDensity = "compact" | "medium" | "spacious";
export type ChatSendAnimation = "fade" | "bubbles" | "none";

export type PopoverEnterAnimation = "none" | "scale_fade" | "slide_fade";
export type TooltipDisplay = "always" | "hover_only" | "never";

export type ThemeIntensity = "soft" | "contrast";

/** Автосворачивание левого меню EDUMED. */
export type SidebarAutoCollapse = "each_section" | "idle_timeout" | "never";

export type FullUiPreferences = {
  theme: UiTheme;
  themeIntensity: ThemeIntensity;
  density: UiDensity;
  focus: UiFocus;
  sidebarAutoCollapse: SidebarAutoCollapse;
  blockEnter: BlockEnterAnimation;
  blockHover: BlockHoverHighlight;
  buttonPress: ButtonPressAnimation;
  buttonHover: ButtonHoverHighlight;
  sectionTransition: SectionTransitionType;
  sectionLoading: SectionLoadingStyle;
  listAppear: ListAppearAnimation;
  listActive: ListActiveHighlight;
  chatDensity: ChatMessageDensity;
  chatSendAnimation: ChatSendAnimation;
  popoverAnimation: PopoverEnterAnimation;
  tooltipDisplay: TooltipDisplay;
  soundOutgoing: boolean;
  soundIncoming: boolean;
  /** Мелодия входящих (Communitoria и т.п.), файлы Notifications/*. */
  incomingNotificationSound: NotificationSoundId | "none";
  /** Короткие сигналы успех/ошибка и др. (сохранение, сеть). */
  soundServiceSounds: boolean;
  /** Ключ SystemSound из Service для playServiceSound('success'). */
  serviceSuccessSoundId: ServiceSoundId | "none";
  /** Ключ SystemSound из Service для playServiceSound('error'). */
  serviceErrorSoundId: ServiceSoundId | "none";
  /** Мастер-переключатель: полностью выключить/включить все звуки приложения. */
  soundAllEnabled: boolean;
  /** Режим аудиосопровождения: полное, частичное, отсутствует. */
  audioGuidanceMode: "full" | "partial" | "none";
  browserNotifications: boolean;
  /** Не проигрывать анимацию акцента на кнопке предпросмотра при заходе в персонализацию. */
  suppressPersonalizationEyeHighlight: boolean;
  /** Звуки Alarms при напоминаниях и дедлайне задач. */
  soundTrackerDeadline: boolean;
  /** Звуки success/error при смене статуса задач и ошибках сохранения. */
  soundTrackerStatus: boolean;
  /** Сигнал по умолчанию для новых задач без своего alarmSoundId. */
  defaultTrackerAlarmSound: AlarmSoundId | "none";
  /** Показывать заставку после входа. */
  showLoginSplash: boolean;
  /** Показывать анимацию/заставку при выходе. */
  showLogoutSplash: boolean;
};

export const DEFAULT_UI_PREFERENCES: FullUiPreferences = {
  theme: "system",
  themeIntensity: "soft",
  density: "normal",
  focus: "normal",
  sidebarAutoCollapse: "each_section",
  blockEnter: "fade",
  blockHover: "subtle",
  buttonPress: "flat",
  buttonHover: "color",
  sectionTransition: "fade_fast",
  sectionLoading: "skeleton",
  listAppear: "stagger",
  listActive: "background",
  chatDensity: "medium",
  chatSendAnimation: "bubbles",
  popoverAnimation: "scale_fade",
  tooltipDisplay: "hover_only",
  soundOutgoing: true,
  soundIncoming: true,
  incomingNotificationSound: "notification1",
  soundServiceSounds: true,
  serviceSuccessSoundId: "success",
  serviceErrorSoundId: "error",
  soundAllEnabled: true,
  audioGuidanceMode: "full",
  browserNotifications: true,
  suppressPersonalizationEyeHighlight: false,
  soundTrackerDeadline: true,
  soundTrackerStatus: true,
  defaultTrackerAlarmSound: "alarm1",
  showLoginSplash: true,
  showLogoutSplash: true,
};

/** Legacy v1 storage (motion tri-state). */
export type LegacyUiMotion = "active" | "medium" | "passive";

export type LegacyUiPreferencesV1 = {
  theme?: UiTheme;
  motion?: LegacyUiMotion;
  density?: UiDensity;
  focus?: UiFocus;
};

function migrateFromMotion(motion: LegacyUiMotion): Partial<FullUiPreferences> {
  if (motion === "passive") {
    return {
      blockEnter: "none",
      blockHover: "none",
      buttonPress: "none",
      buttonHover: "none",
      sectionTransition: "instant",
      sectionLoading: "none",
      listAppear: "none",
      chatSendAnimation: "none",
      popoverAnimation: "none",
    };
  }
  if (motion === "medium") {
    return {
      blockEnter: "fade",
      blockHover: "subtle",
      buttonPress: "flat",
      buttonHover: "color",
      sectionTransition: "fade_fast",
      sectionLoading: "skeleton",
      listAppear: "fade_together",
      chatSendAnimation: "fade",
      popoverAnimation: "scale_fade",
    };
  }
  return {
    blockEnter: "fade_shift",
    blockHover: "strong",
    buttonPress: "lift_scale",
    buttonHover: "shadow_color",
    sectionTransition: "slide_fade",
    sectionLoading: "skeleton",
    listAppear: "stagger",
    chatSendAnimation: "bubbles",
    popoverAnimation: "slide_fade",
  };
}

const STORAGE_V1 = "edumed.ui.preferences.v1";
const STORAGE_V2 = "edumed.ui.preferences.v2";

export function loadStoredPreferences(): FullUiPreferences {
  try {
    const raw2 = localStorage.getItem(STORAGE_V2);
    if (raw2) {
      const parsed = JSON.parse(raw2) as Partial<FullUiPreferences>;
      return normalizePreferences({ ...DEFAULT_UI_PREFERENCES, ...parsed });
    }
    const raw1 = localStorage.getItem(STORAGE_V1);
    if (raw1) {
      const parsed = JSON.parse(raw1) as LegacyUiPreferencesV1;
      const base: FullUiPreferences = { ...DEFAULT_UI_PREFERENCES };
      if (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system") {
        base.theme = parsed.theme;
      }
      if (parsed.density === "compact" || parsed.density === "normal" || parsed.density === "comfortable") {
        base.density = parsed.density;
      }
      if (parsed.focus === "strong" || parsed.focus === "normal" || parsed.focus === "minimal") {
        base.focus = parsed.focus;
      }
      if (parsed.motion === "active" || parsed.motion === "medium" || parsed.motion === "passive") {
        Object.assign(base, migrateFromMotion(parsed.motion));
      }
      return normalizePreferences(base);
    }
  } catch {
    // fall through
  }
  return { ...DEFAULT_UI_PREFERENCES };
}

export function persistPreferencesV2(pref: FullUiPreferences) {
  try {
    localStorage.setItem(STORAGE_V2, JSON.stringify(pref));
  } catch {
    // ignore
  }
}

function normalizePreferences(p: FullUiPreferences): FullUiPreferences {
  const o = { ...DEFAULT_UI_PREFERENCES, ...p };
  return {
    theme: o.theme === "light" || o.theme === "dark" || o.theme === "system" ? o.theme : DEFAULT_UI_PREFERENCES.theme,
    themeIntensity: o.themeIntensity === "contrast" ? "contrast" : "soft",
    density:
      o.density === "compact" || o.density === "normal" || o.density === "comfortable"
        ? o.density
        : DEFAULT_UI_PREFERENCES.density,
    focus:
      o.focus === "strong" || o.focus === "normal" || o.focus === "minimal"
        ? o.focus
        : DEFAULT_UI_PREFERENCES.focus,
    blockEnter:
      o.blockEnter === "none" || o.blockEnter === "fade" || o.blockEnter === "fade_shift"
        ? o.blockEnter
        : DEFAULT_UI_PREFERENCES.blockEnter,
    blockHover:
      o.blockHover === "none" || o.blockHover === "subtle" || o.blockHover === "strong"
        ? o.blockHover
        : DEFAULT_UI_PREFERENCES.blockHover,
    buttonPress:
      o.buttonPress === "flat" || o.buttonPress === "lift_scale" || o.buttonPress === "none"
        ? o.buttonPress
        : DEFAULT_UI_PREFERENCES.buttonPress,
    buttonHover:
      o.buttonHover === "none" || o.buttonHover === "color" || o.buttonHover === "shadow_color"
        ? o.buttonHover
        : DEFAULT_UI_PREFERENCES.buttonHover,
    sectionTransition:
      o.sectionTransition === "instant" || o.sectionTransition === "fade_fast" || o.sectionTransition === "slide_fade"
        ? o.sectionTransition
        : DEFAULT_UI_PREFERENCES.sectionTransition,
    sectionLoading:
      o.sectionLoading === "spinner" || o.sectionLoading === "none" || o.sectionLoading === "skeleton"
        ? o.sectionLoading
        : DEFAULT_UI_PREFERENCES.sectionLoading,
    listAppear:
      o.listAppear === "none" || o.listAppear === "fade_together" || o.listAppear === "stagger"
        ? o.listAppear
        : DEFAULT_UI_PREFERENCES.listAppear,
    listActive:
      o.listActive === "border" || o.listActive === "background" || o.listActive === "icon_only"
        ? o.listActive
        : DEFAULT_UI_PREFERENCES.listActive,
    chatDensity:
      o.chatDensity === "compact" || o.chatDensity === "medium" || o.chatDensity === "spacious"
        ? o.chatDensity
        : DEFAULT_UI_PREFERENCES.chatDensity,
    chatSendAnimation:
      o.chatSendAnimation === "fade" || o.chatSendAnimation === "bubbles" || o.chatSendAnimation === "none"
        ? o.chatSendAnimation
        : DEFAULT_UI_PREFERENCES.chatSendAnimation,
    popoverAnimation:
      o.popoverAnimation === "none" || o.popoverAnimation === "scale_fade" || o.popoverAnimation === "slide_fade"
        ? o.popoverAnimation
        : DEFAULT_UI_PREFERENCES.popoverAnimation,
    tooltipDisplay:
      o.tooltipDisplay === "always" || o.tooltipDisplay === "hover_only" || o.tooltipDisplay === "never"
        ? o.tooltipDisplay
        : DEFAULT_UI_PREFERENCES.tooltipDisplay,
    soundOutgoing: Boolean(o.soundOutgoing),
    soundIncoming: Boolean(o.soundIncoming),
    incomingNotificationSound:
      o.incomingNotificationSound === "none" || (o.incomingNotificationSound && isNotificationSoundId(o.incomingNotificationSound))
        ? o.incomingNotificationSound
        : DEFAULT_UI_PREFERENCES.incomingNotificationSound,
    soundServiceSounds: o.soundServiceSounds !== false,
    serviceSuccessSoundId:
      o.serviceSuccessSoundId === "none" || (o.serviceSuccessSoundId && isServiceSoundId(o.serviceSuccessSoundId))
        ? o.serviceSuccessSoundId
        : DEFAULT_UI_PREFERENCES.serviceSuccessSoundId,
    serviceErrorSoundId:
      o.serviceErrorSoundId === "none" || (o.serviceErrorSoundId && isServiceSoundId(o.serviceErrorSoundId))
        ? o.serviceErrorSoundId
        : DEFAULT_UI_PREFERENCES.serviceErrorSoundId,
    soundAllEnabled: o.soundAllEnabled !== false,
    audioGuidanceMode:
      o.audioGuidanceMode === "full" || o.audioGuidanceMode === "partial" || o.audioGuidanceMode === "none"
        ? o.audioGuidanceMode
        : DEFAULT_UI_PREFERENCES.audioGuidanceMode,
    browserNotifications: Boolean(o.browserNotifications),
    suppressPersonalizationEyeHighlight: Boolean(o.suppressPersonalizationEyeHighlight),
    soundTrackerDeadline: o.soundTrackerDeadline !== false,
    soundTrackerStatus: o.soundTrackerStatus !== false,
    defaultTrackerAlarmSound:
      o.defaultTrackerAlarmSound === "none" || (o.defaultTrackerAlarmSound && isAlarmSoundId(o.defaultTrackerAlarmSound))
        ? o.defaultTrackerAlarmSound
        : DEFAULT_UI_PREFERENCES.defaultTrackerAlarmSound,
    showLoginSplash: o.showLoginSplash !== false,
    showLogoutSplash: o.showLogoutSplash !== false,
    sidebarAutoCollapse:
      o.sidebarAutoCollapse === "each_section" ||
      o.sidebarAutoCollapse === "idle_timeout" ||
      o.sidebarAutoCollapse === "never"
        ? o.sidebarAutoCollapse
        : DEFAULT_UI_PREFERENCES.sidebarAutoCollapse,
  };
}

/** CSS classes applied on `document.documentElement` for global styling. */
export function personalizationRootClasses(pref: FullUiPreferences): string[] {
  return [
    `ed-theme-${pref.theme}`,
    pref.themeIntensity === "contrast" ? "ed-theme-intensity-contrast" : "ed-theme-intensity-soft",
    `ed-density-${pref.density}`,
    `ed-focus-${pref.focus}`,
    `ed-blocks-enter-${pref.blockEnter}`,
    `ed-blocks-hover-${pref.blockHover}`,
    `ed-btn-press-${pref.buttonPress}`,
    `ed-btn-hover-${pref.buttonHover}`,
    `ed-section-tx-${pref.sectionTransition}`,
    `ed-section-load-${pref.sectionLoading}`,
    `ed-list-appear-${pref.listAppear}`,
    `ed-list-active-${pref.listActive}`,
    `ed-chat-density-${pref.chatDensity}`,
    `ed-chat-send-${pref.chatSendAnimation}`,
    `ed-popover-${pref.popoverAnimation}`,
    `ed-tooltips-${pref.tooltipDisplay}`,
  ];
}

export function applyPersonalizationToRoot(pref: FullUiPreferences) {
  const root = document.documentElement;
  root.style.setProperty("--ed-route-ms", `${sectionTransitionMs(pref)}ms`);
  const keep = new Set(["edumed-font-large", "dark"]);
  const toRemove: string[] = [];
  root.classList.forEach((c) => {
    if (
      c.startsWith("ed-theme-") ||
      c.startsWith("ed-density-") ||
      c.startsWith("ed-focus-") ||
      c.startsWith("ed-blocks-") ||
      c.startsWith("ed-btn-") ||
      c.startsWith("ed-section-") ||
      c.startsWith("ed-list-") ||
      c.startsWith("ed-chat-") ||
      c.startsWith("ed-popover-") ||
      c.startsWith("ed-tooltips-") ||
      c.startsWith("ed-motion-")
    ) {
      if (!keep.has(c)) toRemove.push(c);
    }
  });
  for (const c of toRemove) root.classList.remove(c);
  for (const c of personalizationRootClasses(pref)) root.classList.add(c);

  root.dataset.edSoundOutgoing = pref.soundOutgoing ? "1" : "0";
  root.dataset.edSoundIncoming = pref.soundIncoming ? "1" : "0";
  root.dataset.edSoundService = pref.soundServiceSounds ? "1" : "0";
  root.dataset.edServiceSuccessSound = pref.serviceSuccessSoundId;
  root.dataset.edServiceErrorSound = pref.serviceErrorSoundId;
  root.dataset.edIncomingNotifSound = pref.incomingNotificationSound;
  root.dataset.edSoundAllEnabled = pref.soundAllEnabled ? "1" : "0";
  root.dataset.edAudioGuidanceMode = pref.audioGuidanceMode;
  root.dataset.edBrowserNotify = pref.browserNotifications ? "1" : "0";
  root.dataset.edSoundTrackerDeadline = pref.soundTrackerDeadline ? "1" : "0";
  root.dataset.edSoundTrackerStatus = pref.soundTrackerStatus ? "1" : "0";
  root.dataset.edDefaultTrackerAlarm = pref.defaultTrackerAlarmSound;
  root.dataset.edShowLoginSplash = pref.showLoginSplash ? "1" : "0";
  root.dataset.edShowLogoutSplash = pref.showLogoutSplash ? "1" : "0";

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedDark = pref.theme === "dark" || (pref.theme === "system" && prefersDark);
  root.classList.toggle("dark", resolvedDark);
}

/** CSS-переменные для сэндбокса превью (те же тайминги, что у `applyPersonalizationToRoot`, без записи в `<html>`). */
export function personalizationSandboxCssVars(pref: FullUiPreferences): Record<string, string> {
  return { "--ed-route-ms": `${sectionTransitionMs(pref)}ms` };
}

export function sectionTransitionMs(pref: FullUiPreferences): number {
  switch (pref.sectionTransition) {
    case "instant":
      return 0;
    case "fade_fast":
      return 180;
    case "slide_fade":
      return 300;
    default:
      return 180;
  }
}
