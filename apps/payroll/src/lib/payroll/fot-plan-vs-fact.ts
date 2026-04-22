export type PlanVsFactView =
  | { kind: "no_plan"; fact: number | null }
  | { kind: "plan_no_fact"; plan: number; note: string | null }
  | {
      kind: "full";
      plan: number;
      fact: number;
      delta: number;
      deltaPercent: number | null;
      status: "within" | "above";
      note: string | null;
    };

export function buildPlanVsFactView(
  planRub: number | null | undefined,
  factRub: number | null | undefined,
  note: string | null | undefined,
): PlanVsFactView {
  const plan = planRub != null ? Number(planRub) : null;
  const fact = factRub != null ? Number(factRub) : null;

  if (plan == null || Number.isNaN(plan)) {
    return { kind: "no_plan", fact: fact != null && !Number.isNaN(fact) ? fact : null };
  }

  if (fact == null || Number.isNaN(fact)) {
    return { kind: "plan_no_fact", plan, note: note ?? null };
  }

  const delta = Math.round((fact - plan) * 100) / 100;
  const deltaPercent = plan > 0 ? Math.round((delta / plan) * 1000) / 10 : null;
  const status: "within" | "above" = fact > plan ? "above" : "within";

  return {
    kind: "full",
    plan,
    fact,
    delta,
    deltaPercent,
    status,
    note: note ?? null,
  };
}
