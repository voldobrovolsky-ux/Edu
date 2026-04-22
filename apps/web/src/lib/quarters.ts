export type QuarterRange = { index: 1 | 2 | 3 | 4; startDate: string; endDate: string };

export function isoDateToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function pickQuarterForDate(quarters: QuarterRange[], date: string): QuarterRange | null {
  if (quarters.length === 0) return null;
  const current = quarters.find((quarter) => quarter.startDate <= date && date <= quarter.endDate);
  if (current) return current;

  let nearest = quarters[0]!;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const targetTime = new Date(`${date}T00:00:00`).getTime();
  for (const quarter of quarters) {
    const startTime = new Date(`${quarter.startDate}T00:00:00`).getTime();
    const endTime = new Date(`${quarter.endDate}T00:00:00`).getTime();
    const distance = Math.min(Math.abs(targetTime - startTime), Math.abs(targetTime - endTime));
    if (distance < nearestDistance) {
      nearest = quarter;
      nearestDistance = distance;
    }
  }
  return nearest;
}
