import { describe, expect, it } from "vitest";
import { computePersonFotRows, computeRunFotAnalytics, sumLineTypeBreakdown } from "./fot-analytics";

function line(
  personId: string,
  lineType: string,
  amount: number,
  direction: "plus" | "minus",
  explanationJson: string | null = null,
) {
  return {
    personId,
    lineType,
    amount,
    direction,
    explanationJson,
  };
}

describe("computeRunFotAnalytics", () => {
  it("FOT total equals sum of TOTAL lines; Fix+Hourly+Flex equals FOT (non-TOTAL lines)", () => {
    const lines = [
      line("p1", "FIX_BASE", 10000, "plus", JSON.stringify({ ladderBlock: "fix" })),
      line("p1", "BASE_HOURLY_PAY", 5000, "plus", JSON.stringify({ ladderBlock: "hourly" })),
      line("p1", "BONUS", 2000, "plus", JSON.stringify({ ladderBlock: "flex", details: { paymentSource: "school_budget" } })),
      line("p1", "TOTAL", 17000, "plus", JSON.stringify({ ladderBlock: "total" })),
      line("p2", "FIX_BASE", 8000, "plus", JSON.stringify({ ladderBlock: "fix" })),
      line("p2", "TOTAL", 8000, "plus", JSON.stringify({ ladderBlock: "total" })),
    ];
    const a = computeRunFotAnalytics(lines);
    expect(a.fotTotal).toBe(25000);
    expect(a.fixTotal).toBe(18000);
    expect(a.hourlyTotal).toBe(5000);
    expect(a.flexTotal).toBe(2000);
    expect(a.fixBaseTotal).toBe(18000);
    expect(a.fixTotal + a.hourlyTotal + a.flexTotal).toBe(a.fotTotal);
    expect(a.fixBaseTotal + a.regionalSubsidyLineTotal + a.mrotTopUpTotal + a.mrotEvaluationTotal).toBe(a.fixTotal);
    expect(sumLineTypeBreakdown(a)).toBe(a.fotTotal);
  });

  it("aggregates lineType groups excluding TOTAL", () => {
    const lines = [
      line("p1", "PK_HOURLY_ADDON", 300, "plus", JSON.stringify({ ladderBlock: "hourly" })),
      line("p1", "PENALTY", 100, "minus", JSON.stringify({ ladderBlock: "flex", details: { paymentSource: "school_budget" } })),
      line("p1", "TOTAL", 200, "plus", JSON.stringify({ ladderBlock: "total" })),
    ];
    const a = computeRunFotAnalytics(lines);
    expect(a.pkTotal).toBe(300);
    expect(a.penaltyTotal).toBe(-100);
    expect(a.fotTotal).toBe(200);
  });
});

describe("computePersonFotRows", () => {
  it("per-person total matches TOTAL line; fix+hourly+flex matches components", () => {
    const lines = [
      {
        ...line("p1", "FIX_BASE", 100, "plus", JSON.stringify({ ladderBlock: "fix" })),
        person: { fullName: "A", employmentType: "labor_contract", workFormat: "staff" },
      },
      {
        ...line("p1", "TOTAL", 100, "plus", JSON.stringify({ ladderBlock: "total" })),
        person: { fullName: "A", employmentType: "labor_contract", workFormat: "staff" },
      },
    ];
    const rows = computePersonFotRows(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].fix).toBe(100);
    expect(rows[0].total).toBe(100);
    expect(rows[0].fix + rows[0].hourly + rows[0].flex).toBe(rows[0].total);
  });
});
