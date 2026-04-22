import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import multer from "multer";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { userStore } from "../store/userStore.js";
import { candidatesStore } from "../store/candidatesStore.js";
import { canAccessSchoolUserManagement } from "../auth/viewerRoles.js";
import { teacherLoadStore } from "../store/teacherLoadStore.js";
import type {
  CandidateApplication,
  CandidateFileCategory,
  CandidateFileMeta,
  CandidateStored,
} from "../types/candidates.js";
import type { CandidateHiringStage } from "../types/analytics.js";
import { getDocumentsFilesRoot } from "../store/documentStore.js";
import { isValidEmail, isValidPhone } from "../utils/profileValidation.js";
import { buildCandidateAnalyticsSnapshot, buildTeacherPatchFromCandidate } from "../services/teacherAnalytics.js";

export const candidatesRouter = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = join(__dirname, "..", "..", "data", "tmp");
if (!existsSync(TMP_ROOT)) mkdirSync(TMP_ROOT, { recursive: true });

type UploadedFile = Express.Multer.File;

function viewer(req: AuthedRequest): { viewerUserId: string } | null {
  const userId = req.auth?.userId;
  if (!userId) return null;
  const u = userStore.findById(userId);
  if (!u) return null;
  return { viewerUserId: u.id };
}

function canManageCandidates(req: AuthedRequest): boolean {
  const v = viewer(req);
  if (!v) return false;
  const u = userStore.findById(v.viewerUserId);
  return Boolean(u && canAccessSchoolUserManagement(u));
}

function safeExtFromMime(mimeType: string): string {
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "application/msword") return ".doc";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  return extname("file.bin");
}

function allowedMime(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png"
  );
}

const multerUpload = multer({
  dest: TMP_ROOT,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime(file.mimetype)) return cb(null, true);
    return cb(new Error("INVALID_CANDIDATE_FILE_TYPE"));
  },
});

type CategoryFieldName =
  | "avatarFiles"
  | "resumeFiles"
  | "diplomaFiles"
  | "lessonPlanFiles"
  | "portfolioFiles"
  | "noConvictionFiles"
  | "otherFiles";

const fieldToCategory: Record<CategoryFieldName, CandidateFileCategory> = {
  avatarFiles: "avatar",
  resumeFiles: "resume",
  diplomaFiles: "diploma",
  lessonPlanFiles: "lesson_plan",
  portfolioFiles: "portfolio",
  noConvictionFiles: "no_conviction",
  otherFiles: "other",
};

const uploadFields = multerUpload.fields([
  { name: "avatarFiles", maxCount: 1 },
  { name: "resumeFiles", maxCount: 5 },
  { name: "diplomaFiles", maxCount: 5 },
  { name: "lessonPlanFiles", maxCount: 3 },
  { name: "portfolioFiles", maxCount: 10 },
  { name: "noConvictionFiles", maxCount: 1 },
  { name: "otherFiles", maxCount: 10 },
]);

