/**
 * Карта системных звуков: ключ → путь внутри `public/system_sounds/` (URL `/system_sounds/...`).
 *
 * Источник ассетов в репозитории: **`edumed-v0.1/system_sounds/`** (корень пакета, рядом с `apps/`).
 * При `npm run dev` / `vite build` содержимое копируется в `apps/web/public/system_sounds/`, иначе браузер не увидит файлы.
 *
 * Структура внутри (как в путях ниже):
 * - `Alarms/Alarm 1.wav` …
 * - `Notifications/Notification sound N.wav`
 * - `Service/audio intro.wav`, `Service/Sending.mp3`, …
 *
 * Файлы только в корне `system_sounds` без подпапок **не** совпадают с этими URL — их нужно разложить по `Alarms` / `Notifications` / `Service`.
 */

export type SoundCategory = "Alarms" | "Notifications" | "Service";

export type SystemSoundMeta = {
  path: string;
  category: SoundCategory;
};

export type SystemSoundId =
  | "intro"
  | "completion_of_work"
  | "sending"
  | "success"
  | "error"
  | "notification1"
  | "notification2"
  | "notification3"
  | "notification4"
  | "notification5"
  | "notification6"
  | "notification7"
  | "alarm1"
  | "alarm2"
  | "alarm3"
  | "alarm4"
  | "alarm5";

/** Ключи уведомлений для входящих (селект в персонализации). */
export const NOTIFICATION_SOUND_ID_LIST = [
  "notification1",
  "notification2",
  "notification3",
  "notification4",
  "notification5",
  "notification6",
  "notification7",
] as const;

export type NotificationSoundId = (typeof NOTIFICATION_SOUND_ID_LIST)[number];

export function isNotificationSoundId(s: string): s is NotificationSoundId {
  return (NOTIFICATION_SOUND_ID_LIST as readonly string[]).includes(s);
}

export const ALARM_SOUND_ID_LIST = ["alarm1", "alarm2", "alarm3", "alarm4", "alarm5"] as const;

export type AlarmSoundId = (typeof ALARM_SOUND_ID_LIST)[number];

export function isAlarmSoundId(s: string): s is AlarmSoundId {
  return (ALARM_SOUND_ID_LIST as readonly string[]).includes(s);
}

/** Звуки категории Service (успех/ошибка и др. в персонализации). */
export const SERVICE_SOUND_ID_LIST = ["intro", "sending", "success", "error"] as const;

export type ServiceSoundId = (typeof SERVICE_SOUND_ID_LIST)[number];

export function isServiceSoundId(s: string): s is ServiceSoundId {
  return (SERVICE_SOUND_ID_LIST as readonly string[]).includes(s);
}

export const SYSTEM_SOUND_FILES: Record<SystemSoundId, SystemSoundMeta> = {
  intro: { path: "Service/audio intro.wav", category: "Service" },
  completion_of_work: { path: "Service/Completion of work.wav", category: "Service" },
  sending: { path: "Service/Sending.mp3", category: "Service" },
  success: { path: "Service/succes.wav", category: "Service" },
  error: { path: "Service/unsucces.wav", category: "Service" },

  notification1: { path: "Notifications/Notification sound 1.wav", category: "Notifications" },
  notification2: { path: "Notifications/Notification sound 2.wav", category: "Notifications" },
  notification3: { path: "Notifications/Notification sound 3.wav", category: "Notifications" },
  notification4: { path: "Notifications/Notification sound 4.wav", category: "Notifications" },
  notification5: { path: "Notifications/Notification sound 5.wav", category: "Notifications" },
  notification6: { path: "Notifications/Notification sound 6.wav", category: "Notifications" },
  notification7: { path: "Notifications/Notification sound 7.wav", category: "Notifications" },

  alarm1: { path: "Alarms/Alarm 1.wav", category: "Alarms" },
  alarm2: { path: "Alarms/Alarm 2.wav", category: "Alarms" },
  alarm3: { path: "Alarms/Alarm 3.wav", category: "Alarms" },
  alarm4: { path: "Alarms/Alarm 4.wav", category: "Alarms" },
  alarm5: { path: "Alarms/Alarm 5 (Goeldberg variations).wav", category: "Alarms" },
};

const SOUNDS_DIR = "system_sounds";

export function resolveSystemSoundUrl(id: SystemSoundId): string {
  const base = import.meta.env.BASE_URL;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const rel = SYSTEM_SOUND_FILES[id].path;
  const encoded = rel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${normalizedBase}${SOUNDS_DIR}/${encoded}`;
}

export function getSystemSoundCategory(id: SystemSoundId): SoundCategory {
  return SYSTEM_SOUND_FILES[id].category;
}

export function listSystemSoundIdsByCategory(category: SoundCategory): SystemSoundId[] {
  return (Object.entries(SYSTEM_SOUND_FILES) as [SystemSoundId, SystemSoundMeta][])
    .filter(([, m]) => m.category === category)
    .map(([soundId]) => soundId);
}

/** Проверка: все notification* лежат в Notifications/. */
export function assertNotificationPathsInNotifications(): void {
  if (import.meta.env.PROD) return;
  const bad = (Object.entries(SYSTEM_SOUND_FILES) as [SystemSoundId, SystemSoundMeta][]).filter(
    ([id, m]) => id.startsWith("notification") && !m.path.startsWith("Notifications/"),
  );
  if (bad.length > 0) {
    // eslint-disable-next-line no-console -- dev-only invariant
    console.error("[systemSoundConfig] notification keys must use Notifications/", bad);
  }
}
