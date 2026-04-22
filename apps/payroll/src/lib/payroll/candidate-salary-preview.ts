import { prisma } from "@/lib/db";
import { getBaseHourRate, getSystemSetting, isOpHourlyPayEnabled, isPrHourlyPayEnabled } from "@/lib/settings-helpers";

export type SalaryPreviewSegment = {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  amountRub: number;
  /** Текст для поповера */
  detail: string;
};

export type CandidateSalaryPreview = {
  totalRub: number;
  monthlyHours: number;
  effectiveHourlyRub: number;
  segments: SalaryPreviewSegment[];
  metrics: { label: string; value: string }[];
};

function pkCodeFromRecommendation(rec: { allowedRole?: string; startCategory?: string } | null | undefined): string {
  if (!rec || rec.allowedRole === "assistant_intern") return "PK0";
  if (rec.startCategory === "highest") return "PK5";
  if (rec.startCategory === "first") return "PK3";
  return "PK1";
}

function prCodeFromApplication(app: Record<string, unknown> | null): string {
  if (!app) return "PR1";
  const subj = app.subject as Record<string, unknown> | undefined;
  const n = subj?.subjectConfidence0to10;
  if (typeof n !== "number" || !Number.isFinite(n)) return "PR1";
  if (n <= 3) return "PR1";
  if (n <= 7) return "PR2";
  return "PR3";
}

function opCodeFromApplication(app: Record<string, unknown> | null): string {
  if (!app) return "OP1";
  const te = app.teachingExperience as Record<string, unknown> | undefined;
  const s = te?.teachingSchoolExperience;
  if (s === "3plus") return "OP5";
  if (s === "1-3") return "OP3";
  if (s === "lt1") return "OP2";
  return "OP1";
}

async function hourlyAddonForPkCode(code: string): Promise<{ rub: number; name: string }> {
  const row = await prisma.pKLevel.findUnique({
    where: { code },
    include: { addon: true },
  });
  const rub = row?.addon ? Number(row.addon.hourlyAddonRub) : 0;
  return { rub, name: row?.name ?? code };
}

async function hourlyAddonForPrCode(code: string): Promise<{ rub: number; name: string }> {
  const row = await prisma.pRLevel.findUnique({
    where: { code },
    include: { addon: true },
  });
  const rub = row?.addon ? Number(row.addon.hourlyAddonRub) : 0;
  return { rub, name: row?.name ?? code };
}

async function hourlyAddonForOpCode(code: string): Promise<{ rub: number; name: string }> {
  const row = await prisma.oPLevel.findUnique({
    where: { code },
    include: { addon: true },
  });
  const rub = row?.addon ? Number(row.addon.hourlyAddonRub) : 0;
  return { rub, name: row?.name ?? code };
}

const SEG_COLORS = {
  base: "#3b82f6",
  pk: "#8b5cf6",
  pr: "#10b981",
  op: "#f59e0b",
  regional: "#ec4899",
} as const;

