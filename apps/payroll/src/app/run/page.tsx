import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatPeriodYmRu } from "@/lib/display-labels";
import { FotPlanForm } from "@/components/FotPlanForm";
import { FotPlanVsFactCard } from "@/components/FotPlanVsFactCard";
import { PayrollFotAnalyticsSection } from "@/components/payroll/PayrollFotAnalyticsSection";
import { PayrollRunActionPanel } from "@/components/payroll/PayrollRunActionPanel";
import { PayrollRunInlineNotices } from "@/components/payroll/PayrollRunInlineNotices";
import { PayrollRunKpiStrip } from "@/components/payroll/PayrollRunKpiStrip";
import { PayrollRunPageHeader } from "@/components/payroll/PayrollRunPageHeader";
import { PayrollRunPersonDetailCard } from "@/components/payroll/PayrollRunPersonDetailCard";
import { PayrollRunPersonSummaryTable } from "@/components/payroll/PayrollRunPersonSummaryTable";
import { SectionCard } from "@/components/ui";
import { computePersonFotRows, computeRunFotAnalytics } from "@/lib/payroll/fot-analytics";
import { buildPlanVsFactView } from "@/lib/payroll/fot-plan-vs-fact";
import { buildMonthRunInfosForYear } from "@/lib/payroll/payroll-period-calendar";
import { enrichMonthTilesWithPlanFact } from "@/lib/payroll/fot-run-totals";
import { linesLinkedToEdumedAccounts } from "@/lib/payroll/payroll-line-filters";
import { syncEdumedStaffIntoPersonTable } from "@/lib/payroll/sync-edumed-users";
import { ensurePayrollPeriodsForYearRange } from "@/lib/payroll/ensure-payroll-periods";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; year?: string; month?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  let periodLabel: string | null = null;
  const yParam = sp.year ? parseInt(sp.year, 10) : NaN;
  const moParam = sp.month ? parseInt(sp.month, 10) : NaN;
  if (
    Number.isFinite(yParam) &&
    !Number.isNaN(yParam) &&
    Number.isFinite(moParam) &&
    !Number.isNaN(moParam) &&
    moParam >= 1 &&
    moParam <= 12
  ) {
    const p = await prisma.payrollPeriod.findFirst({ where: { year: yParam, month: moParam } });
    periodLabel = p?.label ?? formatPeriodYmRu(yParam, moParam);
  } else if (sp.run) {
    const run = await prisma.payrollRun.findUnique({
      where: { id: sp.run },
      include: { period: true },
    });
    periodLabel = run?.period.label ?? null;
  }
  return {
    title: periodLabel ? `${periodLabel} · Расчёт выплат` : "Расчёт выплат",
  };
}

