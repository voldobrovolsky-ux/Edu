import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, writeJsonFile } from "./jsonFileStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "..", "data", "timetableTeacherColors.json");

/** teacherUserId -> palette index 0..9 */
type TeacherColorsMap = Record<string, number>;

class TimetableTeacherColorsStore {
  private cache: TeacherColorsMap | null = null;

  get(): TeacherColorsMap {
    if (!this.cache) {
      const raw = readJsonFile<TeacherColorsMap | null>(DATA_PATH, {});
      this.cache = raw && typeof raw === "object" ? { ...raw } : {};
    }
    return { ...this.cache };
  }

  setAll(map: TeacherColorsMap): TeacherColorsMap {
    const next: TeacherColorsMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof k !== "string" || !k.trim()) continue;
      if (!Number.isInteger(v) || v < 0 || v > 9) continue;
      next[k] = v;
    }
    this.cache = next;
    writeJsonFile(DATA_PATH, next);
    return { ...next };
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export const timetableTeacherColorsStore = new TimetableTeacherColorsStore();
