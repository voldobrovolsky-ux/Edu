import type { LadderBlock } from "@/modules/types";
import { ladderBlockForLineType } from "@/modules/payroll-ladder-map";
import type { Prisma } from "@/generated/prisma";

export type PayrollLineRow = {
  id: string;
  lineType: string;
  title: string;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  amount: Prisma.Decimal;
  direction: string;
  formulaText: string;
  countsTowardMrot: boolean;
  flexOrFix: string;
  explanationJson: string | null;
};

export function parseLadderBlock(line: Pick<PayrollLineRow, "lineType" | "explanationJson">): LadderBlock {
  if (line.explanationJson) {
    try {
      const j = JSON.parse(line.explanationJson) as { ladderBlock?: LadderBlock };
      if (j.ladderBlock && ["fix", "hourly", "flex", "total"].includes(j.ladderBlock)) {
        return j.ladderBlock;
      }
    } catch {
      /* fall through */
    }
  }
  return ladderBlockForLineType(line.lineType);
}

export function signedAmount(line: Pick<PayrollLineRow, "amount" | "direction">): number {
  const n = Number(line.amount);
  return line.direction === "minus" ? -n : n;
}

export function groupLinesByLadder(lines: PayrollLineRow[]): Record<LadderBlock, PayrollLineRow[]> {
  const out: Record<LadderBlock, PayrollLineRow[]> = {
    fix: [],
    hourly: [],
    flex: [],
    total: [],
  };
  for (const ln of lines) {
    const b = parseLadderBlock(ln);
    out[b].push(ln);
  }
  return out;
}

export function sumSigned(lines: PayrollLineRow[]): number {
  return Math.round(lines.reduce((s, l) => s + signedAmount(l), 0) * 100) / 100;
}
