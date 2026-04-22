import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { PayrollHomeWorkspace } from "@/components/dashboard/PayrollHomeWorkspace";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { computePersonFotRows, computeRunFotAnalytics } from "@/lib/payroll/fot-analytics";
import { linesLinkedToEdumedAccounts } from "@/lib/payroll/payroll-line-filters";
import { syncEdumedStaffIntoPersonTable } from "@/lib/payroll/sync-edumed-users";
import { ensurePayrollPeriodsForYearRange } from "@/lib/payroll/ensure-payroll-periods";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; err?: string }>;
}) {
  const sp = await searchParams;

  await syncEdumedStaffIntoPersonTable(prisma);

  const cy = new Date().getFullYear();
  await ensurePayrollPeriodsForYearRange(prisma, cy - 1, cy + 1);

  const latestPeriod = await prisma.payrollPeriod.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const currentRun = latestPeriod
    ? await prisma.payrollRun.findFirst({
        where: { periodId: latestPeriod.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const linesRaw =
    currentRun &&
    (await prisma.payrollLine.findMany({
      where: { payrollRunId: currentRun.id },
      include: { person: true },
      orderBy: [{ personId: "asc" }, { sortOrder: "asc" }],
    }));

  const lines = linesRaw ? linesLinkedToEdumedAccounts(linesRaw) : null;
  const excludedLegacyLines = linesRaw ? linesRaw.length - (lines?.length ?? 0) : 0;

  const fotLines = (lines ?? []).map((ln) => ({
    personId: ln.personId,
    lineType: ln.lineType,
    amount: ln.amount,
    direction: ln.direction,
    explanationJson: ln.explanationJson,
    person: ln.person,
  }));

  const runAnalytics = computeRunFotAnalytics(fotLines);
  /** Highest payouts first — operational scan; tie-break by name. */
  const personRows = computePersonFotRows(fotLines).sort(
    (a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName, "ru"),
  );

  const validIds = new Set(personRows.map((r) => r.personId));
  let selectedPersonId: string | null = null;
  if (sp.person && validIds.has(sp.person)) {
    selectedPersonId = sp.person;
  } else if (personRows.length > 0) {
    selectedPersonId = personRows[0].personId;
  }

  const periodDto = latestPeriod
    ? {
        id: latestPeriod.id,
        year: latestPeriod.year,
        month: latestPeriod.month,
        label: latestPeriod.label,
      }
    : null;

  const runDto = currentRun
    ? {
        id: currentRun.id,
        status: currentRun.status,
        finalizedAt: currentRun.finalizedAt,
        calculatedAt: currentRun.calculatedAt,
        calcError: currentRun.calcError,
      }
    : null;

  return (
    <div className="space-y-8">
      {sp.err ? (
        <InlineNotice variant="danger" title="Ошибка">
          {sp.err}
        </InlineNotice>
      ) : null}
      <PayrollHomeWorkspace
        period={periodDto}
        run={runDto}
        personRows={personRows}
        selectedPersonId={selectedPersonId}
        runFotTotal={runAnalytics.fotTotal}
        excludedLegacyLines={excludedLegacyLines}
      />

      {/* Demoted: secondary context below the workspace */}
      <section className="rounded-2xl border border-border/50 bg-elevated/60 px-4 py-4 sm:px-5">
        <h2 className="edu-section-title mb-3">Справочно и быстрые ссылки</h2>
        <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <SecondaryLink href="/people">Справочник людей</SecondaryLink>
            <span className="text-border">·</span>
            <SecondaryLink href="/orders">Приказы</SecondaryLink>
            <span className="text-border">·</span>
            <SecondaryLink href="/audit">Аудит</SecondaryLink>
            <span className="text-border">·</span>
            <SecondaryLink href="/settings/payroll">Настройки оплаты</SecondaryLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent hover:text-accent-hover hover:underline">
      {children}
    </Link>
  );
}
