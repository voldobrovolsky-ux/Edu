import { parseLadderBlock, signedAmount, type PayrollLineRow } from "@/lib/payroll/payroll-ladder";

/** Buckets aligned with Subsidy.paymentSource */
export type PaymentSourceBucket = "school_budget" | "regional_subsidy" | "grant" | "other";

export type FotLineInput = Pick<PayrollLineRow, "lineType" | "amount" | "direction" | "explanationJson"> & {
  personId: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const SOURCE_SET = new Set<string>(["school_budget", "regional_subsidy", "grant", "other"]);

/**
 * Infers payment source for a persisted line: prefers subsidy snapshot in explanationJson.details,
 * otherwise domain defaults (school budget for base pay / hourly / substitutions; regional for REGIONAL_SUBSIDY).
 */
export function inferPaymentSource(line: Pick<PayrollLineRow, "lineType" | "explanationJson">): PaymentSourceBucket {
  if (line.explanationJson) {
    try {
      const j = JSON.parse(line.explanationJson) as {
        details?: { paymentSource?: string | null };
      };
      const ps = j.details?.paymentSource;
      if (typeof ps === "string" && SOURCE_SET.has(ps)) {
        return ps as PaymentSourceBucket;
      }
    } catch {
      /* fall through */
    }
  }
  switch (line.lineType) {
    case "REGIONAL_SUBSIDY":
      return "regional_subsidy";
    case "MROT_EVALUATION":
      return "other";
    case "TOTAL":
      return "other";
    default:
      return "school_budget";
  }
}

export type RunFotAnalytics = {
  fotTotal: number;
  fixTotal: number;
  hourlyTotal: number;
  flexTotal: number;
  /** FIX_BASE — гарантированный оклад по ТД и т.п. */
  fixBaseTotal: number;
  baseHourlyTotal: number;
  pkTotal: number;
  prTotal: number;
  opTotal: number;
  substitutionTotal: number;
  bonusTotal: number;
  penaltyTotal: number;
  manualAdjustmentTotal: number;
  regionalSubsidyLineTotal: number;
  mrotTopUpTotal: number;
  /** MROT_EVALUATION — служебная оценка, в блоке Fix лестницы */
  mrotEvaluationTotal: number;
  schoolBudgetTotal: number;
  regionalSubsidyBySourceTotal: number;
  grantTotal: number;
  otherSourceTotal: number;
};

/** Сумма всех строк разбивки по lineType (без TOTAL) — должна совпадать с Fix+Почасовка+Flex и с ФОТ. */
export function sumLineTypeBreakdown(a: RunFotAnalytics): number {
  return roundMoney(
    a.fixBaseTotal +
      a.regionalSubsidyLineTotal +
      a.mrotTopUpTotal +
      a.mrotEvaluationTotal +
      a.baseHourlyTotal +
      a.pkTotal +
      a.prTotal +
      a.opTotal +
      a.substitutionTotal +
      a.bonusTotal +
      a.penaltyTotal +
      a.manualAdjustmentTotal,
  );
}

/** Run-level aggregates from persisted lines only (no engine). */
export function computeRunFotAnalytics(lines: FotLineInput[]): RunFotAnalytics {
  const out: RunFotAnalytics = {
    fotTotal: 0,
    fixTotal: 0,
    hourlyTotal: 0,
    flexTotal: 0,
    fixBaseTotal: 0,
    baseHourlyTotal: 0,
    pkTotal: 0,
    prTotal: 0,
    opTotal: 0,
    substitutionTotal: 0,
    bonusTotal: 0,
    penaltyTotal: 0,
    manualAdjustmentTotal: 0,
    regionalSubsidyLineTotal: 0,
    mrotTopUpTotal: 0,
    mrotEvaluationTotal: 0,
    schoolBudgetTotal: 0,
    regionalSubsidyBySourceTotal: 0,
    grantTotal: 0,
    otherSourceTotal: 0,
  };

  let fotTotal = 0;

  for (const ln of lines) {
    if (ln.lineType === "TOTAL") {
      fotTotal += signedAmount(ln);
    }
  }

  for (const ln of lines) {
    if (ln.lineType === "TOTAL") continue;

    const block = parseLadderBlock(ln);
    const s = signedAmount(ln);

    if (block === "fix") out.fixTotal = roundMoney(out.fixTotal + s);
    else if (block === "hourly") out.hourlyTotal = roundMoney(out.hourlyTotal + s);
    else if (block === "flex") out.flexTotal = roundMoney(out.flexTotal + s);

    switch (ln.lineType) {
      case "FIX_BASE":
        out.fixBaseTotal = roundMoney(out.fixBaseTotal + s);
        break;
      case "BASE_HOURLY_PAY":
        out.baseHourlyTotal = roundMoney(out.baseHourlyTotal + s);
        break;
      case "PK_HOURLY_ADDON":
        out.pkTotal = roundMoney(out.pkTotal + s);
        break;
      case "PR_HOURLY_ADDON":
        out.prTotal = roundMoney(out.prTotal + s);
        break;
      case "OP_HOURLY_ADDON":
        out.opTotal = roundMoney(out.opTotal + s);
        break;
      case "SUBSTITUTION_PAY":
        out.substitutionTotal = roundMoney(out.substitutionTotal + s);
        break;
      case "BONUS":
        out.bonusTotal = roundMoney(out.bonusTotal + s);
        break;
      case "PENALTY":
        out.penaltyTotal = roundMoney(out.penaltyTotal + s);
        break;
      case "MANUAL_ADJUSTMENT":
        out.manualAdjustmentTotal = roundMoney(out.manualAdjustmentTotal + s);
        break;
      case "REGIONAL_SUBSIDY":
        out.regionalSubsidyLineTotal = roundMoney(out.regionalSubsidyLineTotal + s);
        break;
      case "MROT_TOPUP":
        out.mrotTopUpTotal = roundMoney(out.mrotTopUpTotal + s);
        break;
      case "MROT_EVALUATION":
        out.mrotEvaluationTotal = roundMoney(out.mrotEvaluationTotal + s);
        break;
      default:
        break;
    }

    const src = inferPaymentSource(ln);
    if (src === "school_budget") out.schoolBudgetTotal = roundMoney(out.schoolBudgetTotal + s);
    else if (src === "regional_subsidy") out.regionalSubsidyBySourceTotal = roundMoney(out.regionalSubsidyBySourceTotal + s);
    else if (src === "grant") out.grantTotal = roundMoney(out.grantTotal + s);
    else out.otherSourceTotal = roundMoney(out.otherSourceTotal + s);
  }

  out.fotTotal = roundMoney(fotTotal);
  return out;
}

export type PersonFotRow = {
  personId: string;
  fullName: string;
  employmentType: string;
  workFormat: string;
  fix: number;
  hourly: number;
  flex: number;
  total: number;
};

export function computePersonFotRows(
  lines: Array<FotLineInput & { person?: { fullName: string; employmentType: string; workFormat: string } }>,
): PersonFotRow[] {
  const byPerson = new Map<string, FotLineInput[]>();
  const meta = new Map<string, { fullName: string; employmentType: string; workFormat: string }>();

  for (const ln of lines) {
    const list = byPerson.get(ln.personId) ?? [];
    list.push(ln);
    byPerson.set(ln.personId, list);
    if (ln.person) {
      meta.set(ln.personId, {
        fullName: ln.person.fullName,
        employmentType: ln.person.employmentType,
        workFormat: ln.person.workFormat,
      });
    }
  }

  const rows: PersonFotRow[] = [];

  for (const [personId, plines] of byPerson) {
    let fix = 0;
    let hourly = 0;
    let flex = 0;
    let total = 0;

    for (const ln of plines) {
      if (ln.lineType === "TOTAL") {
        total = signedAmount(ln);
        continue;
      }
      const block = parseLadderBlock(ln);
      const s = signedAmount(ln);
      if (block === "fix") fix = roundMoney(fix + s);
      else if (block === "hourly") hourly = roundMoney(hourly + s);
      else if (block === "flex") flex = roundMoney(flex + s);
    }

    const m = meta.get(personId);
    rows.push({
      personId,
      fullName: m?.fullName ?? personId,
      employmentType: m?.employmentType ?? "",
      workFormat: m?.workFormat ?? "",
      fix,
      hourly,
      flex,
      total,
    });
  }

  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  return rows;
}

export function pctOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
