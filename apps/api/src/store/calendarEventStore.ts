import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CalendarEvent } from "../types/calendar.js";
import { readJsonArrayFile, writeJsonArrayFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "calendarEvents.json");

class CalendarEventStore {
  private cache: CalendarEvent[] | null = null;

  private all(): CalendarEvent[] {
    if (!this.cache) {
      const raw = readJsonArrayFile<CalendarEvent>(DATA_PATH);
      this.cache = raw.map((event) => ({
        ...event,
        kind: event.kind ?? "general",
        serviceType: event.serviceType ?? null,
        analytics: event.analytics ?? null,
      }));
    }
    return this.cache;
  }

  listByDateRange(args: { from: string; to: string }): CalendarEvent[] {
    const { from, to } = args;
    return this.all()
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
  }

  listByDate(date: string): CalendarEvent[] {
    return this.all().filter((e) => e.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  findById(id: string): CalendarEvent | undefined {
    return this.all().find((e) => e.id === id);
  }

  create(args: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">): CalendarEvent {
    const now = new Date().toISOString();
    const item: CalendarEvent = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...args,
    };
    const next = [...this.all(), item];
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return item;
  }

  update(id: string, patch: Partial<Omit<CalendarEvent, "id" | "createdAt">>): CalendarEvent {
    const current = this.all();
    const existing = current.find((e) => e.id === id);
    if (!existing) throw new Error("NOT_FOUND");
    const nextItem: CalendarEvent = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const next = current.map((e) => (e.id === id ? nextItem : e));
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
    return nextItem;
  }

  remove(id: string): void {
    const current = this.all();
    const next = current.filter((e) => e.id !== id);
    this.cache = next;
    writeJsonArrayFile(DATA_PATH, next);
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const calendarEventStore = new CalendarEventStore();

