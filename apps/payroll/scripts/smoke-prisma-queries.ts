/**
 * Smoke: Prisma accepts P0/P1 fields (run from edumed-payroll: npx tsx scripts/smoke-prisma-queries.ts)
 */
import { prisma } from "../src/lib/db";

async function main() {
  await prisma.payrollLine.findMany({
    take: 1,
    orderBy: [{ personId: "asc" }, { sortOrder: "asc" }],
  });

  await prisma.person.findMany({
    where: { canReceiveHourEntries: true },
    take: 1,
  });

  const run = await prisma.payrollRun.findFirst({
    select: { id: true, settingsSnapshot: true },
  });

  console.log("PASS: payrollLine.orderBy(sortOrder), person.where(canReceiveHourEntries), payrollRun.settingsSnapshot");
  if (run) console.log("  sample run settingsSnapshot length:", run.settingsSnapshot?.length ?? 0);
}

main()
  .catch((e) => {
    console.error("FAIL", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
