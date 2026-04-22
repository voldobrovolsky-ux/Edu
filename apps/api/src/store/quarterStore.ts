import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

export type QuarterPeriod = {
  index: 1 | 2 | 3 | 4;
  startDate: string;
  endDate: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "quarters.json");

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

class QuarterStore {
  private cache: QuarterPeriod[] | null = null;

  private all(): QuarterPeriod[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<any>(DATA_PATH);
      const normalized = (raw ?? [])
        .map((item: any, idx: number) => ({
          index: Number(item.index ?? idx + 1) as 1 | 2 | 3 | 4,
          startDate: String(item.startDate ?? ""),
          endDate: String(item.endDate ?? ""),
        }))
        .filter((q) => q.index >= 1 && q.index <= 4 && isIsoDate(q.startDate) && isIsoDate(q.endDate));
      this.cache = normalized;
    }
    return this.cache;
  }

  list(): QuarterPeriod[] {
    return [...this.all()].sort((a, b) => a.index - b.index);
  }

  replace(periods: QuarterPeriod[]): QuarterPeriod[] {
    if (!Array.isArray(periods) || periods.length !== 4) throw new Error("FOUR_QUARTERS_REQUIRED");
    const sorted = [...periods].sort((a, b) => a.index - b.index);
    for (const q of sorted) {
      if (!isIsoDate(q.startDate) || !isIsoDate(q.endDate)) throw new Error("INVALID_DATE");
      if (q.endDate < q.startDate) throw new Error("INVALID_RANGE");
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1]!.endDate >= sorted[i]!.startDate) throw new Error("OVERLAPPING_QUARTERS");
    }
    this.cache = sorted;
    writeJsonArrayFile(DATA_PATH, sorted);
    return sorted;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const quarterStore = new QuarterStore();
