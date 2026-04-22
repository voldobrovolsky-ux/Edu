import { computeMrotTopup, sumCountedTowardMrot } from "./mrot-engine";
import { ladderBlockForLineType } from "./payroll-ladder-map";
import type {
  AdjustmentInput,
  ComputedPayrollLine,
  HourlyContext,
  PayrollCalculationResult,
  PayrollLineType,
  PayrollPersonInput,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Итоговая часовая ставка (руб/ч):
 *
 *   HourRate = BaseHour + PkAddon + (PR_addon if PR enabled) + (OP_addon if OP enabled) + otherHourlyAddons
 *
 * Правая часть задаётся в `HourlyContext` из глобальной базы, таблиц PK/PR/OP и override человека.
 * Замены считаются как SubHours × HourRate(substitute) — см. строку SUBSTITUTION_PAY.
 */
function hourRate(h: HourlyContext): number {
  return (
    h.effectiveBaseHourRate +
    h.pkHourlyAddon +
    h.prHourlyAddon +
    h.opHourlyAddon +
    h.otherHourlyAddons
  );
}

function pushLine(
  lines: ComputedPayrollLine[],
  line: Omit<ComputedPayrollLine, "amount" | "ladderBlock"> & { amount?: number },
): void {
  const amount = line.amount ?? round2(line.quantity * line.rate);
  const signed = line.direction === "minus" ? -Math.abs(amount) : Math.abs(amount);
  lines.push({
    ...line,
    ladderBlock: ladderBlockForLineType(line.lineType),
    amount: round2(Math.abs(signed)),
    direction: line.direction,
    mrotCountedAmount: line.mrotCountedAmount,
  });
}

/**
 * Разбивка начислений за период по одному человеку.
 *
 * - ТД (`labor_contract`): блок Fix (гарантия, региональные фиксы, МРОТ), почасовка (база+PK+PR+OP), Flex (замены, премии, корректировки), итог.
 * - Без ТД (`no_labor_contract`): без гарантии и без логики МРОТ (`applyMrot: false`).
 */
export function calculatePayrollForPerson(input: PayrollPersonInput): PayrollCalculationResult {
  const lines: ComputedPayrollLine[] = [];
  const {
    employmentType,
    hourly,
    lessonHoursPay,
    lessonHoursMrot,
    substitutionHoursPay,
    substitutionHoursMrot,
    guaranteedMonthlyFixRub,
    adjustments,
    applyMrot,
  } = input;

  const fullHourRate = hourRate(hourly);

  if (employmentType === "labor_contract" && guaranteedMonthlyFixRub > 0) {
    pushLine(lines, {
      lineType: "FIX_BASE",
      title: "Фиксированная часть по договору (месяц)",
      quantity: 1,
      rate: guaranteedMonthlyFixRub,
      amount: guaranteedMonthlyFixRub,
      direction: "plus",
      formulaText: `FIX = ${guaranteedMonthlyFixRub} ₽ × 1`,
      sourceReference: "employeeProfile.guaranteedMonthlyFixRub",
      countsTowardMrot: true,
      flexOrFix: "fix",
      explanation: { why: "Гарантированный оклад по трудовому договору.", details: { employmentType } },
    });
  }

  for (const adj of adjustments) {
    if (!adj.isFixComponent || adj.isHourly) continue;
    const amt = adj.amount;
    pushLine(lines, {
      lineType: "REGIONAL_SUBSIDY",
      title: adj.title,
      quantity: 1,
      rate: amt,
      amount: amt,
      direction: adj.direction,
      formulaText: `Субсидия/выплата «${adj.title}» = ${amt} ₽ (фикс за период)`,
      sourceReference: `adjustment:${adj.id}`,
      countsTowardMrot: adj.countsTowardMrot,
      flexOrFix: "fix",
      explanation: {
        why: "Ручная региональная выплата или обязательный платёж с признаком фикс.",
        details: {
          subsidyCode: adj.subsidyCode ?? null,
          paymentSource: adj.paymentSource ?? null,
          isMandatoryFix: true,
        },
      },
    });
  }

  const base = hourly.effectiveBaseHourRate;
  const pk = hourly.pkHourlyAddon;
  const pr = hourly.prHourlyAddon;
  const op = hourly.opHourlyAddon;

  if (lessonHoursPay > 0) {
    const basePay = round2(lessonHoursPay * base);
    const baseMrot = round2(lessonHoursMrot * base);
    const mrotCounts = lessonHoursMrot > 0 && baseMrot > 0;
    pushLine(lines, {
      lineType: "BASE_HOURLY_PAY",
      title: "Базовая ставка за учебный час",
      quantity: lessonHoursPay,
      rate: base,
      amount: basePay,
      direction: "plus",
      formulaText: `База × часы_оплата = ${base} × ${lessonHoursPay}`,
      sourceReference: "settings.baseHourRate / person.baseHourRateOverride",
      countsTowardMrot: mrotCounts,
      mrotCountedAmount: mrotCounts ? baseMrot : undefined,
      flexOrFix: "flex",
      explanation: {
        why: "Оплата по базовой ставке за часы (веса по типам событий в учёте часов).",
        details: { lessonHoursPay, lessonHoursMrot },
      },
    });
    if (pk !== 0) {
      const pkPay = round2(lessonHoursPay * pk);
      const pkMrot = round2(lessonHoursMrot * pk);
      const pkMrotCounts = lessonHoursMrot > 0 && pkMrot > 0;
      pushLine(lines, {
        lineType: "PK_HOURLY_ADDON",
        title: "Надбавка PK за учебный час",
        quantity: lessonHoursPay,
        rate: pk,
        amount: pkPay,
        direction: "plus",
        formulaText: `PK надбавка × часы_оплата = ${pk} × ${lessonHoursPay}`,
        sourceReference: "pkAddonRule.hourlyAddonRub",
        countsTowardMrot: pkMrotCounts,
        mrotCountedAmount: pkMrotCounts ? pkMrot : undefined,
        flexOrFix: "flex",
        explanation: { why: "PK — коэффициентный уровень; в деньгах выражается как рублёвая надбавка к часу.", details: {} },
      });
    }
    if (pr !== 0) {
      const prPay = round2(lessonHoursPay * pr);
      const prMrot = round2(lessonHoursMrot * pr);
      const prMrotCounts = lessonHoursMrot > 0 && prMrot > 0;
      pushLine(lines, {
        lineType: "PR_HOURLY_ADDON",
        title: "Надбавка PR (владение предметом)",
        quantity: lessonHoursPay,
        rate: pr,
        amount: prPay,
        direction: "plus",
        formulaText: `PR надбавка × часы_оплата = ${pr} × ${lessonHoursPay}`,
        sourceReference: "prAddonRule.hourlyAddonRub",
        countsTowardMrot: prMrotCounts,
        mrotCountedAmount: prMrotCounts ? prMrot : undefined,
        flexOrFix: "flex",
        explanation: { why: "Надстройка по уровню PR при включённой оплате.", details: {} },
      });
    }
    if (op !== 0) {
      const opPay = round2(lessonHoursPay * op);
      const opMrot = round2(lessonHoursMrot * op);
      const opMrotCounts = lessonHoursMrot > 0 && opMrot > 0;
      pushLine(lines, {
        lineType: "OP_HOURLY_ADDON",
        title: "Надбавка OP (опыт)",
        quantity: lessonHoursPay,
        rate: op,
        amount: opPay,
        direction: "plus",
        formulaText: `OP надбавка × часы_оплата = ${op} × ${lessonHoursPay}`,
        sourceReference: "opAddonRule.hourlyAddonRub",
        countsTowardMrot: opMrotCounts,
        mrotCountedAmount: opMrotCounts ? opMrot : undefined,
        flexOrFix: "flex",
        explanation: { why: "Надстройка по уровню OP при включённой оплате.", details: {} },
      });
    }
  }

  if (substitutionHoursPay > 0) {
    const subPayAmt = round2(substitutionHoursPay * fullHourRate);
    const subMrotAmt = round2(substitutionHoursMrot * fullHourRate);
    const subMrotCounts = substitutionHoursMrot > 0 && subMrotAmt > 0;
    pushLine(lines, {
      lineType: "SUBSTITUTION_PAY",
      title: "Замены (ставка замещающего)",
      quantity: substitutionHoursPay,
      rate: fullHourRate,
      amount: subPayAmt,
      direction: "plus",
      formulaText: `Замены: ставка ${fullHourRate} × ${substitutionHoursPay} ч_оплата`,
      sourceReference: "substitutionEntry.hours",
      countsTowardMrot: subMrotCounts,
      mrotCountedAmount: subMrotCounts ? subMrotAmt : undefined,
      flexOrFix: "flex",
      explanation: {
        why: "Замены оплачиваются по ставке замещающего педагога (тип события substitution).",
        details: {
          substitutionHoursPay,
          substitutionHoursMrot,
          hourRateUsed: fullHourRate,
        },
      },
    });
  }

  for (const adj of adjustments) {
    if (adj.isHourly) {
      const hrs = lessonHoursPay + substitutionHoursPay;
      const amt = round2(adj.amount * hrs);
      pushLine(lines, {
        lineType: "MANUAL_ADJUSTMENT",
        title: `${adj.title} (почасовая надбавка)`,
        quantity: hrs,
        rate: adj.amount,
        amount: amt,
        direction: adj.direction,
        formulaText: `${adj.amount} ₽/ч × (${lessonHoursPay} + ${substitutionHoursPay}) ч`,
        sourceReference: `adjustment:${adj.id}`,
        countsTowardMrot: adj.countsTowardMrot,
        flexOrFix: "flex",
        explanation: {
          why: "Ручная почасовая выплата по типу субсидии.",
          details: { subsidyCode: adj.subsidyCode, paymentSource: adj.paymentSource ?? null },
        },
      });
    } else if (!adj.isFixComponent && !adj.isHourly) {
      const isBonus = adj.title.toLowerCase().includes("прем") || adj.subsidyCode === "BONUS";
      const isPen = adj.title.toLowerCase().includes("штраф") || adj.subsidyCode === "PENALTY";
      const lt: PayrollLineType = isBonus ? "BONUS" : isPen ? "PENALTY" : "MANUAL_ADJUSTMENT";
      pushLine(lines, {
        lineType: lt,
        title: adj.title,
        quantity: 1,
        rate: adj.amount,
        amount: adj.amount,
        direction: adj.direction,
        formulaText: `${lt}: ${adj.amount} ₽`,
        sourceReference: `adjustment:${adj.id}`,
        countsTowardMrot: adj.countsTowardMrot,
        flexOrFix: "flex",
        explanation: {
          why: "Гибкая выплата или удержание за период.",
          details: { subsidyCode: adj.subsidyCode, paymentSource: adj.paymentSource ?? null },
        },
      });
    }
  }

  const countedParts = lines.map((l) => ({
    amount: l.amount,
    direction: l.direction,
    counts: l.countsTowardMrot,
    mrotAmount: l.mrotCountedAmount,
  }));
  const countedTowardMrotBeforeTopup = sumCountedTowardMrot(countedParts);

  let mrotShortfall = 0;
  if (employmentType === "labor_contract" && applyMrot && input.effectiveMrotMonthly > 0) {
    mrotShortfall = computeMrotTopup(countedTowardMrotBeforeTopup, input.effectiveMrotMonthly);
    if (mrotShortfall > 0) {
      pushLine(lines, {
        lineType: "MROT_TOPUP",
        title: "Доведение до МРОТ",
        quantity: 1,
        rate: mrotShortfall,
        amount: mrotShortfall,
        direction: "plus",
        formulaText: `max(0, МРОТ_eff (${input.effectiveMrotMonthly}) − учитываемые начисления (${countedTowardMrotBeforeTopup}))`,
        sourceReference: "mrot-engine.computeMrotTopup",
        countsTowardMrot: false,
        flexOrFix: "fix",
        explanation: {
          why: "Для трудового договора сумма начислений с признаком «учитывается в МРОТ» ниже эффективного МРОТ.",
          details: { effectiveMrot: input.effectiveMrotMonthly, countedBefore: countedTowardMrotBeforeTopup },
        },
      });
    } else {
      pushLine(lines, {
        lineType: "MROT_EVALUATION",
        title: "МРОТ: порог достигнут",
        quantity: 1,
        rate: 0,
        amount: 0,
        direction: "plus",
        formulaText: `${countedTowardMrotBeforeTopup} ≥ ${input.effectiveMrotMonthly} → доплата 0`,
        sourceReference: "mrot-engine.evaluate",
        countsTowardMrot: false,
        flexOrFix: "fix",
        explanation: {
          why: "Учитываемые к МРОТ начисления не ниже эффективного МРОТ за период.",
          details: { effectiveMrot: input.effectiveMrotMonthly, countedBefore: countedTowardMrotBeforeTopup },
        },
      });
    }
  }

  let total = 0;
  for (const l of lines) {
    total += l.direction === "plus" ? l.amount : -l.amount;
  }
  total = round2(total);

  pushLine(lines, {
    lineType: "TOTAL",
    title: "Итого к начислению",
    quantity: 1,
    rate: Math.abs(total),
    amount: Math.abs(total),
    direction: total >= 0 ? "plus" : "minus",
    formulaText: "Сумма всех строк с учётом направления plus/minus",
    sourceReference: "payroll-engine.calculatePayrollForPerson",
    countsTowardMrot: false,
    flexOrFix: "flex",
    explanation: { why: "Итоговая сумма по человеку за период.", details: { total } },
  });

  return {
    lines,
    totalAmount: total,
    countedTowardMrotBeforeTopup: round2(countedTowardMrotBeforeTopup),
    mrotShortfall,
  };
}

export { hourRate };
