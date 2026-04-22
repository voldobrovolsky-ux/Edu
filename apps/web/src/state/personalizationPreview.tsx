import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  playServiceSound,
  primeServiceAudioFromUserGesture,
  primeServiceAudioFromUserGestureAsync,
} from "../audio/systemSounds";
import type { FullUiPreferences } from "./uiPersonalization";
import { useUiPreferences } from "./uiPreferences";

function clonePrefs(p: FullUiPreferences): FullUiPreferences {
  return { ...p };
}

function prefsEqual(a: FullUiPreferences, b: FullUiPreferences): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type PersonalizationPreviewContextValue = {
  isOpen: boolean;
  /** Окно предпросмотра раскрыто (были/стали и кнопки), а орб только следует за курсором. */
  windowOpen: boolean;
  baseline: FullUiPreferences | null;
  draft: FullUiPreferences | null;
  /** Увеличивается при изменении draft — перезапуск демо в превью. */
  demoNonce: number;
  isDirty: boolean;
  /** Последний затронутый ключ настроек — для фокуса превью «Стало». */
  previewFocusField: keyof FullUiPreferences | null;
  /** Ref на кнопку «глаз» — анимация раскрытия/сворачивания предпросмотра. */
  previewEyeButtonRef: MutableRefObject<HTMLButtonElement | null>;
  /** Последняя позиция курсора в момент нажатия на верхний глаз. */
  lastEyeCursorClient: { x: number; y: number } | null;
  /** Увеличивается при открытии превью кликом по глазу и при сворачивании окна в орб — чтобы орб сразу встал в точку клика. */
  personalizationEyeSeq: number;
  /** Панель сворачивается в орб. */
  wantsMorphClose: boolean;
  requestMorphClose: () => void;
  /** Глаз: открыть сессию предпросмотра (без отдельного «орба»). */
  togglePreviewViaEye: (cursorClient?: { x: number; y: number }) => void;
  /** Полностью выключить режим превью (орб исчезает). */
  closePreview: () => void;
  /** Завершить морф-сворачивание к орбу (не завершает сессию). */
  completeMorphRetractToOrb: () => void;
  updateDraft: (patch: Partial<FullUiPreferences>) => void;
  saveDraft: () => Promise<boolean>;
  cancelDraft: () => void;
};

const PersonalizationPreviewContext = createContext<PersonalizationPreviewContextValue | null>(null);

function snapshotFromCtx(ctx: ReturnType<typeof useUiPreferences>): FullUiPreferences {
  return {
    theme: ctx.theme,
    themeIntensity: ctx.themeIntensity,
    density: ctx.density,
    focus: ctx.focus,
    blockEnter: ctx.blockEnter,
    blockHover: ctx.blockHover,
    buttonPress: ctx.buttonPress,
    buttonHover: ctx.buttonHover,
    sectionTransition: ctx.sectionTransition,
    sectionLoading: ctx.sectionLoading,
    listAppear: ctx.listAppear,
    listActive: ctx.listActive,
    chatDensity: ctx.chatDensity,
    chatSendAnimation: ctx.chatSendAnimation,
    popoverAnimation: ctx.popoverAnimation,
    tooltipDisplay: ctx.tooltipDisplay,
    soundOutgoing: ctx.soundOutgoing,
    soundIncoming: ctx.soundIncoming,
    soundServiceSounds: ctx.soundServiceSounds,
    serviceSuccessSoundId: ctx.serviceSuccessSoundId,
    serviceErrorSoundId: ctx.serviceErrorSoundId,
    soundAllEnabled: ctx.soundAllEnabled,
    audioGuidanceMode: ctx.audioGuidanceMode,
    incomingNotificationSound: ctx.incomingNotificationSound,
    soundTrackerDeadline: ctx.soundTrackerDeadline,
    soundTrackerStatus: ctx.soundTrackerStatus,
    defaultTrackerAlarmSound: ctx.defaultTrackerAlarmSound,
    showLoginSplash: ctx.showLoginSplash,
    showLogoutSplash: ctx.showLogoutSplash,
    browserNotifications: ctx.browserNotifications,
    suppressPersonalizationEyeHighlight: ctx.suppressPersonalizationEyeHighlight,
    sidebarAutoCollapse: ctx.sidebarAutoCollapse,
  };
}

