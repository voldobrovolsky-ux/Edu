import type { ReactNode } from "react";
import { candidateIntakeFieldLabelRu, formatQuestionnaireValue } from "@/lib/display-labels";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/40 py-2 last:border-0 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Разбор `CandidateProfile.questionnaireAnswers` (JSON из полей формы анкеты). */
export function QuestionnaireAnswersPanel({ json }: { json: string | null | undefined }) {
  if (!json?.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        Полный набор ответов анкеты ещё не сохранён — отправьте форму в разделе «Анкета кандидата».
      </p>
    );
  }

  let entries: [string, string][] = [];
  try {
    const v = JSON.parse(json) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      entries = Object.entries(v as Record<string, unknown>).map(([k, val]) => [
        k,
        typeof val === "string" || typeof val === "number" || typeof val === "boolean"
          ? String(val)
          : JSON.stringify(val),
      ]);
    }
  } catch {
    return (
      <pre className="max-h-48 overflow-auto rounded-lg border border-border/80 bg-card p-3 font-mono text-[11px] text-foreground">
        {json}
      </pre>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">В сохранённых ответах нет полей.</p>;
  }

  const sorted = entries.sort(([a], [b]) => a.localeCompare(b, "ru"));

  return (
    <div className="rounded-xl border border-border/60 bg-elevated/50">
      <dl className="divide-y divide-border/40 px-3">
        {sorted.map(([key, raw]) => (
          <Row key={key} label={candidateIntakeFieldLabelRu[key] ?? key}>
            {formatQuestionnaireValue(key, raw)}
          </Row>
        ))}
      </dl>
    </div>
  );
}
