import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimetableConfig } from "../types/timetable.js";
import { getDocumentsFilesRoot } from "../store/documentStore.js";
import { writeJsonArrayFile, writeJsonFile } from "../store/jsonFileStore.js";
import { calendarEventStore } from "../store/calendarEventStore.js";
import { chatStore } from "../store/chatStore.js";
import { messengerStore } from "../store/messengerStore.js";
import { emptyMessengerState } from "../types/messenger.js";
import { classGroupStore } from "../store/classGroupStore.js";
import { classStore } from "../store/classStore.js";
import { disciplineStore } from "../store/disciplineStore.js";
import { documentFolderTreeStore } from "../store/documentFolderTreeStore.js";
import { documentSectionStore } from "../store/documentSectionStore.js";
import { documentStore } from "../store/documentStore.js";
import { journalDocumentTypeStore } from "../store/journalDocumentTypeStore.js";
import { journalLessonTypeStore } from "../store/journalLessonTypeStore.js";
import { journalStore } from "../store/journalStore.js";
import { methodPackStore } from "../store/methodPackStore.js";
import { parentChildStore } from "../store/parentChildStore.js";
import { quarterStore } from "../store/quarterStore.js";
import { studentProfileStore } from "../store/studentProfileStore.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import { timetableConfigStore } from "../store/timetableConfigStore.js";
import { timetableLessonStore } from "../store/timetableLessonStore.js";
import { timetableSlotStore } from "../store/timetableSlotStore.js";
import { userStore } from "../store/userStore.js";
import { revisionJobStore } from "../store/revisionJobStore.js";
import { botReplacementStore } from "../store/botReplacementStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = (name: string) => join(__dirname, "..", "..", "data", name);

const DEFAULT_TIMETABLE_CONFIG: TimetableConfig = {
  id: "timetable-config",
  defaultLessonMinutes: 45,
  dayStartTime: "08:00",
  workdayStartTime: "08:00",
  workdayEndTime: "16:00",
  lunchTime: "12:00",
  updatedAt: new Date().toISOString(),
};

function emptyUploadedFilesDirectory(): void {
  const root = getDocumentsFilesRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
    return;
  }
  for (const name of readdirSync(root)) {
    rmSync(join(root, name), { recursive: true, force: true });
  }
}

function writeEmptyDataFiles(): void {
  writeJsonArrayFile(dataFile("chats.json"), []);
  writeJsonFile(dataFile("messenger.json"), emptyMessengerState());
  writeJsonArrayFile(dataFile("journalLessonMarks.json"), []);
  writeJsonArrayFile(dataFile("journalLessonMeta.json"), []);
  writeJsonArrayFile(dataFile("timetableLessons.json"), []);
  writeJsonArrayFile(dataFile("timetableSlots.json"), []);
  writeJsonArrayFile(dataFile("disciplines.json"), []);
  writeJsonArrayFile(dataFile("documentFoldersTree.json"), []);
  writeJsonArrayFile(dataFile("documents.json"), []);
  writeJsonArrayFile(dataFile("documentSections.json"), []);
  writeJsonArrayFile(dataFile("parent-children.json"), []);
  writeJsonArrayFile(dataFile("teacherLoads.json"), []);
  writeJsonArrayFile(dataFile("students.json"), []);
  writeJsonArrayFile(dataFile("quarters.json"), []);
  writeJsonArrayFile(dataFile("classGroups.json"), []);
  writeJsonArrayFile(dataFile("classes.json"), []);
  writeJsonArrayFile(dataFile("calendarEvents.json"), []);
  writeJsonArrayFile(dataFile("journalDocumentTypes.json"), []);
  writeJsonArrayFile(dataFile("journalLessonTypes.json"), []);
  writeJsonArrayFile(dataFile("methodPacks.json"), []);
  writeJsonArrayFile(dataFile("revisionJobs.json"), []);
  writeJsonFile(dataFile("botReplacementSessions.json"), { sessions: [], prompts: [] });

  writeJsonFile(dataFile("timetableConfig.json"), {
    ...DEFAULT_TIMETABLE_CONFIG,
    updatedAt: new Date().toISOString(),
  });
}

function invalidateAllStoreCaches(): void {
  chatStore.invalidateCache();
  messengerStore.invalidateCache();
  disciplineStore.invalidateCache();
  timetableSlotStore.invalidateCache();
  calendarEventStore.invalidateCache();
  documentFolderTreeStore.invalidateCache();
  timetableLessonStore.invalidateCache();
  teacherLoadStore.invalidateCache();
  documentStore.invalidateCache();
  documentSectionStore.invalidateCache();
  parentChildStore.invalidateCache();
  quarterStore.invalidateCache();
  studentProfileStore.invalidateCache();
  classGroupStore.invalidateCache();
  classStore.invalidateCache();
  timetableConfigStore.invalidateCache();
  journalDocumentTypeStore.invalidateCache();
  journalLessonTypeStore.invalidateCache();
  methodPackStore.invalidateCache();
  journalStore.invalidateCache();
  revisionJobStore.invalidateCache();
  botReplacementStore.invalidateCache();
  userStore.invalidateCache();
}

/**
 * Удаляет пользовательские данные из JSON-хранилищ и файлов каталога документов,
 * оставляя одного bootstrap-админа `admin` (пароль `Admin123!`).
 */
export function clearAllApplicationData(): void {
  emptyUploadedFilesDirectory();
  writeEmptyDataFiles();
  userStore.resetToBootstrapOnly();
  invalidateAllStoreCaches();
}