export function PersonalizationPreviewProvider({ children }: { children: ReactNode }) {
  const committed = useUiPreferences();
  const committedRef = useRef(committed);
  useEffect(() => {
    committedRef.current = committed;
  }, [committed]);

  const [isOpen, setIsOpen] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);
  const [baseline, setBaseline] = useState<FullUiPreferences | null>(null);
  const [draft, setDraft] = useState<FullUiPreferences | null>(null);
  const [demoNonce, setDemoNonce] = useState(0);
  const [previewFocusField, setPreviewFocusField] = useState<keyof FullUiPreferences | null>(null);
  const [wantsMorphClose, setWantsMorphClose] = useState(false);
  const [lastEyeCursorClient, setLastEyeCursorClient] = useState<{ x: number; y: number } | null>(null);
  const [personalizationEyeSeq, setPersonalizationEyeSeq] = useState(0);
  const previewEyeButtonRef = useRef<HTMLButtonElement | null>(null);

  const requestMorphClose = useCallback(() => {
    setWindowOpen(false);
    setWantsMorphClose(true);
  }, []);

  const completeMorphRetractToOrb = useCallback(() => {
    setWantsMorphClose(false);
    setPreviewFocusField(null);
  }, []);

  const isDirty = Boolean(baseline && draft && !prefsEqual(baseline, draft));

  const togglePreviewViaEye = useCallback(
    (cursorClient?: { x: number; y: number }) => {
    primeServiceAudioFromUserGesture();
    setPreviewFocusField(null);
    setLastEyeCursorClient(cursorClient ?? null);
    if (!isOpen) {
      const snap = snapshotFromCtx(committedRef.current);
      setBaseline(snap);
      setDraft(clonePrefs(snap));
      setDemoNonce((n) => n + 1);
      setWantsMorphClose(false);
      setWindowOpen(false);
      setPersonalizationEyeSeq((n) => n + 1);
      setIsOpen(true);
      return;
    }
    // Окно открыто: клик по глазу сворачивает в летающий орб (сессия остаётся).
    if (windowOpen) {
      setWantsMorphClose(false);
      setWindowOpen(false);
      setPersonalizationEyeSeq((n) => n + 1);
      return;
    }
    // Уже только орб: клик по глазу полностью выключает режим превью.
    setWantsMorphClose(false);
    setWindowOpen(false);
    setIsOpen(false);
    setBaseline(null);
    setDraft(null);
    setDemoNonce((n) => n + 1);
  },
    [isOpen, windowOpen, primeServiceAudioFromUserGesture],
  );

  const closePreview = useCallback(() => {
    // Эксплицитно закрыть режим превью (на уход со страницы и т.п.).
    setWantsMorphClose(false);
    setPreviewFocusField(null);
    setWindowOpen(false);
    setIsOpen(false);
    setBaseline(null);
    setDraft(null);
  }, []);

  const updateDraft = useCallback((patch: Partial<FullUiPreferences>) => {
    const keys = Object.keys(patch) as (keyof FullUiPreferences)[];
    const first = keys[0];
    if (first !== undefined) setPreviewFocusField(first);

    setDraft((d) => {
      if (!d) return d;
      return { ...d, ...patch };
    });
    // Включаем окно только когда пользователь действительно меняет опцию.
    if (isOpen && !windowOpen) setWindowOpen(true);
    setDemoNonce((n) => n + 1);
  }, [isOpen, windowOpen]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    await primeServiceAudioFromUserGestureAsync();
    if (!draft) return false;
    try {
      committed.replacePreferences(draft);
      const saved = clonePrefs(draft);
      setBaseline(saved);
      setDraft(saved);
      setDemoNonce((n) => n + 1);
      playServiceSound("success");
      return true;
    } catch {
      playServiceSound("error");
      return false;
    }
  }, [draft, committed]);

  const cancelDraft = useCallback(() => {
    if (!baseline) return;
    setDraft(clonePrefs(baseline));
    setDemoNonce((n) => n + 1);
  }, [baseline]);

  const value = useMemo<PersonalizationPreviewContextValue>(
    () => ({
      isOpen,
      windowOpen,
      baseline,
      draft,
      demoNonce,
      isDirty,
      previewFocusField,
      previewEyeButtonRef,
      lastEyeCursorClient,
      personalizationEyeSeq,
      wantsMorphClose,
      requestMorphClose,
      togglePreviewViaEye,
      closePreview,
      completeMorphRetractToOrb,
      updateDraft,
      saveDraft,
      cancelDraft,
    }),
    [
      isOpen,
      windowOpen,
      baseline,
      draft,
      demoNonce,
      isDirty,
      previewFocusField,
      wantsMorphClose,
      lastEyeCursorClient,
      personalizationEyeSeq,
      requestMorphClose,
      togglePreviewViaEye,
      closePreview,
      completeMorphRetractToOrb,
      updateDraft,
      saveDraft,
      cancelDraft,
    ],
  );

  return (
    <PersonalizationPreviewContext.Provider value={value}>{children}</PersonalizationPreviewContext.Provider>
  );
}

