import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimetableConfig } from "../types/timetable.js";
import { readJsonFile, writeJsonFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "timetableConfig.json");

const DEFAULT_CONFIG: TimetableConfig = {
  id: "timetable-config",
  defaultLessonMinutes: 45,
  dayStartTime: "08:00",
  // Значения по умолчанию для вкладки "Рабочее расписание" (методическое пространство).
  // При необходимости их всегда можно переопределить через UI.
  workdayStartTime: "08:00",
  workdayEndTime: "16:00",
  lunchTime: "12:00",
  updatedAt: new Date().toISOString(),
};

class TimetableConfigStore {
  private cache: TimetableConfig | null = null;

  get(): TimetableConfig {
    if (!this.cache) {
      const cfg = readJsonFile<TimetableConfig>(DATA_PATH, DEFAULT_CONFIG);
      this.cache = { ...DEFAULT_CONFIG, ...cfg, id: "timetable-config" };
    }
    return this.cache;
  }

  update(
    args: Partial<
      Pick<
        TimetableConfig,
        | "defaultLessonMinutes"
        | "dayStartTime"
        | "workdayStartTime"
        | "workdayEndTime"
        | "lunchTime"
        | "lessonTimesBySlotIndex"
      >
    >,
  ): TimetableConfig {
    const current = this.get();
    const next: TimetableConfig = {
      ...current,
      ...args,
      id: "timetable-config",
      updatedAt: new Date().toISOString(),
    };
    this.cache = next;
    writeJsonFile(DATA_PATH, next);
    return next;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const timetableConfigStore = new TimetableConfigStore();

