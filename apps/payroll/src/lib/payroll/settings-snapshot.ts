import { prisma } from "@/lib/db";
import { getBaseHourRate, getLessonDurationMinutes, isOpHourlyPayEnabled, isPrHourlyPayEnabled } from "@/lib/settings-helpers";
import { getEffectiveMrotForPeriod } from "@/lib/payroll/mrot-lookup";

/** Снимок настроек на момент расчёта (JSON-serializable). */
export async function buildPayrollSettingsSnapshot(year: number, month: number): Promise<Record<string, unknown>> {
  const [baseHourRate, lessonDurationMinutes, prEnabled, opEnabled, pkLevels, prLevels, opLevels, subsidies, mrot] =
    await Promise.all([
      getBaseHourRate(),
      getLessonDurationMinutes(),
      isPrHourlyPayEnabled(),
      isOpHourlyPayEnabled(),
      prisma.pKLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
      prisma.pRLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
      prisma.oPLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
      prisma.subsidy.findMany({ orderBy: { code: "asc" } }),
      getEffectiveMrotForPeriod(year, month),
    ]);

  return {
    capturedAt: new Date().toISOString(),
    period: { year, month },
    baseHourRate,
    lessonDurationMinutes,
    prEnabled,
    opEnabled,
    pkTable: pkLevels.map((p) => ({
      code: p.code,
      hourlyAddonRub: p.addon ? Number(p.addon.hourlyAddonRub) : 0,
    })),
    prTable: prLevels.map((p) => ({
      code: p.code,
      hourlyAddonRub: p.addon ? Number(p.addon.hourlyAddonRub) : 0,
    })),
    opTable: opLevels.map((p) => ({
      code: p.code,
      hourlyAddonRub: p.addon ? Number(p.addon.hourlyAddonRub) : 0,
    })),
    subsidyTypes: subsidies.map((s) => ({
      code: s.code,
      name: s.name,
      isFixComponent: s.isFixComponent,
      countsTowardMrot: s.countsTowardMrot,
      isHourly: s.isHourly,
      isManual: s.isManual,
    })),
    mrot,
  };
}
