import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { executePayrollRun } from "@/lib/payroll-run-service";

describe("executePayrollRun (integration)", () => {
  it("persists PayrollLine rows for the latest run (seed: March 2026)", async () => {
    const latest = await prisma.payrollRun.findFirst({
      orderBy: { createdAt: "desc" },
      include: { period: true },
    });
    expect(latest).not.toBeNull();
    // Сброс финализации, если прогон был закрыт вручную (локальная БД после смоук-тестов).
    await prisma.payrollRun.update({
      where: { id: latest!.id },
      data: { status: "calculated", finalizedAt: null },
    });
    const run = latest;

    const result = await executePayrollRun(run!.id);
    expect(result.personsProcessed).toBeGreaterThan(0);
    expect(result.linesCreated).toBeGreaterThan(0);

    const n = await prisma.payrollLine.count({ where: { payrollRunId: run!.id } });
    expect(n).toBe(result.linesCreated);

    const mrotEval = await prisma.payrollLine.findFirst({
      where: { payrollRunId: run!.id, lineType: "MROT_EVALUATION" },
    });
    const mrotTop = await prisma.payrollLine.findFirst({
      where: { payrollRunId: run!.id, lineType: "MROT_TOPUP" },
    });
    expect(mrotEval !== null || mrotTop !== null).toBe(true);

    const updated = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run!.id } });
    expect(updated.settingsSnapshot).not.toBeNull();
    expect(updated.settingsSnapshot!.length).toBeGreaterThan(10);
  });
});
