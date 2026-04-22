import { prisma } from "@/lib/db";
import { listPeopleForHourLogging } from "@/lib/payroll/person-queries";
import { syncEdumedStaffIntoPersonTable } from "@/lib/payroll/sync-edumed-users";

/**
 * Данные для экрана «Часы и замены»: только реальные сущности Prisma,
 * без демо-массивов. Те же источники, что и server actions в hours-actions.
 */
export async function loadHoursPageData() {
  await syncEdumedStaffIntoPersonTable(prisma);
  const [hours, subs, peopleForForms, hourEventTypes, finalizedRuns, payrollPeriods] = await Promise.all([
    prisma.hourEntry.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }, { personId: "asc" }],
      include: { person: true, hourEventType: true },
    }),
    prisma.substitutionEntry.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { substitutingPerson: true, replacedPerson: true, hourEventType: true },
    }),
    listPeopleForHourLogging(),
    prisma.hourEventType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.payrollRun.findMany({
      where: { OR: [{ status: "finalized" }, { finalizedAt: { not: null } }] },
      include: { period: true },
    }),
    prisma.payrollPeriod.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { year: true, month: true, label: true },
    }),
  ]);

  return {
    hours,
    subs,
    peopleForForms,
    hourEventTypes,
    finalizedRuns,
    payrollPeriods,
  };
}
