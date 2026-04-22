import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "timetableVisualBlocks.json");

export type TimetableVisualBlockKind = "service" | "blocked";
export type TimetableVisualBlock = {
  id: string;
  weekStart: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  /** Минимальный класс в блоке (включительно). */
  grade: number;
  /** Максимальный класс в блоке (включительно). Если не задан — как `grade` (одна колонка). */
  gradeEnd: number;
  slotIndexStart: number;
  slotIndexEnd: number;
  label: string;
  colorIndex: number;
  kind: TimetableVisualBlockKind;
  serviceType: "lunch" | "walk" | "self_study" | "other" | null;
  serviceDescription: string | null;
  createdAt: string;
  updatedAt: string;
};

class TimetableVisualBlocksStore {
  private cache: TimetableVisualBlock[] | null = null;

  private normalize(raw: any): TimetableVisualBlock {
    const kind: TimetableVisualBlockKind = raw.kind === "blocked" ? "blocked" : "service";
    let g0 = Number(raw.grade ?? 0);
    let g1 = raw.gradeEnd != null ? Number(raw.gradeEnd) : g0;
    if (g1 < g0) [g0, g1] = [g1, g0];
    return {
      id: String(raw.id ?? randomUUID()),
      weekStart: String(raw.weekStart ?? ""),
      dayOfWeek: Math.min(5, Math.max(1, Number(raw.dayOfWeek ?? 1))) as 1 | 2 | 3 | 4 | 5,
      grade: g0,
      gradeEnd: g1,
      slotIndexStart: Number(raw.slotIndexStart ?? 1),
      slotIndexEnd: Number(raw.slotIndexEnd ?? 1),
      label: String(raw.label ?? "").trim() || "Блок",
      colorIndex: Number.isInteger(Number(raw.colorIndex)) ? Number(raw.colorIndex) : 0,
      kind,
      serviceType:
        kind === "service" && raw.serviceType != null
          ? (["lunch", "walk", "self_study", "other"].includes(String(raw.serviceType)) ? (raw.serviceType as any) : "other")
          : null,
      serviceDescription: raw.serviceDescription != null ? String(raw.serviceDescription) : null,
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      updatedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date().toISOString()),
    };
  }

  private all(): TimetableVisualBlock[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<any>(DATA_PATH);
      this.cache = Array.isArray(raw) ? raw.map((x) => this.normalize(x)) : [];
      writeJsonArrayFile(DATA_PATH, this.cache);
    }
    return this.cache!;
  }

  private save(items: TimetableVisualBlock[]): void {
    this.cache = items;
    writeJsonArrayFile(DATA_PATH, items);
  }

  listForWeek(weekStart: string, grades: number[]): TimetableVisualBlock[] {
    return this.all().filter(
      (b) => b.weekStart === weekStart && grades.some((g) => g >= b.grade && g <= b.gradeEnd),
    );
  }

  findById(id: string): TimetableVisualBlock | undefined {
    return this.all().find((b) => b.id === id);
  }

  /** Пересечение по дню, диапазону классов и диапазону номеров слотов (включительно). */
  overlaps(
    a: {
      weekStart: string;
      dayOfWeek: number;
      grade: number;
      gradeEnd: number;
      slotIndexStart: number;
      slotIndexEnd: number;
    },
    exceptId?: string,
  ): boolean {
    const aG0 = a.grade;
    const aG1 = a.gradeEnd;
    return this.all().some((b) => {
      if (exceptId && b.id === exceptId) return false;
      if (b.weekStart !== a.weekStart || b.dayOfWeek !== a.dayOfWeek) return false;
      const bG0 = b.grade;
      const bG1 = b.gradeEnd;
      const gradesOverlap = !(bG1 < aG0 || bG0 > aG1);
      const slotsOverlap = !(b.slotIndexEnd < a.slotIndexStart || b.slotIndexStart > a.slotIndexEnd);
      return gradesOverlap && slotsOverlap;
    });
  }

  create(input: Omit<TimetableVisualBlock, "id" | "createdAt" | "updatedAt">): TimetableVisualBlock {
    const now = new Date().toISOString();
    const item: TimetableVisualBlock = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.save([...this.all(), item]);
    return item;
  }

  updateById(
    id: string,
    patch: Partial<Pick<TimetableVisualBlock, "label" | "colorIndex" | "kind" | "serviceType" | "serviceDescription">>,
  ): TimetableVisualBlock {
    const current = this.all();
    const idx = current.findIndex((b) => b.id === id);
    if (idx < 0) throw new Error("VISUAL_BLOCK_NOT_FOUND");
    const prev = current[idx]!;
    const nextItem: TimetableVisualBlock = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = [...current.slice(0, idx), nextItem, ...current.slice(idx + 1)];
    this.save(next);
    return nextItem;
  }

  removeById(id: string): void {
    this.save(this.all().filter((b) => b.id !== id));
  }

  /** Удалить все визуальные блоки недели для указанных классов (или всю неделю, если grades пустой). */
  removeForWeekAndGrades(weekStart: string, grades?: number[]): void {
    if (grades && grades.length > 0) {
      this.save(
        this.all().filter((b) => {
          if (b.weekStart !== weekStart) return true;
          return !grades.some((g) => g >= b.grade && g <= b.gradeEnd);
        }),
      );
      return;
    }
    this.save(this.all().filter((b) => b.weekStart !== weekStart));
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const timetableVisualBlocksStore = new TimetableVisualBlocksStore();
