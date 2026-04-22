import express from "express";
import cors from "cors";
import path from "node:path";
import { authRouter } from "./routes/auth.js";
import { getProfileFilesRoot } from "./store/profileFilesRoot.js";
import { configRouter } from "./routes/config.js";
import { schoolRouter } from "./routes/school.js";
import { methospaceRouter } from "./routes/methospace.js";
import { teacherLoadsRouter } from "./routes/teacherLoads.js";
import { timetableRouter } from "./routes/timetable.js";
import { calendarRouter } from "./routes/calendar.js";
import { journalRouter } from "./routes/journal.js";
import { diaryRouter } from "./routes/diary.js";
import { analyticsRouter } from "./routes/analytics.js";
import { financeClientRouter } from "./routes/financeClient.js";
import { getDocumentsFilesRoot } from "./store/documentStore.js";
import { getMessengerFilesRoot } from "./store/messengerFilesRoot.js";
import { documentsRouter } from "./routes/documents.js";
import { adminUsersRouter } from "./routes/adminUsers.js";
import { candidatesRouter } from "./routes/candidates.js";
import { chatsRouter } from "./routes/chats.js";
import { startRevisionBotScheduler } from "./services/revisionBotScheduler.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader("Content-Language", "ru");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
});

// централизованное файловое хранилище документов (GENERAL DESCRIPTION §3.7)
const staticUtf8Headers = (res: express.Response, filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (ext === ".txt") res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (ext === ".csv") res.setHeader("Content-Type", "text/csv; charset=utf-8");
  if (ext === ".html") res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (ext === ".svg") res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
};

app.use("/files", express.static(getDocumentsFilesRoot(), { setHeaders: staticUtf8Headers }));
// В некоторых сборках/прокси файлы раздаются только через `/api/*`.
// Размещаем дубликат эндпоинта, чтобы предпросмотр/новая вкладка работали стабильно.
app.use("/api/files", express.static(getDocumentsFilesRoot(), { setHeaders: staticUtf8Headers }));
app.use("/messenger-files", express.static(getMessengerFilesRoot(), { setHeaders: staticUtf8Headers }));
app.use("/profile-files", express.static(getProfileFilesRoot(), { setHeaders: staticUtf8Headers }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "edumed-api", version: "0.1.0" });
});

app.use("/api/auth", authRouter);
app.use("/api/config", configRouter);
app.use("/api/school", schoolRouter);
app.use("/api/methospace", methospaceRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/teacher-loads", teacherLoadsRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/journal", journalRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/finance", financeClientRouter);
app.use("/api/admin", adminUsersRouter);
app.use("/api/candidates", candidatesRouter);
app.use("/api/chats", chatsRouter);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`EDUMED API listening on http://127.0.0.1:${PORT}`);
  startRevisionBotScheduler();
});