function validateCandidateApplication(application: any): { ok: true; value: CandidateApplication } | { ok: false; error: string } {
  if (!application || typeof application !== "object") return { ok: false, error: "INVALID_APPLICATION" };
  const contacts = (application as CandidateApplication).contacts;
  const role = (application as CandidateApplication).role;
  const education = (application as CandidateApplication).education;
  const teachingExperience = (application as CandidateApplication).teachingExperience;
  const subject = (application as CandidateApplication).subject;
  const standards = (application as CandidateApplication).standards;
  const starCases = (application as CandidateApplication).starCases;
  const conditions = (application as CandidateApplication).conditions;

  if (!contacts || typeof contacts !== "object") return { ok: false, error: "INVALID_CONTACTS" };
  if (typeof contacts.fullName !== "string" || !contacts.fullName.trim()) return { ok: false, error: "FULL_NAME_REQUIRED" };
  if (typeof contacts.email !== "string" || !isValidEmail(contacts.email)) return { ok: false, error: "EMAIL_REQUIRED_OR_INVALID" };
  if (typeof contacts.phone !== "string" || !isValidPhone(contacts.phone)) return { ok: false, error: "PHONE_REQUIRED_OR_INVALID" };
  if (typeof contacts.consentProcessing !== "boolean") return { ok: false, error: "CONSENT_REQUIRED" };

  if (!role || typeof role !== "object") return { ok: false, error: "INVALID_ROLE" };
  if (!Array.isArray(role.desiredLevels) || role.desiredLevels.length === 0) return { ok: false, error: "DESIRED_LEVELS_REQUIRED" };
  if (!Array.isArray(role.subjects) || role.subjects.length === 0) return { ok: false, error: "SUBJECTS_REQUIRED" };
  if (typeof role.employmentFormat !== "string") return { ok: false, error: "EMPLOYMENT_FORMAT_REQUIRED" };

  if (!education || typeof education !== "object") return { ok: false, error: "INVALID_EDUCATION" };
  if (typeof education.institutionName !== "string" || !education.institutionName.trim()) return { ok: false, error: "INSTITUTION_REQUIRED" };
  if (typeof education.specialtyText !== "string" || !education.specialtyText.trim()) return { ok: false, error: "SPECIALTY_REQUIRED" };

  if (!teachingExperience || typeof teachingExperience !== "object") return { ok: false, error: "INVALID_EXPERIENCE" };
  if (!Array.isArray(teachingExperience.agesWorked)) return { ok: false, error: "AGES_WORKED_REQUIRED" };

  if (!subject || typeof subject !== "object") return { ok: false, error: "INVALID_SUBJECT" };
  if (typeof subject.readyMiniTest !== "boolean") return { ok: false, error: "READY_MINI_TEST_REQUIRED" };

  if (!standards || typeof standards !== "object") return { ok: false, error: "INVALID_STANDARDS" };
  if (!Array.isArray(standards.experienceJournalCriteriaAnalyticsIom)) return { ok: false, error: "STANDARDS_EXPERIENCE_REQUIRED" };
  if (typeof standards.observationAttitude !== "string") return { ok: false, error: "OBSERVATION_ATTITUDE_REQUIRED" };

  if (!starCases || typeof starCases !== "object") return { ok: false, error: "INVALID_STAR_CASES" };
  if (!conditions || typeof conditions !== "object") return { ok: false, error: "INVALID_CONDITIONS" };

  return { ok: true, value: application as CandidateApplication };
}

function getStorageRelPath(args: { candidateId: string; filename: string }) {
  return `candidates/${args.candidateId}/${args.filename}`;
}

function ensureCandidateFilesDir(candidateId: string): string {
  const root = getDocumentsFilesRoot();
  const absDir = join(root, "candidates", candidateId);
  if (!existsSync(absDir)) mkdirSync(absDir, { recursive: true });
  return absDir;
}

function serializeCandidateForList(c: CandidateStored) {
  return {
    candidateId: c.candidateId,
    status: c.status,
    updatedAt: c.updatedAt,
    submittedAt: c.submittedAt ?? null,
    fio: c.application?.contacts.fullName ?? null,
    aboutMe: c.application?.teachingExperience.aboutMeText ?? null,
    keyWorkplaces: c.application?.teachingExperience.examplesResultsText ?? null,
    teachingSchoolExperience: c.application?.teachingExperience.teachingSchoolExperience ?? null,
    tutoringExperience: c.application?.teachingExperience.tutoringExperience ?? null,
    avatarUrl: (() => {
      const avatar = c.files.find((f) => f.category === "avatar");
      if (!avatar) return null;
      return `/files/${avatar.storageRelPath}`;
    })(),
    analytics: c.analytics ?? null,
  };
}

candidatesRouter.post("/",
  requireAuth,
  (req: AuthedRequest, res) => {
    if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
    const next = candidatesStore.createInvited();
    return res.status(201).json({ candidateId: next.candidateId });
  },
);

candidatesRouter.get("/", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const list = candidatesStore.list().map(serializeCandidateForList);
  return res.json({ candidates: list });
});

