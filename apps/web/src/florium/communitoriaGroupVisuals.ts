/** Стабильный цвет и подпись для аватара группы без изображения. */
const PALETTE = [
  "bg-sky-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
];

export function communitoriaColorClassForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? "bg-slate-600";
}

export function communitoriaInitials(title: string, fallback = "?"): string {
  const t = title.trim();
  if (!t) return fallback;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}
