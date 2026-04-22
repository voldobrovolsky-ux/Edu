export function formatFileName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "Без названия";

  // Common mojibake case when UTF-8 bytes are decoded as latin1.
  if (/[\u00C2-\u00F4]/.test(raw) && /[ÐÑ]/.test(raw)) {
    try {
      const fixed = decodeURIComponent(
        Array.from(raw)
          .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)
          .join(""),
      );
      if (fixed && fixed !== raw) return fixed;
    } catch {
      // keep original value
    }
  }

  return raw.replace(/\s+/g, " ");
}
