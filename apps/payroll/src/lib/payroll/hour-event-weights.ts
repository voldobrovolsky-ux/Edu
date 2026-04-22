/** Суммы эффективных часов для оплаты и для МРОТ по строкам учёта. */
export type HourWeightTotals = { pay: number; mrot: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyWeights(): HourWeightTotals {
  return { pay: 0, mrot: 0 };
}

export function addLessonRow(
  acc: HourWeightTotals,
  lessonHours: number,
  payFactor: number,
  countsTowardMrot: boolean,
): HourWeightTotals {
  const pay = acc.pay + lessonHours * payFactor;
  const mrot = acc.mrot + (countsTowardMrot ? lessonHours : 0);
  return { pay: round2(pay), mrot: round2(mrot) };
}

export function addSubstitutionRow(
  acc: HourWeightTotals,
  hours: number,
  payFactor: number,
  countsTowardMrot: boolean,
): HourWeightTotals {
  return addLessonRow(acc, hours, payFactor, countsTowardMrot);
}