candidatesRouter.get("/:candidateId/details", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const candidateId = String(req.params.candidateId ?? "");
  if (!candidateId) return res.status(400).json({ error: "INVALID_CANDIDATE_ID" });
  const c = candidatesStore.findById(candidateId);
  if (!c) return res.status(404).json({ error: "NOT_FOUND" });

  return res.json({
    candidateId: c.candidateId,
    status: c.status,
    application: c.application ?? null,
    analytics: c.analytics ?? null,
    files: c.files.map((f) => ({
      id: f.id,
      category: f.category,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      storageRelPath: f.storageRelPath,
      url: `/files/${f.storageRelPath}`,
      createdAt: f.createdAt,
    })),
  });
});

candidatesRouter.delete("/:candidateId", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const candidateId = String(req.params.candidateId ?? "");
  if (!candidateId) return res.status(400).json({ error: "INVALID_CANDIDATE_ID" });

  const existing = candidatesStore.findById(candidateId);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  candidatesStore.deleteById(candidateId);

  // Удаляем все файлы кандидата (включая ранее загруженные изображения/документы).
  try {
    const absDir = join(getDocumentsFilesRoot(), "candidates", candidateId);
    rmSync(absDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return res.json({ ok: true });
});

candidatesRouter.post(
  "/:candidateId/submit",
  uploadFields,
  (req: AuthedRequest, res) => {
    const candidateId = String(req.params.candidateId ?? "");
    if (!candidateId) return res.status(400).json({ error: "INVALID_CANDIDATE_ID" });

    const applicationRaw = req.body?.application;
    if (applicationRaw == null) return res.status(400).json({ error: "APPLICATION_REQUIRED" });

    let applicationObj: any = null;
    try {
      if (typeof applicationRaw === "string") applicationObj = JSON.parse(applicationRaw);
      else applicationObj = applicationRaw;
    } catch {
      return res.status(400).json({ error: "INVALID_APPLICATION_JSON" });
    }

    const validated = validateCandidateApplication(applicationObj);
    if (!validated.ok) return res.status(400).json({ error: validated.error });

    const existing = candidatesStore.findById(candidateId);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

    const absDir = ensureCandidateFilesDir(candidateId);
    const files = req.files as Partial<Record<CategoryFieldName, UploadedFile[]>> | undefined;
    const storedFiles: CandidateFileMeta[] = [];

    for (const [field, meta] of Object.entries(fieldToCategory) as Array<[CategoryFieldName, CandidateFileCategory]>) {
      const arr = files?.[field] ?? [];
      for (const file of arr) {
        const ext = safeExtFromMime(file.mimetype);
        const storageFilename = `${randomUUID()}${ext}`;
        const absTarget = join(absDir, storageFilename);
        // multer already saved to tmp; move it to final
        if (file.path) renameSync(file.path, absTarget);

        const rel = getStorageRelPath({ candidateId, filename: storageFilename });
        storedFiles.push({
          id: randomUUID(),
          candidateId,
          category: meta,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageRelPath: rel,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const stored = candidatesStore.upsertApplication({
      candidateId,
      application: validated.value,
      files: storedFiles.map((f) => ({
        candidateId: f.candidateId,
        category: f.category,
        originalName: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        storageRelPath: f.storageRelPath,
      })),
      submittedAt: new Date().toISOString(),
    });

    if (!stored) return res.status(404).json({ error: "NOT_FOUND" });
    const analytics = buildCandidateAnalyticsSnapshot(stored);
    candidatesStore.updateById(candidateId, { analytics });
    return res.json({ ok: true, analytics });
  },
);

function isHiringStage(value: unknown): value is CandidateHiringStage {
  return (
    value === "new_application" ||
    value === "interview_scheduled" ||
    value === "interview_completed" ||
    value === "demo_completed" ||
    value === "offer_made" ||
    value === "hired" ||
    value === "rejected"
  );
}

candidatesRouter.post("/:candidateId/calculate-analytics", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const candidateId = String(req.params.candidateId ?? "");
  const candidate = candidatesStore.findById(candidateId);
  if (!candidate) return res.status(404).json({ error: "NOT_FOUND" });
  if (!candidate.application) return res.status(400).json({ error: "APPLICATION_REQUIRED" });
  const analytics = buildCandidateAnalyticsSnapshot(candidate);
  const updated = candidatesStore.updateById(candidateId, { analytics });
  return res.json({ candidate: updated });
});

candidatesRouter.patch("/:candidateId/analytics", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const candidateId = String(req.params.candidateId ?? "");
  const candidate = candidatesStore.findById(candidateId);
  if (!candidate) return res.status(404).json({ error: "NOT_FOUND" });

  const currentAnalytics = buildCandidateAnalyticsSnapshot(candidate);
  const patch = req.body ?? {};
  const next: NonNullable<CandidateStored["analytics"]> = {
    ...currentAnalytics,
    hiringStage: isHiringStage(patch.hiringStage) ? patch.hiringStage : currentAnalytics.hiringStage,
    desiredRoleOverride: patch.desiredRoleOverride === "teacher" ? "teacher" : null,
    interviewScoreDiscipline0to5:
      patch.interviewScoreDiscipline0to5 == null ? currentAnalytics.interviewScoreDiscipline0to5 : Number(patch.interviewScoreDiscipline0to5),
    interviewScoreParents0to5:
      patch.interviewScoreParents0to5 == null ? currentAnalytics.interviewScoreParents0to5 : Number(patch.interviewScoreParents0to5),
    demoLessonScore0to5: patch.demoLessonScore0to5 == null ? currentAnalytics.demoLessonScore0to5 : Number(patch.demoLessonScore0to5),
    artifactScore0to5: patch.artifactScore0to5 == null ? currentAnalytics.artifactScore0to5 : Number(patch.artifactScore0to5),
    artifactNotes: patch.artifactNotes == null ? currentAnalytics.artifactNotes : String(patch.artifactNotes),
  };
  next.recommendation = candidate.application ? buildCandidateAnalyticsSnapshot({ ...candidate, analytics: next }).recommendation : null;
  next.lastCalculatedAt = new Date().toISOString();
  const updated = candidatesStore.updateById(candidateId, { analytics: next });
  return res.json({ candidate: updated });
});

candidatesRouter.post("/:candidateId/hire", requireAuth, (req: AuthedRequest, res) => {
  if (!canManageCandidates(req)) return res.status(403).json({ error: "FORBIDDEN" });
  const candidateId = String(req.params.candidateId ?? "");
  const candidate = candidatesStore.findById(candidateId);
  if (!candidate) return res.status(404).json({ error: "NOT_FOUND" });
  if (!candidate.application) return res.status(400).json({ error: "APPLICATION_REQUIRED" });

  const analytics = candidate.analytics ?? buildCandidateAnalyticsSnapshot(candidate);
  if (!analytics.recommendation) return res.status(400).json({ error: "RECOMMENDATION_REQUIRED" });

  const fullName = candidate.application.contacts.fullName.trim().split(/\s+/);
  const lastName = fullName[0] ?? "Кандидат";
  const firstName = fullName[1] ?? "Новый";
  const patronymic = fullName.slice(2).join(" ") || "Педагог";
  const username = `teacher_${candidate.candidateId.replace(/-/g, "").slice(0, 8)}`;
  const tempPassword = `EduMed!${candidate.candidateId.replace(/-/g, "").slice(0, 8)}`;

  const createdTeacher = userStore.create({
    lastName,
    firstName,
    patronymic,
    username,
    passwordHash: bcrypt.hashSync(tempPassword, 10),
    primaryRole: "teacher",
    secondaryRoles: [],
  });

  const teacherPatch = buildTeacherPatchFromCandidate(candidate);
  userStore.updateById(createdTeacher.id, teacherPatch);
  teacherLoadStore.replaceByTeacher(createdTeacher.id, []);

  const updatedCandidate = candidatesStore.updateById(candidateId, {
    analytics: {
      ...analytics,
      hiringStage: "hired",
      hiredTeacherUserId: createdTeacher.id,
      hiredAt: new Date().toISOString(),
      lastCalculatedAt: new Date().toISOString(),
    },
  });

  return res.status(201).json({
    teacherUserId: createdTeacher.id,
    username,
    tempPassword,
    candidate: updatedCandidate,
    teacher: userStore.findById(createdTeacher.id),
  });
});

