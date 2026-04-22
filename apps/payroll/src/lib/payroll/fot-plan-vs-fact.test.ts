import { describe, expect, it } from "vitest";
import { buildPlanVsFactView } from "./fot-plan-vs-fact";

describe("buildPlanVsFactView", () => {
  it("no plan: no misleading percentages", () => {
    const v = buildPlanVsFactView(null, 100_000, null);
    expect(v.kind).toBe("no_plan");
    if (v.kind === "no_plan") expect(v.fact).toBe(100_000);
  });

  it("plan without fact", () => {
    const v = buildPlanVsFactView(500_000, null, "q1");
    expect(v.kind).toBe("plan_no_fact");
  });

  it("full: above plan", () => {
    const v = buildPlanVsFactView(100, 150, null);
    expect(v.kind).toBe("full");
    if (v.kind === "full") {
      expect(v.status).toBe("above");
      expect(v.deltaPercent).toBe(50);
    }
  });
});