export default async function PayrollRunPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; ok?: string; err?: string; year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const yParam = sp.year ? parseInt(sp.year, 10) : NaN;
  const moParam = sp.month ? parseInt(sp.month, 10) : NaN;

  const cy = new Date().getFullYear();
  await ensurePayrollPeriodsForYearRange(prisma, cy - 1, cy + 1);

  const periods = await prisma.payrollPeriod.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] });
  const runs = await prisma.payrollRun.findMany({
    orderBy: { createdAt: "desc" },
    include: { period: true },
    take: 50,
  });

  const periodFromQuery =
    Number.isFinite(yParam) &&
    !Number.isNaN(yParam) &&
    Number.isFinite(moParam) &&
    !Number.isNaN(moParam) &&
    moParam >= 1 &&
    moParam <= 12
      ? await prisma.payrollPeriod.findFirst({ where: { year: yParam, month: moParam } })
      : null;

  let activeRunId: string | null = sp.run ?? null;
  if (activeRunId) {
    const exists = await prisma.payrollRun.findUnique({ where: { id: activeRunId }, select: { id: true } });
    if (!exists) activeRunId = null;
  }
  if (!activeRunId && periodFromQuery) {
    const latest = await prisma.payrollRun.findFirst({
      where: { periodId: periodFromQuery.id },
      orderBy: { createdAt: "desc" },
    });
    activeRunId = latest?.id ?? null;
  }
  if (!activeRunId && !periodFromQuery) {
    activeRunId = runs[0]?.id ?? null;
  }

  const activeRun = activeRunId
    ? await prisma.payrollRun.findUnique({
        where: { id: activeRunId },
        include: { period: true },
      })
    : null;

  const periodForPlan = periodFromQuery ?? activeRun?.period ?? null;

  const fotPlanRow =
    periodForPlan &&
    (await prisma.fotPeriodPlan.findUnique({
      where: { periodId: periodForPlan.id },
    }));

  const calendarYear =
    activeRun?.period.year ??
    (Number.isFinite(yParam) && !Number.isNaN(yParam) ? yParam : new Date().getFullYear());

  const yearRunsForCalendar = await prisma.payrollRun.findMany({
    where: { period: { year: calendarYear } },
    include: { period: true },
    orderBy: { createdAt: "desc" },
  });
  const monthTiles = await enrichMonthTilesWithPlanFact(
    buildMonthRunInfosForYear(calendarYear, yearRunsForCalendar),
    calendarYear,
  );

  const selectedCalMonthFromUrl =
    Number.isFinite(moParam) && !Number.isNaN(moParam) && moParam >= 1 && moParam <= 12 ? moParam : undefined;
  const selectedCalMonth = selectedCalMonthFromUrl ?? activeRun?.period.month;
  const selectedCalYearFromUrl = Number.isFinite(yParam) && !Number.isNaN(yParam) ? yParam : undefined;
  const selectedCalYear = selectedCalYearFromUrl ?? activeRun?.period.year;

  const runsCountByPeriodId = new Map<string, number>();
  for (const r of runs) {
    runsCountByPeriodId.set(r.periodId, (runsCountByPeriodId.get(r.periodId) ?? 0) + 1);
  }
  const newRunPeriodOptions = periods.map((p) => ({
    periodId: p.id,
    label: p.label,
    hasRun: (runsCountByPeriodId.get(p.id) ?? 0) > 0,
  }));

  await syncEdumedStaffIntoPersonTable(prisma);

  const lineCount = activeRunId
    ? await prisma.payrollLine.count({ where: { payrollRunId: activeRunId } })
    : 0;

  const linesRaw = activeRunId
    ? await prisma.payrollLine.findMany({
        where: { payrollRunId: activeRunId },
        include: { person: true },
        orderBy: [{ personId: "asc" }, { sortOrder: "asc" }],
      })
    : [];

  const lines = linesLinkedToEdumedAccounts(linesRaw);
  const excludedLegacyLines = linesRaw.length - lines.length;

  const isFinalized = Boolean(activeRun?.finalizedAt || activeRun?.status === "finalized");
  const canFinalize =
    activeRun &&
    !isFinalized &&
    lineCount > 0 &&
    (activeRun.status === "calculated" || activeRun.status === "draft");

  const byPerson = new Map<string, typeof lines>();
  for (const ln of lines) {
    const list = byPerson.get(ln.personId) ?? [];
    list.push(ln);
    byPerson.set(ln.personId, list);
  }

  const fotLines = lines.map((ln) => ({
    personId: ln.personId,
    lineType: ln.lineType,
    amount: ln.amount,
    direction: ln.direction,
    explanationJson: ln.explanationJson,
    person: ln.person,
  }));
  const fotAnalytics = computeRunFotAnalytics(fotLines);
  const personFotRows = computePersonFotRows(fotLines);

  const totalByPerson = new Map(personFotRows.map((r) => [r.personId, r.total]));
  const sortedPersonEntries = [...byPerson.entries()].sort(
    (a, b) => (totalByPerson.get(b[0]) ?? 0) - (totalByPerson.get(a[0]) ?? 0),
  );

  const hasFactForPlan =
    Boolean(activeRun) &&
    Boolean(periodForPlan) &&
    activeRun!.periodId === periodForPlan!.id &&
    lines.length > 0 &&
    !activeRun?.calcError;

  const factRubForPlan = hasFactForPlan ? fotAnalytics.fotTotal : null;

  const planVsFactView = buildPlanVsFactView(
    fotPlanRow?.plannedFotTotal != null ? Number(fotPlanRow.plannedFotTotal) : null,
    factRubForPlan,
    fotPlanRow?.note ?? null,
  );

  const returnToQs = new URLSearchParams();
  if (sp.run) returnToQs.set("run", sp.run);
  if (sp.year) returnToQs.set("year", sp.year);
  if (sp.month) returnToQs.set("month", sp.month);
  const fotPlanReturnTo = `/run${returnToQs.toString() ? `?${returnToQs.toString()}` : ""}`;

  const fotRowByPerson = new Map(personFotRows.map((r) => [r.personId, r]));

  return (
    <div className="space-y-6">
      <PayrollRunPageHeader activeRun={activeRun} isFinalized={isFinalized} />

      <PayrollRunInlineNotices query={sp} />

      {activeRun?.settingsSnapshot && (
        <p className="text-[11px] leading-relaxed text-subtle-foreground">
          Снимок настроек на момент расчёта хранится в БД; строки не пересчитываются при смене глобальных ставок.
        </p>
      )}

      {activeRun?.calcError && !sp.err && (
        <div
          className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft/50 px-3 py-2.5 text-sm text-danger"
          role="alert"
        >
          <span className="mt-0.5 shrink-0 font-semibold" aria-hidden>
            !
          </span>
          <div>
            <span className="font-medium">Ошибка расчёта. </span>
            {activeRun.calcError}
          </div>
        </div>
      )}

      <PayrollRunActionPanel
        newRunPeriodOptions={newRunPeriodOptions}
        runs={runs}
        activeRunId={activeRunId}
        activeRun={activeRun}
        isFinalized={isFinalized}
        canFinalize={Boolean(canFinalize)}
        lineCount={lineCount}
        excludedLegacyLines={excludedLegacyLines}
        calendarYear={calendarYear}
        monthTiles={monthTiles}
        selectedCalYear={selectedCalYear}
        selectedCalMonth={selectedCalMonth}
      />

      {activeRunId && activeRun && (
        <>
          <PayrollRunKpiStrip analytics={fotAnalytics} planVsFact={periodForPlan ? planVsFactView : null} />

          {lines.length === 0 && !activeRun.calcError && (
            <p className="rounded-lg border border-warning/20 bg-warning-soft/30 px-3 py-2 text-xs text-foreground">
              {lineCount > 0
                ? "Все строки расчёта относятся к карточкам без привязки к учётной записи EDUMED и не показываются здесь. Синхронизируйте кадры из системы и выполните расчёт заново по привязанным педагогам."
                : "Нет строк расчёта — нажмите «Пересчитать» в блоке выше."}
            </p>
          )}

          <PayrollRunPersonSummaryTable periodLabel={activeRun.period.label} rows={personFotRows} />

          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Детализация по педагогам</h2>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                По убыванию итога. Расчётные детали — по раскрытию карточки.
              </p>
            </div>
            <div className="space-y-4">
              {sortedPersonEntries.map(([personId, plines]) => (
                <PayrollRunPersonDetailCard key={personId} personId={personId} lines={plines} fotRow={fotRowByPerson.get(personId)} />
              ))}
            </div>
          </div>

          {periodForPlan && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">План ФОТ периода</h2>
              <p className="mb-3 max-w-2xl text-xs text-muted-foreground">Отдельно от пересчёта прогона; влияет на блок «План и факт» в KPI.</p>
              <div className="grid gap-5 lg:grid-cols-2">
                <FotPlanForm
                  periodId={periodForPlan.id}
                  periodLabel={periodForPlan.label}
                  initialPlannedRub={fotPlanRow ? String(fotPlanRow.plannedFotTotal) : ""}
                  initialNote={fotPlanRow?.note ?? ""}
                  returnTo={fotPlanReturnTo}
                />
                <FotPlanVsFactCard view={planVsFactView} />
              </div>
            </div>
          )}

          <PayrollFotAnalyticsSection periodLabel={activeRun.period.label} analytics={fotAnalytics} />

          <SectionCard variant="quiet" title="Выгрузки CSV" description="UTF-8 с BOM · без пересчёта на выгрузке">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <div className="flex min-w-[10rem] flex-col gap-1">
                <a href={`/run/export/summary?runId=${encodeURIComponent(activeRunId)}`} className="edu-btn-ghost justify-start px-0 text-sm text-accent hover:underline">
                  Сводка по педагогам
                </a>
                <span className="text-[11px] text-muted-foreground">Агрегаты по людям</span>
              </div>
              <div className="flex min-w-[10rem] flex-col gap-1">
                <a href={`/run/export/lines?runId=${encodeURIComponent(activeRunId)}`} className="edu-btn-ghost justify-start px-0 text-sm text-accent hover:underline">
                  Строки (с TOTAL)
                </a>
                <span className="text-[11px] text-muted-foreground">Полный набор строк</span>
              </div>
              <div className="flex min-w-[10rem] flex-col gap-1">
                <a
                  href={`/run/export/lines?runId=${encodeURIComponent(activeRunId)}&includeTotal=0`}
                  className="edu-btn-ghost justify-start px-0 text-sm text-accent hover:underline"
                >
                  Строки без TOTAL
                </a>
                <span className="text-[11px] text-muted-foreground">Без агрегирующих строк по человеку</span>
              </div>
            </div>
            <p className="mt-4 font-mono text-[10px] text-subtle-foreground">payroll-summary-YYYY-MM.csv · payroll-lines-YYYY-MM.csv</p>
          </SectionCard>
        </>
      )}

      {!activeRunId && (
        <p className="text-xs text-muted-foreground">Расчёт не создан: создайте для периода или выберите в списке слева.</p>
      )}
    </div>
  );
}