export function usePersonalizationPreview() {
  const ctx = useContext(PersonalizationPreviewContext);
  if (!ctx) throw new Error("usePersonalizationPreview must be used within PersonalizationPreviewProvider");
  return ctx;
}

/** Значения для формы персонализации: при открытом превью редактируется draft, иначе — сразу committed. */
export function usePersonalizationForm() {
  const committed = useUiPreferences();
  const pv = usePersonalizationPreview();
  const editing = pv.isOpen && pv.draft ? pv.draft : snapshotFromCtx(committed);

  const route = useCallback(
    (patch: Partial<FullUiPreferences>) => {
      if (pv.isOpen && pv.draft != null) {
        pv.updateDraft(patch);
        return;
      }
      const e = patch;
      if (e.theme !== undefined) committed.setTheme(e.theme);
      if (e.themeIntensity !== undefined) committed.setThemeIntensity(e.themeIntensity);
      if (e.density !== undefined) committed.setDensity(e.density);
      if (e.focus !== undefined) committed.setFocus(e.focus);
      if (e.blockEnter !== undefined) committed.setBlockEnter(e.blockEnter);
      if (e.blockHover !== undefined) committed.setBlockHover(e.blockHover);
      if (e.buttonPress !== undefined) committed.setButtonPress(e.buttonPress);
      if (e.buttonHover !== undefined) committed.setButtonHover(e.buttonHover);
      if (e.sectionTransition !== undefined) committed.setSectionTransition(e.sectionTransition);
      if (e.sectionLoading !== undefined) committed.setSectionLoading(e.sectionLoading);
      if (e.listAppear !== undefined) committed.setListAppear(e.listAppear);
      if (e.listActive !== undefined) committed.setListActive(e.listActive);
      if (e.chatDensity !== undefined) committed.setChatDensity(e.chatDensity);
      if (e.chatSendAnimation !== undefined) committed.setChatSendAnimation(e.chatSendAnimation);
      if (e.popoverAnimation !== undefined) committed.setPopoverAnimation(e.popoverAnimation);
      if (e.tooltipDisplay !== undefined) committed.setTooltipDisplay(e.tooltipDisplay);
      if (e.soundOutgoing !== undefined) committed.setSoundOutgoing(e.soundOutgoing);
      if (e.soundIncoming !== undefined) committed.setSoundIncoming(e.soundIncoming);
      if (e.incomingNotificationSound !== undefined) {
        committed.setIncomingNotificationSound(e.incomingNotificationSound);
      }
      if (e.soundServiceSounds !== undefined) committed.setSoundServiceSounds(e.soundServiceSounds);
      if (e.serviceSuccessSoundId !== undefined) committed.setServiceSuccessSoundId(e.serviceSuccessSoundId);
      if (e.serviceErrorSoundId !== undefined) committed.setServiceErrorSoundId(e.serviceErrorSoundId);
      if (e.soundAllEnabled !== undefined) committed.setSoundAllEnabled(e.soundAllEnabled);
      if (e.audioGuidanceMode !== undefined) committed.setAudioGuidanceMode(e.audioGuidanceMode);
      if (e.soundTrackerDeadline !== undefined) committed.setSoundTrackerDeadline(e.soundTrackerDeadline);
      if (e.soundTrackerStatus !== undefined) committed.setSoundTrackerStatus(e.soundTrackerStatus);
      if (e.defaultTrackerAlarmSound !== undefined) {
        committed.setDefaultTrackerAlarmSound(e.defaultTrackerAlarmSound);
      }
      if (e.showLoginSplash !== undefined) committed.setShowLoginSplash(e.showLoginSplash);
      if (e.showLogoutSplash !== undefined) committed.setShowLogoutSplash(e.showLogoutSplash);
      if (e.browserNotifications !== undefined) committed.setBrowserNotifications(e.browserNotifications);
      if (e.suppressPersonalizationEyeHighlight !== undefined) {
        committed.setSuppressPersonalizationEyeHighlight(e.suppressPersonalizationEyeHighlight);
      }
      if (e.sidebarAutoCollapse !== undefined) committed.setSidebarAutoCollapse(e.sidebarAutoCollapse);
    },
    [
      committed,
      pv.isOpen,
      pv.draft,
      pv.updateDraft,
    ],
  );

  return { editing, route, previewOpen: pv.isOpen, togglePreviewViaEye: pv.togglePreviewViaEye };
}
