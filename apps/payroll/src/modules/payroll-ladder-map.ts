import type { LadderBlock, PayrollLineType } from "./types";

/** Группа «лестницы» по коду строки расчёта (совпадает с движком). */
export function ladderBlockForLineType(lineType: PayrollLineType | string): LadderBlock {
  switch (lineType) {
    case "FIX_BASE":
    case "REGIONAL_SUBSIDY":
    case "MROT_TOPUP":
    case "MROT_EVALUATION":
      return "fix";
    case "BASE_HOURLY_PAY":
    case "PK_HOURLY_ADDON":
    case "PR_HOURLY_ADDON":
    case "OP_HOURLY_ADDON":
      return "hourly";
    case "TOTAL":
      return "total";
    default:
      return "flex";
  }
}
