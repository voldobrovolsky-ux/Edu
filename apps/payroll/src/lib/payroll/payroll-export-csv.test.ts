import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import { buildDetailedLinesCsv, buildPersonSummaryCsv, csvEscape } from "./payroll-export-csv";

const person = {
  id: "p1",
  fullName: "Иванов И.И.",
  employmentType: "labor_contract",
  workFormat: "staff",
} as const;

function line(
  overrides: Partial<{
    id: string;
    lineType: string;
    amount: string;
    direction: string;
    explanationJson: string | null;
    flexOrFix: string;
  }> = {},
) {
  const amount = overrides.amount ?? "10000";
  return {
    id: overrides.id ?? "l1",
    personId: "p1" as const,
    lineType: overrides.lineType ?? "FIX_BASE",
    title: "Оклад",
    quantity: new Prisma.Decimal(0),
    rate: new Prisma.Decimal(0),
    amount: new Prisma.Decimal(amount),
    direction: overrides.direction ?? "plus",
    formulaText: "test",
    countsTowardMrot: true,
    flexOrFix: overrides.flexOrFix ?? "fix",
    explanationJson:
      overrides.explanationJson !== undefined
        ? overrides.explanationJson
        : JSON.stringify({ ladderBlock: "fix", details: {} }),
    person,
  };
}

describe("payroll-export-csv", () => {
  it("csvEscape quotes special chars", () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("x,y")).toBe('"x,y"');
  });

  it("person summary: fix+hourly+flex equals total from TOTAL line", () => {
    const lines = [
      line({ amount: "5000" }),
      line({
        id: "l2",
        lineType: "BASE_HOURLY_PAY",
        amount: "3000",
        flexOrFix: "fix",
        explanationJson: JSON.stringify({ ladderBlock: "hourly" }),
      }),
      line({
        id: "l3",
        lineType: "BONUS",
        amount: "500",
        flexOrFix: "flex",
        explanationJson: JSON.stringify({ ladderBlock: "flex" }),
      }),
      line({ id: "l4", lineType: "TOTAL", amount: "8500", explanationJson: JSON.stringify({ ladderBlock: "total" }) }),
    ];
    const csv = buildPersonSummaryCsv(2026, 3, lines);
    expect(csv).toContain("2026-03");
    expect(csv).toContain("Иванов");
    expect(csv).toContain("5000");
    expect(csv).toContain("3000");
    expect(csv).toContain("500");
    expect(csv).toContain("8500");
  });

  it("detailed export can omit TOTAL", () => {
    const lines = [
      line({ lineType: "FIX_BASE" }),
      line({ id: "t", lineType: "TOTAL", amount: "10000" }),
    ];
    const withTotal = buildDetailedLinesCsv(2026, 3, lines, { includeTotal: true });
    const without = buildDetailedLinesCsv(2026, 3, lines, { includeTotal: false });
    expect(withTotal.split("\n").length).toBeGreaterThan(without.split("\n").length);
    expect(without).not.toContain("TOTAL");
  });
});
