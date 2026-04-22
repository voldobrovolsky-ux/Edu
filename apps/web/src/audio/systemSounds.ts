import type { NotificationSoundId, SoundCategory, SystemSoundId } from "./systemSoundConfig";
import {
  assertNotificationPathsInNotifications,
  getSystemSoundCategory,
  isAlarmSoundId,
  isNotificationSoundId,
  isServiceSoundId,
  listSystemSoundIdsByCategory,
  NOTIFICATION_SOUND_ID_LIST,
  resolveSystemSoundUrl,
} from "./systemSoundConfig";

assertNotificationPathsInNotifications();

export type { SoundCategory, SystemSoundId } from "./systemSoundConfig";
export {
  assertNotificationPathsInNotifications,
  getSystemSoundCategory,
  listSystemSoundIdsByCategory,
} from "./systemSoundConfig";

export type PlaySoundOptions = {
  volume?: number;
  loop?: boolean;
};

function assignResolvedSrc(a: HTMLAudioElement, id: SystemSoundId): void {
  const url = resolveSystemSoundUrl(id);
  if (a.dataset.edSrc === url) return;
  a.src = url;
  a.dataset.edSrc = url;
  try {
    a.load();
  } catch (e: unknown) {
    // eslint-disable-next-line no-console -- диагностика
    console.error(`[systemSounds] load() sync error id=${id}`, e);
  }
}

