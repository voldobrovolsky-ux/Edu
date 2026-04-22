import { prisma } from "@/lib/db";
import { buildDetailedLinesCsv } from "@/lib/payroll/payroll-export-csv";
import { linesLinkedToEdumedAccounts } from "@/lib/payroll/payroll-line-filters";
import { type NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId")?.trim();
  if (!runId) {
    return new Response("Missing runId", { status: 400 });
  }

  const includeTotalParam = req.nextUrl.searchParams.get("includeTotal");
  const includeTotal =
    includeTotalParam === null ||
    includeTotalParam === "" ||
    includeTotalParam === "1" ||
    includeTotalParam.toLowerCase() === "true";

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { period: true },
  });
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  const linesRaw = await prisma.payrollLine.findMany({
    where: { payrollRunId: runId },
    include: { person: true },
    orderBy: [{ personId: "asc" }, { sortOrder: "asc" }],
  });
  const lines = linesLinkedToEdumedAccounts(linesRaw);

  const csv = buildDetailedLinesCsv(run.period.year, run.period.month, lines, { includeTotal });
  const filename = `payroll-lines-${run.period.year}-${String(run.period.month).padStart(2, "0")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
