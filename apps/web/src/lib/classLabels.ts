export function groupNumberToLetterRu(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n);
  const code = 0x0410 + (n - 1);
  if (code > 0x042f) return String(n);
  return String.fromCharCode(code);
}

export function formatClassTeachingLabel(grade: number, groupNumber: number | null | undefined): string {
  if (!Number.isFinite(grade) || grade <= 0) return "—";
  if (groupNumber == null) return `${grade} класс (целиком)`;
  return `${grade}${groupNumberToLetterRu(groupNumber)}`;
}
