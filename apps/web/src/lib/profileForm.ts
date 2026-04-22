const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return t.length <= 320 && EMAIL_RE.test(t);
}

export function isValidPhone(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.length > 40) return false;
  return /^[+0-9()\s\-]+$/.test(t);
}

/** Должен совпадать с allowlist на backend */
export const PROFILE_TIMEZONES = [
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "Лондон" },
  { value: "Europe/Berlin", label: "Берлин" },
  { value: "Europe/Paris", label: "Париж" },
  { value: "America/New_York", label: "Нью-Йорк" },
  { value: "Asia/Almaty", label: "Алматы" },
  { value: "Asia/Tashkent", label: "Ташкент" },
] as const;

export function roleLabelRu(role: string): string {
  const map: Record<string, string> = {
    director: "Директор",
    head_teacher: "Завуч",
    teacher: "Учитель",
    parent: "Родитель",
    student: "Ученик",
    bot: "Бот",
    admin: "Администратор",
    sysadmin: "Системный администратор",
  };
  return map[role] ?? role;
}

export function apiErrorToMessage(code: string): string {
  const map: Record<string, string> = {
    NO_FIELDS: "Не выбрано ни одного поля для сохранения.",
    INVALID_EMAIL: "Укажите корректный email.",
    INVALID_PHONE: "Некорректный формат телефона.",
    INVALID_LOCALE: "Некорректный язык.",
    INVALID_TIMEZONE: "Выберите часовой пояс из списка.",
    INVALID_PROFILE_PREFS: "Некорректные настройки уведомлений.",
    FIELD_LOCKED: "Это поле может менять только администратор.",
    INVALID_INPUT: "Проверьте введённые данные.",
    PASSWORD_TOO_SHORT: "Пароль не короче 8 символов.",
    PASSWORD_TOO_LONG: "Пароль слишком длинный.",
    CURRENT_PASSWORD_WRONG: "Неверный текущий пароль.",
    INVALID_AVATAR_TYPE: "Допустимы только JPG и PNG.",
    AVATAR_UPLOAD_FAILED: "Не удалось загрузить фото.",
    AVATAR_REQUIRED: "Выберите файл изображения.",
    INVALID_LAST_NAME: "Укажите фамилию.",
    INVALID_FIRST_NAME: "Укажите имя.",
    INVALID_PATRONYMIC: "Проверьте введённые данные.",
    UPDATE_FAILED: "Не удалось сохранить.",
    FORBIDDEN: "Действие недоступно.",
  };
  return map[code] ?? code;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(u);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("LOAD_IMAGE"));
    };
    image.src = u;
  });
}

/** Квадратная обрезка по центру, результат JPEG для загрузки. */
export async function cropSquareToJpeg(file: File, size = 320): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("TO_BLOB"))), "image/jpeg", 0.9);
  });
}

/** Маска +7 (___) ___-__-__ */
export function formatPhoneRuDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (d.startsWith("7")) d = d.slice(1);
  if (d.length > 10) d = d.slice(0, 10);
  const p0 = d.slice(0, 3);
  const p1 = d.slice(3, 6);
  const p2 = d.slice(6, 8);
  const p3 = d.slice(8, 10);
  let out = "+7";
  if (p0) out += ` (${p0}`;
  if (p0.length === 3) out += ")";
  if (p1) out += ` ${p1}`;
  if (p2) out += `-${p2}`;
  if (p3) out += `-${p3}`;
  return out;
}

export function phoneDigitsFromMasked(s: string): string {
  return s.replace(/\D/g, "");
}
