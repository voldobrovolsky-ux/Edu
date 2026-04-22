import type { DocumentationRevisionPayload, JournalRevisionPayload, RevisionJob } from "../types/revisionJobs.js";
import { revisionJobStore } from "../store/revisionJobStore.js";
import { runDocumentationRevision } from "./documentationRevisionRun.js";
import { runJournalRevision } from "./journalRevisionRun.js";
import { userStore } from "../store/userStore.js";
import { runReplacementEscalationTick } from "./botReplacementStateMachine.js";

const INTERVAL_MS = 30_000;

function processDueJobs(): void {
  const now = new Date().toISOString();
  const due = revisionJobStore.listDuePending(now);
  for (const job of due) {
    revisionJobStore.updateStatus(job.id, { status: "processing" });
    try {
      if (job.payload.kind === "documentation") {
        runDocumentationRevision(job as RevisionJob & { payload: DocumentationRevisionPayload });
      } else if (job.payload.kind === "journal") {
        runJournalRevision(job as RevisionJob & { payload: JournalRevisionPayload });
      } else {
        throw new Error("UNKNOWN_JOB_PAYLOAD");
      }
      revisionJobStore.updateStatus(job.id, { status: "done", finishedAt: new Date().toISOString() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      revisionJobStore.updateStatus(job.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        errorMessage: msg,
      });
    }
  }
}

function processReplacementEscalations(): void {
  const bot = userStore.findSystemBot();
  if (!bot) return;
  runReplacementEscalationTick(bot.id);
}

export function startRevisionBotScheduler(): void {
  setInterval(() => {
    try {
      processDueJobs();
      processReplacementEscalations();
    } catch {
      // ignore
    }
  }, INTERVAL_MS);
  setTimeout(() => {
    try {
      processDueJobs();
      processReplacementEscalations();
    } catch {
      // ignore
    }
  }, 3_000);
}
