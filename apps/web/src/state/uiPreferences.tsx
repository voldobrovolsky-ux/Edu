import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  AlarmSoundId,
  ServiceSoundId,
  BlockEnterAnimation,
  BlockHoverHighlight,
  ButtonHoverHighlight,
  ButtonPressAnimation,
  ChatMessageDensity,
  ChatSendAnimation,
  FullUiPreferences,
  ListActiveHighlight,
  ListAppearAnimation,
  NotificationSoundId,
  PopoverEnterAnimation,
  SectionLoadingStyle,
  SectionTransitionType,
  SidebarAutoCollapse,
  ThemeIntensity,
  TooltipDisplay,
  UiDensity,
  UiFocus,
  UiTheme,
} from "./uiPersonalization";
import { applyPersonalizationToRoot, loadStoredPreferences, persistPreferencesV2 } from "./uiPersonalization";

export type { FullUiPreferences as UiPreferences } from "./uiPersonalization";
export { DEFAULT_UI_PREFERENCES, sectionTransitionMs, personalizationRootClasses } from "./uiPersonalization";

type UiPreferencesContextValue = FullUiPreferences & {
  setTheme: (theme: UiTheme) => void;
  setThemeIntensity: (v: ThemeIntensity) => void;
  setDensity: (density: UiDensity) => void;
  setFocus: (focus: UiFocus) => void;
  setBlockEnter: (v: BlockEnterAnimation) => void;
  setBlockHover: (v: BlockHoverHighlight) => void;
  setButtonPress: (v: ButtonPressAnimation) => void;
  setButtonHover: (v: ButtonHoverHighlight) => void;
  setSectionTransition: (v: SectionTransitionType) => void;
  setSectionLoading: (v: SectionLoadingStyle) => void;
  setListAppear: (v: ListAppearAnimation) => void;
  setListActive: (v: ListActiveHighlight) => void;
  setChatDensity: (v: ChatMessageDensity) => void;
  setChatSendAnimation: (v: ChatSendAnimation) => void;
  setPopoverAnimation: (v: PopoverEnterAnimation) => void;
  setTooltipDisplay: (v: TooltipDisplay) => void;
  setSoundOutgoing: (v: boolean) => void;
  setSoundIncoming: (v: boolean) => void;
  setIncomingNotificationSound: (v: NotificationSoundId | "none") => void;
  setSoundServiceSounds: (v: boolean) => void;
  setServiceSuccessSoundId: (v: ServiceSoundId | "none") => void;
  setServiceErrorSoundId: (v: ServiceSoundId | "none") => void;
  setSoundAllEnabled: (v: boolean) => void;
  setAudioGuidanceMode: (v: "full" | "partial" | "none") => void;
  setBrowserNotifications: (v: boolean) => void;
  setSuppressPersonalizationEyeHighlight: (v: boolean) => void;
  setSidebarAutoCollapse: (v: SidebarAutoCollapse) => void;
  setSoundTrackerDeadline: (v: boolean) => void;
  setSoundTrackerStatus: (v: boolean) => void;
  setDefaultTrackerAlarmSound: (v: AlarmSoundId | "none") => void;
  setShowLoginSplash: (v: boolean) => void;
  setShowLogoutSplash: (v: boolean) => void;
  /** Replace all prefs at once (e.g. preview sandbox). */
  replacePreferences: (next: FullUiPreferences) => void;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<FullUiPreferences>(() => {
    const p = loadStoredPreferences();
    if (typeof document !== "undefined") applyPersonalizationToRoot(p);
    return p;
  });

  useEffect(() => {
    applyPersonalizationToRoot(prefs);
    persistPreferencesV2(prefs);
  }, [prefs]);

  useEffect(() => {
    if (prefs.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPersonalizationToRoot(prefs);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs]);

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      ...prefs,
      setTheme: (theme) => setPrefs((prev) => ({ ...prev, theme })),
      setThemeIntensity: (themeIntensity) => setPrefs((prev) => ({ ...prev, themeIntensity })),
      setDensity: (density) => setPrefs((prev) => ({ ...prev, density })),
      setFocus: (focus) => setPrefs((prev) => ({ ...prev, focus })),
      setBlockEnter: (blockEnter) => setPrefs((prev) => ({ ...prev, blockEnter })),
      setBlockHover: (blockHover) => setPrefs((prev) => ({ ...prev, blockHover })),
      setButtonPress: (buttonPress) => setPrefs((prev) => ({ ...prev, buttonPress })),
      setButtonHover: (buttonHover) => setPrefs((prev) => ({ ...prev, buttonHover })),
      setSectionTransition: (sectionTransition) => setPrefs((prev) => ({ ...prev, sectionTransition })),
      setSectionLoading: (sectionLoading) => setPrefs((prev) => ({ ...prev, sectionLoading })),
      setListAppear: (listAppear) => setPrefs((prev) => ({ ...prev, listAppear })),
      setListActive: (listActive) => setPrefs((prev) => ({ ...prev, listActive })),
      setChatDensity: (chatDensity) => setPrefs((prev) => ({ ...prev, chatDensity })),
      setChatSendAnimation: (chatSendAnimation) => setPrefs((prev) => ({ ...prev, chatSendAnimation })),
      setPopoverAnimation: (popoverAnimation) => setPrefs((prev) => ({ ...prev, popoverAnimation })),
      setTooltipDisplay: (tooltipDisplay) => setPrefs((prev) => ({ ...prev, tooltipDisplay })),
      setSoundOutgoing: (soundOutgoing) => setPrefs((prev) => ({ ...prev, soundOutgoing })),
      setSoundIncoming: (soundIncoming) => setPrefs((prev) => ({ ...prev, soundIncoming })),
      setIncomingNotificationSound: (incomingNotificationSound) =>
        setPrefs((prev) => ({ ...prev, incomingNotificationSound })),
      setSoundServiceSounds: (soundServiceSounds) => setPrefs((prev) => ({ ...prev, soundServiceSounds })),
      setServiceSuccessSoundId: (serviceSuccessSoundId) => setPrefs((prev) => ({ ...prev, serviceSuccessSoundId })),
      setServiceErrorSoundId: (serviceErrorSoundId) => setPrefs((prev) => ({ ...prev, serviceErrorSoundId })),
      setSoundAllEnabled: (soundAllEnabled) => setPrefs((prev) => ({ ...prev, soundAllEnabled })),
      setAudioGuidanceMode: (audioGuidanceMode) => setPrefs((prev) => ({ ...prev, audioGuidanceMode })),
      setBrowserNotifications: (browserNotifications) => setPrefs((prev) => ({ ...prev, browserNotifications })),
      setSuppressPersonalizationEyeHighlight: (suppressPersonalizationEyeHighlight) =>
        setPrefs((prev) => ({ ...prev, suppressPersonalizationEyeHighlight })),
      setSidebarAutoCollapse: (sidebarAutoCollapse) => setPrefs((prev) => ({ ...prev, sidebarAutoCollapse })),
      setSoundTrackerDeadline: (soundTrackerDeadline) => setPrefs((prev) => ({ ...prev, soundTrackerDeadline })),
      setSoundTrackerStatus: (soundTrackerStatus) => setPrefs((prev) => ({ ...prev, soundTrackerStatus })),
      setDefaultTrackerAlarmSound: (defaultTrackerAlarmSound) =>
        setPrefs((prev) => ({ ...prev, defaultTrackerAlarmSound })),
      setShowLoginSplash: (showLoginSplash) => setPrefs((prev) => ({ ...prev, showLoginSplash })),
      setShowLogoutSplash: (showLogoutSplash) => setPrefs((prev) => ({ ...prev, showLogoutSplash })),
      replacePreferences: (next) => setPrefs(next),
    }),
    [prefs],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  return ctx;
}