function createPoolEntry(id: SystemSoundId): HTMLAudioElement {
  const el = new Audio();
  el.preload = "auto";
  (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  assignResolvedSrc(el, id);
  el.addEventListener("error", () => {
    // eslint-disable-next-line no-console -- 404 / CORS / формат
    console.error(
      `[SOUND_ERROR] media-element id=${id}`,
      el.error?.message || el.error?.code || "unknown",
    );
  });
  return el;
}

let introPrimedFromGesture = false;

const pool = new Map<SystemSoundId, HTMLAudioElement>();

function getAudio(id: SystemSoundId): HTMLAudioElement {
  let a = pool.get(id);
  if (!a) {
    a = createPoolEntry(id);
    pool.set(id, a);
  }
  return a;
}

function canPlayByGlobalMode(id: SystemSoundId): boolean {
  if (typeof document === "undefined") return true;
  const ds = document.documentElement.dataset;
  if (ds.edSoundAllEnabled === "0") return false;
  const mode = ds.edAudioGuidanceMode;
  if (mode === "none") return false;
  if (mode === "partial") {
    if (id === "intro" || id === "completion_of_work" || id === "success" || id === "error") return false;
  }
  return true;
}

/**
 * Тот же `HTMLAudioElement`, что и в `play("intro")`. Вызывать из user gesture до `await` сетевых запросов.
 */
export async function primeIntroFromUserGesture(): Promise<void> {
  if (introPrimedFromGesture) return;

  const audio = getAudio("intro");
  audio.volume = 0;
  try {
    await audio.play();
  } catch {
    audio.volume = 1;
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  audio.volume = 1;
  introPrimedFromGesture = true;
}

async function playIntroLogged(opts?: PlaySoundOptions): Promise<void> {
  if (!canPlayByGlobalMode("intro")) return;
  stopAllNotificationsAndAlarms();
  const audio = getAudio("intro");
  assignResolvedSrc(audio, "intro");
  audio.loop = opts?.loop ?? false;
  audio.volume = opts?.volume ?? 1;
  try {
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
  } catch (e: unknown) {
    // eslint-disable-next-line no-console -- диагностика
    console.error("INTRO_PLAY_ERROR", e);
  }
}

/** Уведомления и будильники не накладываются: перед новым звуком глушим все из этих категорий. */
function stopAllNotificationsAndAlarms(): void {
  for (const sid of listSystemSoundIdsByCategory("Notifications")) {
    systemSounds.stop(sid);
  }
  for (const sid of listSystemSoundIdsByCategory("Alarms")) {
    systemSounds.stop(sid);
  }
}

const SERVICE_SHORT_FEEDBACK_IDS = ["sending", "success", "error"] as const satisfies readonly SystemSoundId[];

/** Короткие сервисные сигналы не накладываются друг на друга. */
function stopOtherServiceFeedback(except: SystemSoundId): void {
  for (const sid of SERVICE_SHORT_FEEDBACK_IDS) {
    if (sid !== except) systemSounds.stop(sid);
  }
}

/**
 * Централизованное воспроизведение системных звуков (без `new Audio` в компонентах).
 */
export const systemSounds = {
  url(id: SystemSoundId): string {
    return resolveSystemSoundUrl(id);
  },

  preload(ids: readonly SystemSoundId[]): void {
    for (const id of ids) {
      void getAudio(id).load();
    }
  },

  play(id: SystemSoundId, opts?: PlaySoundOptions): void {
    if (!canPlayByGlobalMode(id)) return;
    if (id === "intro") {
      void playIntroLogged(opts);
      return;
    }

    if (id === "completion_of_work") {
      systemSounds.stop("intro");
      systemSounds.stop("completion_of_work");
    }

    const cat = getSystemSoundCategory(id);
    if (cat === "Notifications" || cat === "Alarms") {
      stopAllNotificationsAndAlarms();
    } else if (cat === "Service" && (SERVICE_SHORT_FEEDBACK_IDS as readonly string[]).includes(id)) {
      stopOtherServiceFeedback(id);
    }

    const a = getAudio(id);
    assignResolvedSrc(a, id);
    a.loop = opts?.loop ?? false;
    a.volume = opts?.volume ?? 1;
    const url = resolveSystemSoundUrl(id);
    // eslint-disable-next-line no-console -- диагностика воспроизведения
    console.log("[SOUND_PLAY]", id, url);
    try {
      a.pause();
      a.currentTime = 0;
      void a.play()
        .then(() => {
          // eslint-disable-next-line no-console -- подтверждение старта воспроизведения
          console.log("[SOUND_PLAY_OK]", id);
        })
        .catch((e: unknown) => {
          // eslint-disable-next-line no-console -- autoplay / CORS / формат
          console.error("[SOUND_ERROR]", id, e);
          tryPlayFreshAudio(id, opts);
        });
    } catch (e: unknown) {
      // eslint-disable-next-line no-console -- диагностика
      console.error("[SOUND_ERROR]", id, e);
      tryPlayFreshAudio(id, opts);
    }
  },

  stop(id: SystemSoundId): void {
    const a = pool.get(id);
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  },

  listByCategory(category: SoundCategory): SystemSoundId[] {
    return listSystemSoundIdsByCategory(category);
  },

  categoryOf(id: SystemSoundId): SoundCategory {
    return getSystemSoundCategory(id);
  },
};

/**
 * Учитывает `data-ed-sound-outgoing` / `data-ed-sound-incoming` / `data-ed-sound-service` на `<html>`.
 * Для `success` и `error` используйте {@link playServiceSound}.
 */
export function playPrefGatedSound(
  id: SystemSoundId,
  gate: "outgoing" | "incoming" | "service",
): void {
  if (id === "intro") {
    systemSounds.play(id);
    return;
  }
  if (typeof document === "undefined") {
    systemSounds.play(id);
    return;
  }
  const root = document.documentElement;
  if (gate === "service") {
    if (root.dataset.edSoundService === "0") {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- подсказка, почему тихо
        console.debug("[playPrefGatedSound] service sound skipped (Сервисные звуки выкл.)");
      }
      return;
    }
    systemSounds.play(id);
    return;
  }
  const allowed =
    gate === "outgoing" ? root.dataset.edSoundOutgoing !== "0" : root.dataset.edSoundIncoming !== "0";
  if (!allowed) return;
  systemSounds.play(id);
}

function resolveServiceFeedbackSoundId(kind: "success" | "error"): SystemSoundId | null {
  if (typeof document === "undefined") {
    return kind === "success" ? "success" : "error";
  }
  const ds = document.documentElement.dataset;
  const raw = kind === "success" ? ds.edServiceSuccessSound : ds.edServiceErrorSound;
  if (raw === "none") return null;
  if (raw && isServiceSoundId(raw)) return raw;
  return kind === "success" ? "success" : "error";
}

/**
 * Универсальные сигналы сохранения и CRUD без отдельного звука.
 * Не вызывать там, где уже звучит свой звук: `sending`, входящие чата, `intro`, будильники трекера
 * (`playTaskTrackerAlarmSound` / `playTaskTrackerStatusSound` и т.д.).
 */
export function playServiceSound(kind: "success" | "error"): void {
  const id = resolveServiceFeedbackSoundId(kind);
  if (!id) return;
  playPrefGatedSound(id, "service");
}

/** Входящий счётчик / push: звук из `data-ed-incoming-notif-sound` (prefs). */
export function playIncomingNotificationSound(): void {
  if (typeof document === "undefined") return;
  const raw = document.documentElement.dataset.edIncomingNotifSound;
  if (raw === "none") return;
  const id: NotificationSoundId = raw && isNotificationSoundId(raw) ? raw : "notification1";
  playPrefGatedSound(id, "incoming");
}

/** Прослушать выбранный в селекте звук (с учётом «Звук входящего сообщения»). */
export function playIncomingNotificationSample(id: NotificationSoundId | "none"): void {
  if (id === "none") return;
  playPrefGatedSound(id, "incoming");
}

/** Сигналы дедлайна трекера задач (Alarms); учитывает «Звуки дедлайнов трекера». */
export function playTaskTrackerAlarmSound(id: SystemSoundId): void {
  if (!isAlarmSoundId(id)) return;
  if (typeof document !== "undefined" && document.documentElement.dataset.edSoundTrackerDeadline === "0") return;
  systemSounds.play(id);
}

/** Успех/ошибка операций с задачами; те же файлы, что и сервисные success/error в персонализации. */
export function playTaskTrackerStatusSound(kind: "success" | "error"): void {
  if (typeof document !== "undefined" && document.documentElement.dataset.edSoundTrackerStatus === "0") return;
  const sid = resolveServiceFeedbackSoundId(kind);
  if (!sid) return;
  systemSounds.play(sid);
}

/**
 * Тихий прогон на **отдельном** `Audio`, не на элементе из пула.
 * Иначе `finish()` тихого prime сбрасывает тот же `HTMLAudioElement`, на котором только что играет success/sending.
 */
function primeOneSilent(id: SystemSoundId): Promise<void> {
  return new Promise((resolve) => {
    const url = resolveSystemSoundUrl(id);
    const a = new Audio();
    (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    a.preload = "auto";
    a.src = url;
    a.volume = 0;

    const done = () => {
      try {
        a.pause();
        a.removeAttribute("src");
        a.load();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const safety = window.setTimeout(done, 1200);
    try {
      const p = a.play();
      if (p !== undefined) {
        void p
          .then(() => {
            window.clearTimeout(safety);
            window.requestAnimationFrame(done);
          })
          .catch((e: unknown) => {
            window.clearTimeout(safety);
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn(`[systemSounds] prime disposable rejected id=${id}`, e);
            }
            done();
          });
      } else {
        window.clearTimeout(safety);
        done();
      }
    } catch (e: unknown) {
      window.clearTimeout(safety);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[systemSounds] prime disposable sync error id=${id}`, e);
      }
      done();
    }
  });
}

const PRIME_SERVICE_IDS: SystemSoundId[] = ["success", "error", "sending"];

/**
 * Дождаться тихого прогона success/error/sending — вызывать из обработчика кнопки **до** долгого `await`,
 * чтобы потом `playServiceSound` не отрезался autoplay.
 */
export async function primeServiceAudioFromUserGestureAsync(): Promise<void> {
  if (typeof document === "undefined") return;
  for (const id of PRIME_SERVICE_IDS) {
    await primeOneSilent(id);
  }
}

/**
 * Старт тихого прогона без ожидания (например сразу перед синхронным `play("sending")` в том же клике).
 */
export function primeServiceAudioFromUserGesture(): void {
  void primeServiceAudioFromUserGestureAsync();
}

function tryPlayFreshAudio(id: SystemSoundId, opts?: PlaySoundOptions): void {
  try {
    const url = resolveSystemSoundUrl(id);
    const el = new Audio(url);
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    el.loop = opts?.loop ?? false;
    el.volume = opts?.volume ?? 1;
    void el.play().catch((e: unknown) => {
      // eslint-disable-next-line no-console -- fallback после отказа пула
      console.error("[SOUND_ERROR] tryPlayFreshAudio", id, e);
    });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console -- диагностика
    console.error("[SOUND_ERROR] tryPlayFreshAudio-sync", id, e);
  }
}

/**
 * Входящие уведомления (сайдбар, опрос unread) играют без жеста — браузер режет autoplay.
 * После первого pointerdown делаем тихий прогон мелодий Notifications + сервисных (без intro),
 * чтобы последующие `play()` из таймеров/await чаще проходили.
 */
export function ensureSystemSoundsUnlockedOnFirstGesture(): void {
  if (typeof document === "undefined") return;
  let active = true;
  const onPointer = () => {
    if (!active) return;
    active = false;
    document.removeEventListener("pointerdown", onPointer, true);
    const ids: SystemSoundId[] = [...PRIME_SERVICE_IDS, ...(NOTIFICATION_SOUND_ID_LIST as readonly SystemSoundId[])];
    void ids.reduce<Promise<void>>((acc, id) => acc.then(() => primeOneSilent(id)), Promise.resolve());
  };
  document.addEventListener("pointerdown", onPointer, true);
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  const w = window as Window & { __edPlaySystemSound?: (id: SystemSoundId) => void };
  w.__edPlaySystemSound = (id) => {
    systemSounds.play(id);
  };
}
