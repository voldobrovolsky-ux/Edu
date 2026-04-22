import Link from "next/link";
import { prisma } from "@/lib/db";
import { FotPlanForm } from "@/components/FotPlanForm";
import { FotPlanVsFactCard } from "@/components/FotPlanVsFactCard";
import { PayrollPeriodCalendar } from "@/components/PayrollPeriodCalendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { SectionCard } from "@/components/ui/SectionCard";
import { RunStatusBadge } from "@/components/ui/StatusBadge";
import { buildPlanVsFactView } from "@/lib/payroll/fot-plan-vs-fact";
import { buildMonthRunInfosForYear } from "@/lib/payroll/payroll-period-calendar";
import { enrichMonthTilesWithPlanFact, getFotTotalsByRunIds } from "@/lib/payroll/fot-run-totals";

export default async function PayrollCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const selectedMonth = sp.month ? parseInt(sp.month, 10) : undefined;

  const runs = await prisma.payrollRun.findMany({
    where: { period: { year } },
    include: { period: true },
    orderBy: { createdAt: "desc" },
  });

  const months = await enrichMonthTilesWithPlanFact(buildMonthRunInfosForYear(year, runs), year);

  const detail =
    selectedMonth !== undefined && selectedMonth >= 1 && selectedMonth <= 12 ? months[selectedMonth - 1] : null;

  const detailPeriod =
    selectedMonth !== undefined && selectedMonth >= 1 && selectedMonth <= 12
      ? await prisma.payrollPeriod.findFirst({ where: { year, month: selectedMonth } })
      : null;

  const detailPlan = detailPeriod ? await prisma.fotPeriodPlan.findUnique({ where: { periodId: detailPeriod.id } }) : null;

  let detailFact: number | null = null;
  if (detail?.run?.id) {
    const m = await getFotTotalsByRunIds([detail.run.id]);
    detailFact = m.get(detail.run.id) ?? null;
  }

  const detailPlanVsFactView = detailPeriod
    ? buildPlanVsFactView(
        detailPlan?.plannedFotTotal != null ? Number(detailPlan.plannedFotTotal) : null,
        detailFact,
        detailPlan?.note ?? null,
      )
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Календарь расчётных периодов"
        description="Обзор года: статус прогона, план/факт ФОТ по месяцам. Переход к расчёту ЗП — клик по плитке."
        actions={
          <Link href="/run" className="edu-btn-primary">
            Расчёт ЗП
          </Link>
        }
      />

      {sp.ok === "fotplan" && (
        <InlineNotice variant="success" title="Сохранено">
          План ФОТ записан; данные учтены в план/факт и аудите.
        </InlineNotice>
      )}
      {sp.err && <InlineNotice variant="danger">{sp.err}</InlineNotice>}

      <SectionCard title={`${year} год`} description="Навигация по годам — в шапке сетки. Выбранный в отчёте месяц подсвечивается кольцом.">
        <PayrollPeriodCalendar
          year={year}
          months={months}
          selectedYear={detail?.year}
          selectedMonth={detail?.month}
        />
      </SectionCard>

      {detail && detailPeriod && (
        <SectionCard
          title={`Детали: ${String(detail.month).padStart(2, "0")}.${detail.year}`}
          description="План ФОТ, сравнение с фактом и быстрый переход к последнему прогону."
        >
          {detail.run ? (
            <ul className="mb-6 space-y-2 text-sm text-foreground">
              <li className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Статус прогона:</span>
                <RunStatusBadge status={detail.run.status} finalized={Boolean(detail.run.finalizedAt)} />
                <Link className="edu-link text-sm" href={`/run?run=${detail.run.id}`}>
                  Открыть расчёт →
                </Link>
              </li>
              {detail.run.calculatedAt && (
                <li className="text-muted-foreground">
                  Расчёт: {detail.run.calculatedAt.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })}
                </li>
              )}
              {detail.run.finalizedAt && (
                <li className="text-muted-foreground">
                  Финализация: {detail.run.finalizedAt.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })}
                </li>
              )}
              {!detail.run.calculatedAt && !detail.run.finalizedAt && (
                <li className="text-muted-foreground">Даты расчёта/финализации ещё не зафиксированы.</li>
              )}
            </ul>
          ) : (
            <p className="mb-6 text-sm text-muted-foreground">
              За этот месяц нет прогона. Создайте прогон на странице «Расчёт ЗП».
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <FotPlanForm
              periodId={detailPeriod.id}
              periodLabel={detailPeriod.label}
              initialPlannedRub={detailPlan ? String(detailPlan.plannedFotTotal) : ""}
              initialNote={detailPlan?.note ?? ""}
              returnTo={`/calendar?year=${year}${selectedMonth ? `&month=${selectedMonth}` : ""}`}
            />
            {detailPlanVsFactView ? <FotPlanVsFactCard view={detailPlanVsFactView} /> : null}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Закрепить детализацию: добавьте к URL{" "}
            <code className="rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[11px]">?month={selectedMonth}</code> (например,
            ссылка из отчёта).
          </p>
        </SectionCard>
      )}
    </div>
  );
}
