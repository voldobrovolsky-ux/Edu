import type { ReactNode } from "react";
import type { BranchEngineResult, BranchMatchInput, PkEngineResult } from "@/modules/types";

type StoredRecommendation = {
  branch?: BranchEngineResult;
  pkRec?: PkEngineResult;
  input?: BranchMatchInput;
};

function parseStored(json: string): StoredRecommendation | null {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== "object") return null;
    return v as StoredRecommendation;
  } catch {
    return null;
  }
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,9rem)_1fr] sm:gap-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Structured view of `lastRecommendationJson` from candidate questionnaire (not raw dump). */
export function CandidateRecommendationPanel({ json }: { json: string }) {
  const data = parseStored(json);
  if (!data || (!data.branch && !data.pkRec && !data.input)) {
    return (
      <div className="rounded-xl border border-border bg-elevated/80 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Последняя рекомендация анкеты</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border/80 bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {json}
        </pre>
      </div>
    );
  }

  const b = data.branch;
  const pk = data.pkRec;
  const inp = data.input;

  return (
    <div className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-b from-card to-accent-soft/20 shadow-card ring-1 ring-accent/10">
      <div className="border-b border-accent/15 bg-accent-soft/50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Результат анкеты</p>
        <p className="mt-1 text-sm text-foreground">
          Ветка и рекомендация PK рассчитаны по ответам; данные также в аудите.
        </p>
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-3">
        <div className="space-y-3">
          <p className="edu-section-title">Ветка</p>
          <dl className="space-y-2.5">
            {b?.matchedRule ? (
              <MetaRow label="Правило">
                <span className="font-medium">
                  {b.matchedRule.code} — {b.matchedRule.name}
                </span>
              </MetaRow>
            ) : (
              <MetaRow label="Правило">
                <span className="text-muted-foreground">не сопоставлено</span>
              </MetaRow>
            )}
            {b?.matchExplanation && (
              <MetaRow label="Пояснение">
                <span className="text-muted-foreground">{b.matchExplanation}</span>
              </MetaRow>
            )}
            {b?.eligibility && <MetaRow label="Допуск">{b.eligibility}</MetaRow>}
            {b?.recommendedInternalCategoryCode && (
              <MetaRow label="Внутр. категория">{b.recommendedInternalCategoryCode}</MetaRow>
            )}
            {(b?.pkCorridorMinCode || b?.pkCorridorMaxCode) && (
              <MetaRow label="Коридор PK">
                {b.pkCorridorMinCode ?? "—"} … {b.pkCorridorMaxCode ?? "—"}
              </MetaRow>
            )}
            {b?.comment && <MetaRow label="Комментарий">{b.comment}</MetaRow>}
          </dl>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-6 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-6">
          <p className="edu-section-title">Рекомендация PK</p>
          {pk ? (
            <dl className="space-y-2.5">
              <MetaRow label="Уровень">
                <span className="text-lg font-semibold tabular-nums text-foreground">{pk.recommendedPKCode}</span>
              </MetaRow>
              <MetaRow label="Коридор">{pk.pkCorridorDescription}</MetaRow>
              <MetaRow label="Логика">
                <span className="text-muted-foreground">{pk.explanation}</span>
              </MetaRow>
              {pk.warnings && pk.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/25 bg-warning-soft/80 px-3 py-2">
                  <p className="text-xs font-medium text-warning">Предупреждения</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-foreground">
                    {pk.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Нет блока pkRec в сохранённом JSON.</p>
          )}
        </div>

        <div className="space-y-3 border-t border-border/60 pt-6 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-6">
          <p className="edu-section-title">Вход анкеты</p>
          {inp ? (
            <dl className="space-y-2.5">
              <MetaRow label="Образование">{inp.educationLevel}</MetaRow>
              <MetaRow label="Пед. квалификация">{inp.hasPedagogicalQualification ? "да" : "нет"}</MetaRow>
              <MetaRow label="Переподготовка">{inp.hasRetraining ? "да" : "нет"}</MetaRow>
              <MetaRow label="Релевантность">{inp.subjectRelevance}</MetaRow>
              <MetaRow label="Опыт школы">{String(inp.schoolExperienceYears)} лет</MetaRow>
              <MetaRow label="Репетиторство">{String(inp.tutoringExperienceYears)} лет</MetaRow>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Нет блока input в сохранённом JSON.</p>
          )}
        </div>
      </div>

      <details className="border-t border-border/60 bg-elevated/50 px-4 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium text-foreground hover:text-accent-foreground">
          Технический JSON
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-border/80 bg-card p-2 font-mono text-[10px] leading-relaxed text-foreground">
          {json}
        </pre>
      </details>
    </div>
  );
}
