import { inferPaymentSource } from "@/lib/payroll/fot-analytics";
import {
  groupLinesByLadder,
  parseLadderBlock,
  signedAmount,
  sumSigned,
  type PayrollLineRow,
} from "@/lib/payroll/payroll-ladder";
import type { Person } from "@/generated/prisma";

const UTF8_BOM = "\uFEFF";

function contractLabel(employmentType: string): string {
  if (employmentType === "labor_contract") return "ТД (трудовой договор)";
  if (employmentType === "no_labor_contract") return "Без ТД (почасовая)";
  return employmentType;
}

function workFormatLabel(workFormat: string): string {
  switch (workFormat) {
    case "staff":
      return "штат";
    case "part_time":
      return "совместительство";
    case "trainee":
      return "стажёр";
    default:
      return workFormat;
  }
}

export function csvEscape(field: string | number | boolean | null | undefined): string {
  const s = field === null || field === undefined ? "" : String(field);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type PersonForExport = Pick<Person, "id" | "fullName" | "employmentType" | "workFormat">;

export type PayrollLineForExport = PayrollLineRow & {
  personId: string;
  person: PersonForExport;
};

/** One row per person: Fix/Hourly/Flex from non-TOTAL lines by ladder block; Total from TOTAL line. */
export function buildPersonSummaryCsv(
  periodY: number,
  periodM: number,
  lines: PayrollLineForExport[],
): string {
  const period = periodLabel(periodY, periodM);
  const byPerson = new Map<string, PayrollLineForExport[]>();
  for (const ln of lines) {
    const list = byPerson.get(ln.personId) ?? [];
    list.push(ln);
    byPerson.set(ln.personId, list);
  }

  const rows: string[][] = [
    [
      "Период (YYYY-MM)",
      "ФИО",
      "Тип договора",
      "Формат занятости",
      "Фикс (руб.)",
      "Почасовка (руб.)",
      "Гибкие (руб.)",
      "Итого (руб.)",
    ],
  ];

  const sortedIds = [...byPerson.keys()].sort((a, b) => {
    const na = byPerson.get(a)![0].person.fullName;
    const nb = byPerson.get(b)![0].person.fullName;
    return na.localeCompare(nb, "ru");
  });

  for (const pid of sortedIds) {
    const plines = byPerson.get(pid)!;
    const person = plines[0].person;
    const grouped = groupLinesByLadder(plines);
    const fix = sumSigned(grouped.fix);
    const hourly = sumSigned(grouped.hourly);
    const flex = sumSigned(grouped.flex);
    const totalLine = grouped.total.find((l) => l.lineType === "TOTAL");
    const total = totalLine ? signedAmount(totalLine) : fix + hourly + flex;

    rows.push([
      period,
      person.fullName,
      contractLabel(person.employmentType),
      workFormatLabel(person.workFormat),
      String(fix),
      String(hourly),
      String(flex),
      String(total),
    ]);
  }

  return UTF8_BOM + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export type DetailedExportOptions = {
  /** When false, omit lines with lineType === TOTAL. Default true. */
  includeTotal: boolean;
};

/** One row per persisted PayrollLine. */
export function buildDetailedLinesCsv(
  periodY: number,
  periodM: number,
  lines: PayrollLineForExport[],
  options: DetailedExportOptions,
): string {
  const period = periodLabel(periodY, periodM);
  const filtered = options.includeTotal ? lines : lines.filter((l) => l.lineType !== "TOTAL");

  const rows: string[][] = [
    [
      "Период (YYYY-MM)",
      "ФИО",
      "Тип договора",
      "Формат занятости",
      "lineType",
      "ladderBlock",
      "title",
      "amount",
      "signedAmount",
      "countsTowardMrot",
      "paymentSource",
      "isFixOrFlex",
      "detailsJson",
    ],
  ];

  for (const ln of filtered) {
    const p = ln.person;
    const ladderBlock = parseLadderBlock(ln);
    const paySrc = inferPaymentSource(ln);
    rows.push([
      period,
      p.fullName,
      contractLabel(p.employmentType),
      workFormatLabel(p.workFormat),
      ln.lineType,
      ladderBlock,
      ln.title,
      ln.amount.toString(),
      String(signedAmount(ln)),
      ln.countsTowardMrot ? "true" : "false",
      paySrc,
      ln.flexOrFix,
      ln.explanationJson ?? "",
    ]);
  }

  return UTF8_BOM + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}