function envNumber(key: string): number | null {
  const v = process.env[key]?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Условный прогноз месячной выплаты по отведённым часам (как в расчёте ЗП):
 * база + надбавки ПК/ПР/ОП × часы + опциональная региональная часть.
 */
export async function computeCandidateSalaryPreview(args: {
  application: unknown;
  analytics: unknown;
}): Promise<CandidateSalaryPreview | null> {
  const app = args.application as Record<string, unknown> | null;
  const analytics = args.analytics as { recommendation?: Record<string, unknown> | null } | null;
  if (!app) return null;

  const rec = analytics?.recommendation ?? null;
  const hoursFromDb = Number(await getSystemSetting("candidateSalaryPreviewMonthlyHours", "72"));
  const monthlyHours =
    envNumber("CANDIDATE_SALARY_PREVIEW_MONTHLY_HOURS") ??
    (Number.isFinite(hoursFromDb) && hoursFromDb > 0 ? hoursFromDb : 72);
  const base = await getBaseHourRate();
  const prOn = await isPrHourlyPayEnabled();
  const opOn = await isOpHourlyPayEnabled();
  const regionalFromDb = Number(await getSystemSetting("candidateSalaryPreviewRegionalRub", "0"));
  const regionalExtraRub =
    envNumber("CANDIDATE_SALARY_PREVIEW_REGIONAL_RUB") ?? (Number.isFinite(regionalFromDb) ? regionalFromDb : 0);

  const pkCode = pkCodeFromRecommendation(rec);
  const prCode = prCodeFromApplication(app);
  const opCode = opCodeFromApplication(app);

  const [pkInfo, prInfo, opInfo] = await Promise.all([
    hourlyAddonForPkCode(pkCode),
    hourlyAddonForPrCode(prCode),
    hourlyAddonForOpCode(opCode),
  ]);

  const prRub = prOn ? prInfo.rub : 0;
  const opRub = opOn ? opInfo.rub : 0;

  const basePart = base * monthlyHours;
  const pkPart = pkInfo.rub * monthlyHours;
  const prPart = prRub * monthlyHours;
  const opPart = opRub * monthlyHours;
  const totalHourly = base + pkInfo.rub + (prOn ? prRub : 0) + (opOn ? opRub : 0);
  const totalRub = basePart + pkPart + prPart + opPart + regionalExtraRub;

  const segments: SalaryPreviewSegment[] = [
    {
      id: "base",
      label: "Базовая часть (ставка за час × часы)",
      shortLabel: "База",
      color: SEG_COLORS.base,
      amountRub: basePart,
      detail: `База ${base.toLocaleString("ru-RU")} ₽/ч × ${monthlyHours} ч = ${Math.round(basePart).toLocaleString("ru-RU")} ₽. Глобальная ставка из настроек бухгалтерии.`,
    },
    {
      id: "pk",
      label: "Надбавка ПК (квалификация)",
      shortLabel: "ПК",
      color: SEG_COLORS.pk,
      amountRub: pkPart,
      detail: `Уровень ${pkCode} (${pkInfo.name}): +${pkInfo.rub.toLocaleString("ru-RU")} ₽/ч × ${monthlyHours} ч. Сопоставлено с рекомендацией по ветке и стартовой категории.`,
    },
    {
      id: "pr",
      label: "Надбавка ПР (предмет)",
      shortLabel: "ПР",
      color: SEG_COLORS.pr,
      amountRub: prPart,
      detail: prOn
        ? `Уровень ${prCode} (${prInfo.name}): +${prRub.toLocaleString("ru-RU")} ₽/ч × ${monthlyHours} ч. Оценка по уверенности в предмете (шаг 4 анкеты).`
        : "Надбавка ПР отключена в настройках.",
    },
    {
      id: "op",
      label: "Надбавка ОП (опыт)",
      shortLabel: "ОП",
      color: SEG_COLORS.op,
      amountRub: opPart,
      detail: opOn
        ? `Уровень ${opCode} (${opInfo.name}): +${opRub.toLocaleString("ru-RU")} ₽/ч × ${monthlyHours} ч. Оценка по опыту в школе (шаг 3 анкеты).`
        : "Надбавка ОП отключена в настройках.",
    },
  ];

  if (regionalExtraRub > 0.01) {
    segments.push({
      id: "regional",
      label: "Региональная надбавка",
      shortLabel: "РК",
      color: SEG_COLORS.regional,
      amountRub: regionalExtraRub,
      detail: "Фиксированная сумма из настроек предпросмотра (candidateSalaryPreviewRegionalRub).",
    });
  }

  const metrics: { label: string; value: string }[] = [
    { label: "Отведённые часы (модель)", value: `${monthlyHours} ч/мес` },
    { label: "База", value: `${base.toLocaleString("ru-RU")} ₽/ч` },
    { label: "ПК", value: `${pkCode} · +${pkInfo.rub.toLocaleString("ru-RU")} ₽/ч` },
    { label: "ПР", value: prOn ? `${prCode} · +${prRub.toLocaleString("ru-RU")} ₽/ч` : "выкл. в настройках" },
    { label: "ОП", value: opOn ? `${opCode} · +${opRub.toLocaleString("ru-RU")} ₽/ч` : "выкл. в настройках" },
    {
      label: "Эффективная ставка",
      value: `${totalHourly.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽/ч`,
    },
  ];

  return {
    totalRub: Math.round(totalRub),
    monthlyHours,
    effectiveHourlyRub: totalHourly,
    segments: segments.filter((s) => s.amountRub > 0.01),
    metrics,
  };
}
