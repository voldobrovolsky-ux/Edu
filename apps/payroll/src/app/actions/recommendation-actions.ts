"use server";

import { prisma } from "@/lib/db";
import { applyRecommendedPkInternal } from "@/app/actions/person-actions";
import { revalidatePath } from "next/cache";

export async function approvePkRecommendation(recommendationId: string, applyPk: boolean) {
  const r = await prisma.rateChangeRecommendation.findUnique({
    where: { id: recommendationId },
    include: {
      person: true,
    },
  });
  if (!r) return;

  if (applyPk) {
    await applyRecommendedPkInternal(r.personId, r.reasonText ?? "Утверждение рекомендации PK", {
      recommendationId: r.id,
    });
  } else {
    await prisma.rateChangeRecommendation.update({
      where: { id: recommendationId },
      data: { status: "approved" },
    });
    revalidatePath("/");
    revalidatePath("/people");
    revalidatePath(`/people/${r.personId}`);
    revalidatePath("/audit");
  }
}

export async function rejectPkRecommendation(recommendationId: string) {
  await prisma.rateChangeRecommendation.update({
    where: { id: recommendationId },
    data: { status: "rejected" },
  });
  revalidatePath("/");
  revalidatePath("/people");
  revalidatePath("/audit");
}

export async function approveRecommendationForm(formData: FormData) {
  const id = formData.get("id") as string;
  const applyPk = formData.get("applyPk") === "true";
  await approvePkRecommendation(id, applyPk);
}

export async function rejectRecommendationForm(formData: FormData) {
  const id = formData.get("id") as string;
  await rejectPkRecommendation(id);
}
