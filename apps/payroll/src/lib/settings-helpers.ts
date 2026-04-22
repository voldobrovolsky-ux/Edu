import { prisma } from "@/lib/db";

export async function getSystemSetting(key: string, defaultValue: string): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? defaultValue;
}

export async function getBaseHourRate(): Promise<number> {
  const v = await getSystemSetting("baseHourRateRub", "750");
  return Number(v) || 750;
}

export async function getLessonDurationMinutes(): Promise<number> {
  const v = await getSystemSetting("lessonDurationMinutes", "45");
  return Number(v) || 45;
}

export async function getSchoolName(): Promise<string> {
  return getSystemSetting("schoolName", 'ООО "Школа EDUMED"');
}

export async function isPrHourlyPayEnabled(): Promise<boolean> {
  return (await getSystemSetting("prHourlyPayEnabled", "true")) === "true";
}

export async function isOpHourlyPayEnabled(): Promise<boolean> {
  return (await getSystemSetting("opHourlyPayEnabled", "true")) === "true";
}
