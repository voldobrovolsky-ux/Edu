/**
 * MROT: суммирует учитываемые суммы и вычисляет недостаток до эффективного минимума.
 */
export function sumCountedTowardMrot(
  amounts: { amount: number; direction: "plus" | "minus"; counts: boolean; mrotAmount?: number }[],
): number {
  let s = 0;
  for (const a of amounts) {
    if (!a.counts) continue;
    const amt = a.mrotAmount !== undefined ? a.mrotAmount : a.amount;
    s += a.direction === "plus" ? amt : -amt;
  }
  return Math.round(s * 100) / 100;
}

export function computeMrotTopup(countedTowardMrot: number, effectiveMrotMonthly: number): number {
  if (countedTowardMrot >= effectiveMrotMonthly) return 0;
  return Math.round((effectiveMrotMonthly - countedTowardMrot) * 100) / 100;
}
