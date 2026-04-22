import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { buildPayrollSettingsSnapshot } from "@/lib/payroll/settings-snapshot";
import { getBaseHourRate, isOpHourlyPayEnabled, isPrHourlyPayEnabled } from "@/lib/settings-helpers";
import { getEffectiveMrotForPeriod } from "@/lib/payroll/mrot-lookup";
import { calculatePayrollForPerson } from "@/modules/payroll-engine";
import { writeAuditTx } from "@/modules/audit-service";
import type { AdjustmentInput, EmploymentType, PayrollPersonInput, WorkFormat } from "@/modules/types";
import { addLessonRow, addSubstitutionRow, emptyWeights, type HourWeightTotals } from "@/lib/payroll/hour-event-weights";

function toDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

export async function executePayrollRun(runId: string): Promise<{ personsProcessed: number; linesCreated: number }> {
  const run = await prisma.payrollRun.findUniqueOrThrow({
    where: { id: runId },
    include: { period: true },
  });

  if (run.status === "finalized" || run.finalizedAt) {
    throw new Error("Финализированный прогон нельзя пересчитывать");
  }

  const { year, month } = run.period;

  const mrotInfo = await getEffectiveMrotForPeriod(year, month);
  const effectiveMrot = mrotInfo.effectiveMrotMonthly;

  const snapshot = await buildPayrollSettingsSnapshot(year, month);
  const snapshotJson = JSON.stringify(snapshot);

  const baseRate = await getBaseHourRate();
  const prOn = await isPrHourlyPayEnabled();
  const opOn = await isOpHourlyPayEnabled();

  const hourRows = await prisma.hourEntry.findMany({
    where: { year, month },
    include: { hourEventType: true },
  });
  const lessonByPerson = new Map<string, HourWeightTotals>();
  for (const h of hourRows) {
    const cur = lessonByPerson.get(h.personId) ?? emptyWeights();
    lessonByPerson.set(
      h.personId,
      addLessonRow(cur, Number(h.lessonHours), Number(h.hourEventType.payFactor), h.hourEventType.countsTowardMrot),
    );
  }

  const subRows = await prisma.substitutionEntry.findMany({
    where: { year, month },
    include: { hourEventType: true },
  });
  const subByPerson = new Map<string, HourWeightTotals>();
  for (const s of subRows) {
    const cur = subByPerson.get(s.substitutingPersonId) ?? emptyWeights();
    subByPerson.set(
      s.substitutingPersonId,
      addSubstitutionRow(cur, Number(s.hours), Number(s.hourEventType.payFactor), s.hourEventType.countsTowardMrot),
    );
  }

  const adjustments = await prisma.adjustment.findMany({
    where: { year, month },
    include: { subsidyType: true },
  });
  const adjByPerson = new Map<string, typeof adjustments>();
  for (const a of adjustments) {
    const list = adjByPerson.get(a.personId) ?? [];
    list.push(a);
    adjByPerson.set(a.personId, list);
  }

  const people = await prisma.person.findMany({
    where: {
      status: { not: "archived" },
      isVisibleInAccounting: true,
    },
    include: {
      employeeProfile: true,
      currentPK: { include: { addon: true } },
      prLevel: { include: { addon: true } },
      opLevel: { include: { addon: true } },
    },
  });

  let linesCreated = 0;

  await prisma.$transaction(async (tx) => {
    await tx.payrollLine.deleteMany({ where: { payrollRunId: runId } });

    for (const person of people) {
      let personLineIndex = 0;
      const lw = lessonByPerson.get(person.id) ?? emptyWeights();
      const sw = subByPerson.get(person.id) ?? emptyWeights();
      const guaranteed = Number(person.employeeProfile?.guaranteedMonthlyFixRub ?? 0);

      const adjList = adjByPerson.get(person.id) ?? [];
      const adjInputs: AdjustmentInput[] = adjList.map((a) => ({
        id: a.id,
        title: a.title,
        amount: Number(a.amount),
        direction: a.direction as "plus" | "minus",
        subsidyCode: a.subsidyType?.code ?? null,
        isFixComponent: a.subsidyType?.isFixComponent ?? false,
        countsTowardMrot: a.subsidyType?.countsTowardMrot ?? false,
        isHourly: a.subsidyType?.isHourly ?? false,
        isManual: a.subsidyType?.isManual ?? true,
        paymentSource: a.subsidyType?.paymentSource ?? null,
      }));

      const pkAddon = Number(person.currentPK?.addon?.hourlyAddonRub ?? 0);
      const prAddon = prOn ? Number(person.prLevel?.addon?.hourlyAddonRub ?? 0) : 0;
      const opAddon = opOn ? Number(person.opLevel?.addon?.hourlyAddonRub ?? 0) : 0;

      const input: PayrollPersonInput = {
        personId: person.id,
        fullName: person.fullName,
        employmentType: person.employmentType as EmploymentType,
        workFormat: person.workFormat as WorkFormat,
        lessonHoursPay: lw.pay,
        lessonHoursMrot: lw.mrot,
        substitutionHoursPay: sw.pay,
        substitutionHoursMrot: sw.mrot,
        guaranteedMonthlyFixRub: person.employmentType === "labor_contract" ? guaranteed : 0,
        hourly: {
          effectiveBaseHourRate: Number(person.baseHourRateOverride ?? baseRate),
          pkHourlyAddon: pkAddon,
          prHourlyAddon: prAddon,
          opHourlyAddon: opAddon,
          otherHourlyAddons: 0,
        },
        adjustments: adjInputs,
        effectiveMrotMonthly: effectiveMrot,
        applyMrot: person.employmentType === "labor_contract",
      };

      const result = calculatePayrollForPerson(input);

      for (const line of result.lines) {
        await tx.payrollLine.create({
          data: {
            payrollRunId: runId,
            personId: person.id,
            lineType: line.lineType,
            sortOrder: personLineIndex++,
            title: line.title,
            quantity: toDec(line.quantity),
            rate: toDec(line.rate),
            amount: toDec(line.amount),
            direction: line.direction,
            formulaText: line.formulaText,
            sourceReference: line.sourceReference,
            countsTowardMrot: line.countsTowardMrot,
            flexOrFix: line.flexOrFix,
            explanationJson: JSON.stringify({
              ...line.explanation,
              ladderBlock: line.ladderBlock,
            }),
          },
        });
        linesCreated++;
      }
    }

    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "calculated",
        calculatedAt: new Date(),
        calcError: null,
        settingsSnapshot: snapshotJson,
      },
    });

    await writeAuditTx(tx, {
      entityType: "PayrollRun",
      entityId: runId,
      action: "RECALCULATE_PAYROLL_RUN",
      before: null,
      after: {
        personsProcessed: people.length,
        linesCreated,
        period: { year, month },
        outcome: "success",
      },
      actorRole: "system_admin",
      reason: null,
      outcome: "success",
    });
  });

  console.info("[payroll] executePayrollRun", {
    runId,
    period: { year, month },
    personsProcessed: people.length,
    linesCreated,
  });

  return { personsProcessed: people.length, linesCreated };
}
