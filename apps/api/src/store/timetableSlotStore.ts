import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimetableSlotPattern, TimetableSlotPatternKind, TimetableServiceType } from "../types/timetable.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "timetableSlots.json");

class TimetableSlotStore {
  private cache: TimetableSlotPattern[] | null = null;

  private normalize(raw: any): TimetableSlotPattern {
    return {
      id: String(raw.id ?? randomUUID()),
      dayOfWeek: Math.min(5, Math.max(1, Number(raw.dayOfWeek ?? 1))) as 1 | 2 | 3 | 4 | 5,
      weekStart: typeof raw.weekStart === "string" ? raw.weekStart : null,
      slotIndexStart: Number(raw.slotIndexStart ?? raw.index ?? 1),
      slotIndexEnd: Number(raw.slotIndexEnd ?? raw.index ?? raw.slotIndexStart ?? 1),
      kind: (raw.kind === "service" ? "service" : "lesson") as TimetableSlotPatternKind,
      serviceType: raw.serviceType ?? null,
      serviceDescription: raw.serviceDescription ?? null,
      blockLabel: raw.blockLabel != null ? String(raw.blockLabel) : null,
      blockColorIndex:
        raw.blockColorIndex != null && Number.isInteger(Number(raw.blockColorIndex)) ? Number(raw.blockColorIndex) : null,
      isActive: typeof raw.isActive === "boolean" ? raw.isActive : Number(raw.slotIndexStart ?? raw.index ?? 1) <= 2,
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      updatedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date().toISOString()),
    };
  }

  private createDefaultGrid(): TimetableSlotPattern[] {
    const now = new Date().toISOString();
    const items: TimetableSlotPattern[] = [];
    for (let dayOfWeek = 1 as const; dayOfWeek <= 5; dayOfWeek++) {
      for (let slotIndex = 1; slotIndex <= 15; slotIndex++) {
        items.push({
          id: randomUUID(),
          dayOfWeek: dayOfWeek as 1 | 2 | 3 | 4 | 5,
          weekStart: null,
          slotIndexStart: slotIndex,
          slotIndexEnd: slotIndex,
          kind: "lesson",
          serviceType: null,
          serviceDescription: null,
          isActive: slotIndex <= 2,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return items;
  }

  private save(items: TimetableSlotPattern[]): void {
    this.cache = items;
    writeJsonArrayFile(DATA_PATH, items);
  }

  private all(): TimetableSlotPattern[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<any>(DATA_PATH);
      const normalized = (raw ?? []).map((item: any) => this.normalize(item));
      const data = normalized.length > 0 ? normalized : this.createDefaultGrid();
      this.save(data);
    }
    return this.cache!;
  }

  list(): TimetableSlotPattern[] {
    return [...this.all()].sort((a, b) =>
      a.dayOfWeek === b.dayOfWeek
        ? a.slotIndexStart - b.slotIndexStart || (a.weekStart ?? "").localeCompare(b.weekStart ?? "")
        : a.dayOfWeek - b.dayOfWeek,
    );
  }

  private listRawByDay(dayOfWeek: number, weekStart?: string | null): TimetableSlotPattern[] {
    return this.list().filter((item) => item.dayOfWeek === dayOfWeek && (weekStart === undefined ? true : (item.weekStart ?? null) === weekStart));
  }

  private sortDay(items: TimetableSlotPattern[]): TimetableSlotPattern[] {
    return [...items].sort((a, b) => a.slotIndexStart - b.slotIndexStart);
  }

  private cloneDefaultsForWeek(dayOfWeek: number, weekStart: string): TimetableSlotPattern[] {
    const defaults = this.listRawByDay(dayOfWeek, null);
    const now = new Date().toISOString();
    const clones = defaults.map((item) => ({
      ...item,
      id: randomUUID(),
      weekStart,
      createdAt: now,
      updatedAt: now,
    }));
    this.save([...this.all(), ...clones]);
    return clones;
  }

  private ensureWeekDayEditable(dayOfWeek: number, weekStart?: string | null): TimetableSlotPattern[] {
    if (!weekStart) return this.listRawByDay(dayOfWeek, null);
    const existing = this.listRawByDay(dayOfWeek, weekStart);
    if (existing.length > 0) return existing;
    return this.cloneDefaultsForWeek(dayOfWeek, weekStart);
  }

  private ensureEditableSlot(id: string, weekStart?: string | null): TimetableSlotPattern {
    const found = this.findById(id);
    if (!found) throw new Error("SLOT_PATTERN_NOT_FOUND");
    if (!weekStart || (found.weekStart ?? null) === weekStart) return found;
    const editableDay = this.ensureWeekDayEditable(found.dayOfWeek, weekStart);
    const cloned = editableDay.find(
      (item) => item.slotIndexStart === found.slotIndexStart && item.slotIndexEnd === found.slotIndexEnd,
    );
    if (!cloned) throw new Error("SLOT_PATTERN_NOT_FOUND");
    return cloned;
  }

  listByDay(dayOfWeek: number, weekStart?: string | null): TimetableSlotPattern[] {
    const effective =
      weekStart && this.listRawByDay(dayOfWeek, weekStart).length > 0
        ? this.listRawByDay(dayOfWeek, weekStart)
        : this.listRawByDay(dayOfWeek, null);
    return this.sortDay(effective.filter((item) => item.isActive !== false));
  }

  findById(id: string): TimetableSlotPattern | undefined {
    return this.all().find((item) => item.id === id);
  }

  findLessonByDayAndSlot(args: { dayOfWeek: number; slotIndex: number; weekStart?: string | null }): TimetableSlotPattern | undefined {
    return this.listByDay(args.dayOfWeek, args.weekStart).find(
      (item) => item.kind === "lesson" && args.slotIndex >= item.slotIndexStart && args.slotIndex <= item.slotIndexEnd,
    );
  }

  updateById(args: {
    id: string;
    weekStart?: string | null;
    kind?: TimetableSlotPatternKind;
    serviceType?: TimetableServiceType | null;
    serviceDescription?: string | null;
    blockLabel?: string | null;
    blockColorIndex?: number | null;
  }): TimetableSlotPattern {
    const found = this.ensureEditableSlot(args.id, args.weekStart);
    const current = this.all();
    const kind = args.kind ?? found.kind;
    const serviceType = kind === "service" ? (args.serviceType ?? found.serviceType ?? "other") : null;
    const serviceDescription = kind === "service" && serviceType === "other" ? args.serviceDescription ?? found.serviceDescription ?? null : null;
    const blockLabel = args.blockLabel !== undefined ? args.blockLabel : found.blockLabel ?? null;
    const blockColorIndex =
      args.blockColorIndex !== undefined
        ? args.blockColorIndex
        : found.blockColorIndex !== undefined
          ? found.blockColorIndex
          : null;
    const updated: TimetableSlotPattern = {
      ...found,
      kind,
      serviceType,
      serviceDescription,
      blockLabel,
      blockColorIndex: blockColorIndex != null && Number.isInteger(blockColorIndex) ? blockColorIndex : null,
      updatedAt: new Date().toISOString(),
    };
    this.save(current.map((item) => (item.id === found.id ? updated : item)));
    return updated;
  }

  mergeRangeToEndIndex(firstId: string, weekStart: string | null | undefined, endSlotIndex: number): TimetableSlotPattern {
    let current = this.ensureEditableSlot(firstId, weekStart ?? null);
    if (current.slotIndexEnd > endSlotIndex) throw new Error("INVALID_MERGE_RANGE");
    while (current.slotIndexEnd < endSlotIndex) {
      current = this.mergeWithRight(current.id, weekStart ?? null);
    }
    return current;
  }

  mergeWithRight(id: string, weekStart?: string | null): TimetableSlotPattern {
    const found = this.ensureEditableSlot(id, weekStart);
    const current = this.all();
    if (found.kind !== "lesson") throw new Error("ONLY_LESSON_CAN_BE_MERGED");
    if (found.slotIndexStart !== found.slotIndexEnd) throw new Error("ALREADY_MERGED");
    const dayItems = this.ensureWeekDayEditable(found.dayOfWeek, found.weekStart ?? weekStart ?? null);
    const right = dayItems.find(
      (item) =>
        item.isActive !== false &&
        item.dayOfWeek === found.dayOfWeek &&
        item.slotIndexStart === found.slotIndexEnd + 1 &&
        item.slotIndexStart === item.slotIndexEnd &&
        item.kind === "lesson",
    );
    if (!right) throw new Error("RIGHT_NEIGHBOR_NOT_FOUND");
    const next = current
      .filter((item) => item.id !== right.id)
      .map((item) =>
        item.id === found.id
          ? {
              ...item,
              slotIndexEnd: right.slotIndexEnd,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
    this.save(next);
    return this.findById(found.id)!;
  }

  split(id: string, weekStart?: string | null): TimetableSlotPattern[] {
    const found = this.ensureEditableSlot(id, weekStart);
    const current = this.all();
    if (found.slotIndexStart === found.slotIndexEnd) return [found];
    const now = new Date().toISOString();
    const chunks: TimetableSlotPattern[] = [];
    for (let index = found.slotIndexStart; index <= found.slotIndexEnd; index++) {
      chunks.push({
        id: index === found.slotIndexStart ? found.id : randomUUID(),
        dayOfWeek: found.dayOfWeek,
        weekStart: found.weekStart ?? null,
        slotIndexStart: index,
        slotIndexEnd: index,
        kind: "lesson",
        serviceType: null,
        isActive: true,
        createdAt: index === found.slotIndexStart ? found.createdAt : now,
        updatedAt: now,
      });
    }
    const next = [...current.filter((item) => item.id !== found.id), ...chunks];
    this.save(next);
    return chunks.sort((a, b) => a.slotIndexStart - b.slotIndexStart);
  }

  listGroupedByDay(): Record<string, TimetableSlotPattern[]> {
    const grouped: Record<string, TimetableSlotPattern[]> = { "1": [], "2": [], "3": [], "4": [], "5": [] };
    for (const item of this.list().filter((entry) => (entry.weekStart ?? null) === null && entry.isActive !== false)) {
      grouped[String(item.dayOfWeek)]!.push(item);
    }
    return grouped;
  }

  createNextForDay(dayOfWeek: 1 | 2 | 3 | 4 | 5, weekStart?: string | null): TimetableSlotPattern {
    const editable = this.ensureWeekDayEditable(dayOfWeek, weekStart ?? null);
    const current = this.all();
    const active = editable.filter((item) => item.isActive !== false);
    const nextIndex = (active.length > 0 ? Math.max(...active.map((item) => item.slotIndexEnd)) : 0) + 1;
    if (nextIndex > 15) throw new Error("MAX_SLOTS_REACHED");
    const inactiveExisting = editable.find((item) => item.slotIndexStart === nextIndex && item.slotIndexEnd === nextIndex);
    if (inactiveExisting) {
      const updated: TimetableSlotPattern = { ...inactiveExisting, isActive: true, updatedAt: new Date().toISOString() };
      this.save(current.map((item) => (item.id === inactiveExisting.id ? updated : item)));
      return updated;
    }
    const item: TimetableSlotPattern = {
      id: randomUUID(),
      dayOfWeek,
      weekStart: weekStart ?? null,
      slotIndexStart: nextIndex,
      slotIndexEnd: nextIndex,
      kind: "lesson",
      serviceType: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.save([...current, item]);
    return item;
  }

  deactivateById(id: string, weekStart?: string | null): TimetableSlotPattern {
    const found = this.ensureEditableSlot(id, weekStart);
    const current = this.all();
    const updated: TimetableSlotPattern = {
      ...found,
      isActive: false,
      kind: "lesson",
      serviceType: null,
      updatedAt: new Date().toISOString(),
    };
    this.save(current.map((item) => (item.id === found.id ? updated : item)));
    return updated;
  }

  hasWeekOverrides(weekStart: string): boolean {
    return this.all().some((item) => item.weekStart === weekStart && item.isActive !== false);
  }

  copyWeekPatterns(sourceWeekStart: string | null, targetWeekStart: string): TimetableSlotPattern[] {
    const current = this.all();
    const next = current.filter((item) => item.weekStart !== targetWeekStart);
    const source = this.list()
      .filter((item) => (item.weekStart ?? null) === sourceWeekStart)
      .map((item) => ({
        ...item,
        id: randomUUID(),
        weekStart: targetWeekStart,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    this.save([...next, ...source]);
    return source;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Разбивает все паттерны с slotIndexStart !== slotIndexEnd на одиночные слоты.
   * Нужно для сетки, где каждая строка — один номер урока; визуальное объединение — отдельная сущность.
   */
  splitAllMergedPatterns(): void {
    const items = this.all();
    const merged = items.filter((item) => item.isActive !== false && item.slotIndexStart !== item.slotIndexEnd);
    for (const m of merged) {
      try {
        this.split(m.id, m.weekStart ?? null);
      } catch {
        /* ignore */
      }
    }
  }
}

export const timetableSlotStore = new TimetableSlotStore();

