"use server";

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const ALLOWED_FACTORS = new Set([0, 0.5, 1]);

export async function updateHourEventTypeForm(formData: FormData) {
  const id = (formData.get("id") as string)?.trim();
  const payFactorRaw = String(formData.get("payFactor") ?? "");
  const mrot = String(formData.get("countsTowardMrot") ?? "") === "true";
  const load = String(formData.get("countsTowardLoad") ?? "") === "true";
  if (!id) redirect("/settings/payroll?err=" + encodeURIComponent("Не указан тип"));
  const pf = parseFloat(payFactorRaw);
  if (!ALLOWED_FACTORS.has(pf)) {
    redirect("/settings/payroll?err=" + encodeURIComponent("Допустимые веса: 0, 0.5, 1"));
  }
  await prisma.hourEventType.update({
    where: { id },
    data: {
      payFactor: new Prisma.Decimal(pf),
      countsTowardMrot: mrot,
      countsTowardLoad: load,
    },
  });
  revalidatePath("/settings/payroll");
  revalidatePath("/");
  revalidatePath("/run");
  redirect("/settings/payroll?ok=hourtype");
}
