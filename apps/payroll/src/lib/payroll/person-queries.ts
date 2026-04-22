import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";

/** Лица, по которым разрешён ввод учебных часов и замен (согласовано с person-actions / схемой Person). */
export const personWhereEligibleForHourLogging = (): Prisma.PersonWhereInput => ({
  NOT: { status: "archived" },
  canReceiveHourEntries: true,
});

export async function listPeopleForHourLogging() {
  return prisma.person.findMany({
    where: personWhereEligibleForHourLogging(),
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}
