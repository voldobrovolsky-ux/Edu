import { describe, expect, it } from "vitest";
import { calculatePayrollForPerson } from "./payroll-engine";

describe("calculatePayrollForPerson", () => {
  it("computes hourly lines and separates substitution at full rate", () => {
    const r = calculatePayrollForPerson({
      personId: "p1",
      fullName: "Test",
      employmentType: "no_labor_contract",
      workFormat: "part_time",
      lessonHoursPay: 10,
      lessonHoursMrot: 10,
      substitutionHoursPay: 2,
      substitutionHoursMrot: 2,
      guaranteedMonthlyFixRub: 0,
      hourly: {
        effectiveBaseHourRate: 750,
        pkHourlyAddon: 33,
        prHourlyAddon: 5,
        opHourlyAddon: 3,
        otherHourlyAddons: 0,
      },
      adjustments: [],
      effectiveMrotMonthly: 20000,
      applyMrot: false,
    });
    const types = r.lines.map((l) => l.lineType);
    expect(types).toContain("BASE_HOURLY_PAY");
    expect(types).toContain("PK_HOURLY_ADDON");
    expect(types).toContain("SUBSTITUTION_PAY");
    const sub = r.lines.find((l) => l.lineType === "SUBSTITUTION_PAY");
    expect(sub?.quantity).toBe(2);
    expect(sub?.rate).toBe(750 + 33 + 5 + 3);
    expect(r.lines.find((l) => l.lineType === "BASE_HOURLY_PAY")?.ladderBlock).toBe("hourly");
    expect(sub?.ladderBlock).toBe("flex");
  });

  it("adds MROT top-up for labor contract when counted amount is below MROT", () => {
    const r = calculatePayrollForPerson({
      personId: "p2",
      fullName: "Test2",
      employmentType: "labor_contract",
      workFormat: "staff",
      lessonHoursPay: 0,
      lessonHoursMrot: 0,
      substitutionHoursPay: 0,
      substitutionHoursMrot: 0,
      guaranteedMonthlyFixRub: 10000,
      hourly: {
        effectiveBaseHourRate: 750,
        pkHourlyAddon: 0,
        prHourlyAddon: 0,
        opHourlyAddon: 0,
        otherHourlyAddons: 0,
      },
      adjustments: [],
      effectiveMrotMonthly: 22440,
      applyMrot: true,
    });
    const mrot = r.lines.find((l) => l.lineType === "MROT_TOPUP");
    expect(mrot).toBeDefined();
    expect(Number(mrot?.amount)).toBeGreaterThan(0);
  });

  it("does not pay student-cancelled hours but can keep load-only rows in accounting (pay=0, mrot=0)", () => {
    const r = calculatePayrollForPerson({
      personId: "p3",
      fullName: "Test3",
      employmentType: "no_labor_contract",
      workFormat: "staff",
      lessonHoursPay: 0,
      lessonHoursMrot: 0,
      substitutionHoursPay: 0,
      substitutionHoursMrot: 0,
      guaranteedMonthlyFixRub: 0,
      hourly: {
        effectiveBaseHourRate: 750,
        pkHourlyAddon: 30,
        prHourlyAddon: 0,
        opHourlyAddon: 0,
        otherHourlyAddons: 0,
      },
      adjustments: [],
      effectiveMrotMonthly: 20000,
      applyMrot: false,
    });
    expect(r.lines.some((l) => l.lineType === "BASE_HOURLY_PAY")).toBe(false);
  });
});
