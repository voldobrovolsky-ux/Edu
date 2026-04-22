/**
 * Кодирование учебных сущностей.
 *
 * Источник правил: GENERAL DESCRIPTION EDUMED v0.1 §2.4.
 *
 * - Ученик: student<username><grade><group>
 *   Пример: username=dillova, grade=5, group=1 -> studentdillova51
 *
 * - Дисциплина: первые 5 букв названия -> латиница -> базовый код, затем +grade
 *   Пример: "МАТЕМАТИКА" -> MATEM, для 5 класса -> MATEM5
 */

export function makeStudentCode(args: {
  username: string;
  grade: number;
  group: number;
}): string {
  const username = args.username.trim();
  if (!username) throw new Error("EMPTY_USERNAME");
  if (!Number.isInteger(args.grade) || args.grade <= 0) throw new Error("INVALID_GRADE");
  if (!Number.isInteger(args.group) || args.group <= 0) throw new Error("INVALID_GROUP");
  return `student${username}${args.grade}${args.group}`;
}

/**
 * Пытается разобрать student-код на (username, grade, group).
 * Уникальность обеспечивается существованием связки (grade, group) в школе.
 */
export function parseStudentCode(args: {
  code: string;
  existingGroups: Array<{ grade: number; groupNumber: number }>;
}): { username: string; grade: number; group: number } {
  const code = (args.code ?? "").trim();
  if (!code.startsWith("student")) throw new Error("NOT_A_STUDENT_CODE");
  const rest = code.slice("student".length);
  if (!rest) throw new Error("INVALID_STUDENT_CODE");

  const matches: Array<{ username: string; grade: number; group: number }> = [];
  for (const g of args.existingGroups) {
    const suffix = `${g.grade}${g.groupNumber}`;
    if (!rest.endsWith(suffix)) continue;
    const username = rest.slice(0, -suffix.length);
    if (!username) continue;
    matches.push({ username, grade: g.grade, group: g.groupNumber });
  }

  if (matches.length === 0) throw new Error("STUDENT_CODE_NOT_RESOLVABLE");
  if (matches.length > 1) throw new Error("STUDENT_CODE_AMBIGUOUS");
  return matches[0]!;
}

// Минимальная кириллица -> латиница для кодов (достаточно для школьных предметов).
const RU_TO_LAT: Record<string, string> = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ё: "E",
  Ж: "ZH",
  З: "Z",
  И: "I",
  Й: "I",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "C",
  Ч: "CH",
  Ш: "SH",
  Щ: "SH",
  Ы: "Y",
  Э: "E",
  Ю: "YU",
  Я: "YA",
  Ъ: "",
  Ь: "",
};

export function makeDisciplineBaseCode(name: string): string {
  const raw = (name ?? "").trim();
  if (!raw) throw new Error("EMPTY_NAME");

  // Берём первые 5 букв (не символов), пробелы/пунктуацию выкидываем.
  const letters = Array.from(raw)
    .filter((ch) => /\p{L}/u.test(ch))
    .slice(0, 5)
    .map((ch) => {
      const up = ch.toUpperCase();
      if (/[A-Z]/.test(up)) return up;
      if (RU_TO_LAT[up]) return RU_TO_LAT[up];
      // Прочие буквы (укр/каз/лат. диакритика) — нормализуем в ASCII по возможности.
      const normalized = up.normalize("NFKD").replace(/[^\p{L}]/gu, "");
      return RU_TO_LAT[normalized] ?? normalized.replace(/[^A-Z]/g, "");
    })
    .join("");

  const base = letters.replace(/[^A-Z]/g, "").slice(0, 5);
  if (base.length < 3) throw new Error("NAME_TOO_SHORT_FOR_CODE");
  return base.padEnd(5, "X");
}

export function makeDisciplineCode(args: { baseCode: string; grade: number }): string {
  const base = (args.baseCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(base)) throw new Error("INVALID_BASE_CODE");
  if (!Number.isInteger(args.grade) || args.grade <= 0) throw new Error("INVALID_GRADE");
  return `${base}${args.grade}`;
}

