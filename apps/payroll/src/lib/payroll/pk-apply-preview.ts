import { prisma } from "@/lib/db";
import { buildPkImpactPreview } from "@/lib/payroll/impact-preview";
import { getBaseHourRate, isOpHourlyPayEnabled, isPrHourlyPayEnabled } from "@/lib/settings-helpers";

export type PkApplyPreviewDto = {
  canApply: boolean;
  /** When false, UI hides the apply block */
  blockReason?: string;
  preview: ReturnType<typeof buildPkImpactPreview> | null;
  currentPeriodHours: number;
  periodLabel: string | null;
  runId: string | null;
  warning: string | null;
  currentPkCode: string | null;
  targetPkCode: string | null;
  baseHourRateUsed: number;
};

/**
 * Server-side PK apply preview: same hourly formula as payroll (base + PK + optional PR + OP).
 * Hours: sum of lesson hours for this person in the **latest draft** payroll run’s period; if none, 0 + warning.
 */
export async function loadPkApplyPreview(personId: string): Promise<PkApplyPreviewDto> {
  const empty = (blockReason: string): PkApplyPreviewDto => ({
    canApply: false,
    blockReason,
    preview: null,
    currentPeriodHours: 0,
    periodLabel: null,
    runId: null,
    warning: null,
    currentPkCode: null,
    targetPkCode: null,
    baseHourRateUsed: 0,
  });

  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      currentPK: { include: { addon: true } },
      recommendedPK: { include: { addon: true } },
      prLevel: { include: { addon: true } },
      opLevel: { include: { addon: true } },
    },
  });
  if (!person) return empty("Профиль не найден");

  const pending = await prisma.rateChangeRecommendation.findFirst({
    where: { personId, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { proposedPK: { include: { addon: true } } },
  });

  /** Сначала ожидающая рекомендация AI, затем поле «PK рекомендованный» на карточке — как в applyRecommendedPkInternal. */
  const targetLevelId = pending?.proposedPKLevelId ?? person.recommendedPKLevelId ?? null;
  const targetPk = pending?.proposedPK ?? person.recommendedPK ?? null;

  if (!person.currentPK || !targetLevelId || !targetPk) {
    return empty("Нет рекомендаций");
  }

  const openRun = await prisma.payrollRun.findFirst({
    where: { status: "draft" },
    orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
    include: { period: true },
  });

  let currentPeriodHours = 0;
  let periodLabel: string | null = null;
  let warning: string | null = null;

  if (openRun) {
    const rows = await prisma.hourEntry.findMany({
      where: { personId, year: openRun.period.year, month: openRun.period.month },
      include: { hourEventType: true },
    });
    currentPeriodHours = rows.reduce((s, e) => s + (e.hourEventType.countsTowardLoad ? Number(e.lessonHours) : 0), 0);
    periodLabel = `${openRun.period.label} · прогон draft`;
  } else {
    warning =
      "Нет открытого прогона (draft): для оценки дельты за период используется 0 учебных часов. Добавьте часы или создайте прогон.";
  }

  const baseN = await getBaseHourRate();
  const prOn = await isPrHourlyPayEnabled();
  const opOn = await isOpHourlyPayEnabled();
  const baseHourRateUsed = Number(person.baseHourRateOverride ?? baseN);

  const preview = buildPkImpactPreview({
    currentPkAddon: Number(person.currentPK.addon?.hourlyAddonRub ?? 0),
    newPkAddon: Number(targetPk.addon?.hourlyAddonRub ?? 0),
    currentPeriodHours,
    baseHourRate: baseHourRateUsed,
    prAddon: Number(person.prLevel?.addon?.hourlyAddonRub ?? 0),
    opAddon: Number(person.opLevel?.addon?.hourlyAddonRub ?? 0),
    prEnabled: prOn,
    opEnabled: opOn,
  });

  return {
    canApply: true,
    preview,
    currentPeriodHours,
    periodLabel,
    runId: openRun?.id ?? null,
    warning,
    currentPkCode: person.currentPK.code,
    targetPkCode: targetPk.code,
    baseHourRateUsed,
  };
}
