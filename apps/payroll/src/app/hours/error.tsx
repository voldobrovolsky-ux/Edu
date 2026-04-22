"use client";

export default function HoursError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4 rounded-2xl border border-danger/25 bg-danger-soft/30 px-5 py-6">
      <h1 className="text-lg font-semibold text-foreground">Ошибка раздела</h1>
      <p className="text-sm text-muted-foreground">
        Учёт часов и замен ведётся через ассистента в мессенджере. Если ошибка повторяется, обратитесь к администратору.
      </p>
      <button type="button" onClick={() => reset()} className="edu-btn-secondary">
        Повторить
      </button>
    </div>
  );
}
