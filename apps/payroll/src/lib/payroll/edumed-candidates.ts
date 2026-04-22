import fs from "fs";
import path from "path";

/** Данные кандидатов основного EDUMED — тот же файл, что пишет `candidatesStore` (QR / анкета). */
export type CandidateFileMeta = {
  category: string;
  storageRelPath: string;
  originalName?: string;
};

type CandidateAnalyticsSnapshot = {
  desiredRoleOverride?: "teacher" | null;
  hiringStage?: string;
  recommendation?: {
    allowedRole?: "teacher" | "assistant_intern";
    branchTitle?: string;
    startCategory?: string;
    recommendedRateMin?: number | null;
    recommendedRateMax?: number | null;
    explanation?: string;
    assignmentWarning?: string | null;
  } | null;
} | null;

type CandidateApplication = {
  contacts?: { fullName?: string };
  role?: { employmentFormat?: "staff" | "part_time" | "internship" };
};

type CandidateStored = {
  candidateId: string;
  status: string;
  updatedAt: string;
  submittedAt?: string | null;
  application?: unknown;
  files: CandidateFileMeta[];
  analytics?: CandidateAnalyticsSnapshot;
};

function resolveCandidatesJsonPath(): string | null {
  const env = process.env.EDUMED_CANDIDATES_JSON_PATH?.trim();
  if (env && fs.existsSync(env)) return env;
  const fromPayroll = path.resolve(process.cwd(), "..", "api", "data", "candidates.json");
  if (fs.existsSync(fromPayroll)) return fromPayroll;
  const fromRepoRoot = path.resolve(process.cwd(), "apps", "api", "data", "candidates.json");
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;
  return null;
}

function apiFilesBase(): string {
  const b = process.env.NEXT_PUBLIC_EDUMED_API_ORIGIN?.trim().replace(/\/$/, "");
  return b || "http://127.0.0.1:3001";
}

export function absoluteFileUrl(storageRelPath: string): string {
  const clean = storageRelPath.replace(/^\/+/, "");
  return `${apiFilesBase()}/files/${clean}`;
}

function avatarUrlFromFiles(files: CandidateFileMeta[]): string | null {
  const avatar = files.find((f) => f.category === "avatar");
  if (!avatar) return null;
  return absoluteFileUrl(avatar.storageRelPath);
}

export function candidateRoleLabelRu(
  analytics: CandidateAnalyticsSnapshot,
  application: CandidateApplication | null | undefined,
): string {
  if (analytics?.desiredRoleOverride === "teacher") {
    return "Учитель (приоритет отдела)";
  }
  const ar = analytics?.recommendation?.allowedRole;
  if (ar === "teacher") return "Учитель";
  if (ar === "assistant_intern") return "Ассистент / стажёр";
  const ef = application?.role?.employmentFormat;
  if (ef === "internship") return "Стажёр (по анкете)";
  if (ef === "part_time") return "Совместитель (по анкете)";
  if (ef === "staff") return "Штат (по анкете)";
  return "—";
}

export type EdumedCandidateCard = {
  candidateId: string;
  status: string;
  fio: string | null;
  roleLabel: string;
  avatarSrc: string | null;
  updatedAt: string;
  submittedAt: string | null;
};

export type EdumedCandidateDetail = {
  candidateId: string;
  status: string;
  updatedAt: string;
  submittedAt: string | null;
  application: unknown;
  files: CandidateFileMeta[];
  analytics: unknown;
};

export type LoadEdumedCandidatesResult =
  | { ok: true; cards: EdumedCandidateCard[] }
  | { ok: false; detail: string };

export function loadEdumedCandidatesFromFile(): LoadEdumedCandidatesResult {
  const p = resolveCandidatesJsonPath();
  if (!p) {
    return {
      ok: false,
      detail:
        "Файл candidates.json не найден. Укажите EDUMED_CANDIDATES_JSON_PATH или запускайте модуль из монорепозитория рядом с apps/api.",
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
  } catch {
    return { ok: false, detail: "Не удалось прочитать candidates.json (повреждённый JSON)." };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, detail: "Ожидался массив кандидатов в candidates.json." };
  }

  const cards: EdumedCandidateCard[] = (raw as CandidateStored[]).map((c) => {
    const analytics = c.analytics ?? null;
    const application = (c.application ?? null) as CandidateApplication | null;
    const fio = application?.contacts?.fullName?.trim() || null;
    return {
      candidateId: String(c.candidateId),
      status: String(c.status ?? "invited"),
      fio,
      roleLabel: candidateRoleLabelRu(analytics, application),
      avatarSrc: avatarUrlFromFiles(Array.isArray(c.files) ? c.files : []),
      updatedAt: String(c.updatedAt ?? ""),
      submittedAt: c.submittedAt ?? null,
    };
  });

  cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { ok: true, cards };
}

export function getCandidateById(candidateId: string): { ok: true; candidate: EdumedCandidateDetail } | { ok: false; error: string } {
  const p = resolveCandidatesJsonPath();
  if (!p) {
    return { ok: false, error: "Файл candidates.json не найден." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
  } catch {
    return { ok: false, error: "Не удалось прочитать candidates.json." };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Некорректный формат candidates.json." };
  }
  const row = (raw as CandidateStored[]).find((c) => String(c.candidateId) === candidateId);
  if (!row) {
    return { ok: false, error: "NOT_FOUND" };
  }
  return {
    ok: true,
    candidate: {
      candidateId: String(row.candidateId),
      status: String(row.status ?? "invited"),
      updatedAt: String(row.updatedAt ?? ""),
      submittedAt: row.submittedAt ?? null,
      application: row.application ?? null,
      files: Array.isArray(row.files) ? row.files : [],
      analytics: row.analytics ?? null,
    },
  };
}
