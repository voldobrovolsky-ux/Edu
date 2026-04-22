"use server";

import { prisma } from "@/lib/db";
import { matchCandidateBranch } from "@/modules/branch-engine";
import { computePkRecommendation } from "@/modules/pk-engine";
import type { BranchMatchInput, InternalCategoryCode } from "@/modules/types";
import { writeAudit } from "@/modules/audit-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function submitCandidateQuestionnaire(formData: FormData) {
  let personId = (formData.get("personId") as string) || "";
  const fullName = (formData.get("fullName") as string) || "Кандидат";
  const educationLevel = formData.get("educationLevel") as string;
  const hasPedagogicalQualification = formData.get("hasPedagogicalQualification") === "on";
  const hasRetraining = formData.get("hasRetraining") === "on";
  const subjectRelevance = (formData.get("subjectRelevance") as string) || "relevant";
  const schoolExperienceYears = parseFloat((formData.get("schoolExperienceYears") as string) || "0");
  const tutoringExperienceYears = parseFloat((formData.get("tutoringExperienceYears") as string) || "0");
  const prLevelId = (formData.get("prLevelId") as string) || null;
  const opLevelId = (formData.get("opLevelId") as string) || null;
  const applyRecommendedPk = formData.get("applyRecommendedPk") === "on";

  const rules = await prisma.candidateBranchRule.findMany({ orderBy: { priority: "desc" } });
  const ruleRecords = rules.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    priority: r.priority,
    matchJson: r.matchJson,
    eligibility: r.eligibility as "teacher_eligible" | "trainee_only",
    recommendedInternalCategoryCode: r.recommendedInternalCategoryCode as InternalCategoryCode,
    pkCorridorMinCode: r.pkCorridorMinCode,
    pkCorridorMaxCode: r.pkCorridorMaxCode,
    commentTemplate: r.commentTemplate,
  }));

  const input: BranchMatchInput = {
    educationLevel,
    hasPedagogicalQualification,
    hasRetraining,
    subjectRelevance,
    schoolExperienceYears,
    tutoringExperienceYears,
  };

  const branch = matchCandidateBranch(ruleRecords, input);

  const pkLevels = await prisma.pKLevel.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true, sortOrder: true } });
  const pr = prLevelId ? await prisma.pRLevel.findUnique({ where: { id: prLevelId } }) : null;
  const op = opLevelId ? await prisma.oPLevel.findUnique({ where: { id: opLevelId } }) : null;

  const pkRec = computePkRecommendation({
    branch,
    internalCategoryCode: branch.recommendedInternalCategoryCode,
    prCode: pr?.code ?? "PR1",
    opCode: op?.code ?? "OP1",
    hasPedagogicalQualification,
    pkLevelsOrdered: pkLevels,
  });

  const pkRow = await prisma.pKLevel.findFirst({ where: { code: pkRec.recommendedPKCode } });
  const ic = await prisma.categoryInternal.findFirst({
    where: { code: branch.recommendedInternalCategoryCode },
  });

  if (!personId) {
    const created = await prisma.person.create({
      data: {
        fullName,
        status: "candidate",
        employmentType: "no_labor_contract",
        workFormat: "trainee",
        internalCategoryId: ic?.id ?? null,
        currentPKLevelId: applyRecommendedPk ? pkRow?.id ?? null : null,
        recommendedPKLevelId: pkRow?.id ?? null,
        prLevelId: pr?.id ?? null,
        opLevelId: op?.id ?? null,
        branchRuleId: branch.matchedRule?.id ?? null,
      },
    });
    personId = created.id;
  } else {
    await prisma.person.update({
      where: { id: personId },
      data: {
        ...(fullName.trim() ? { fullName } : {}),
        internalCategoryId: ic?.id ?? null,
        recommendedPKLevelId: pkRow?.id ?? null,
        prLevelId: pr?.id ?? null,
        opLevelId: op?.id ?? null,
        branchRuleId: branch.matchedRule?.id ?? null,
        ...(applyRecommendedPk && pkRow?.id ? { currentPKLevelId: pkRow.id } : {}),
      },
    });
  }

  const questionnaireAnswers = JSON.stringify(Object.fromEntries(formData.entries()));
  const lastRec = JSON.stringify({ branch, pkRec, input });

  await prisma.candidateProfile.upsert({
    where: { personId },
    create: {
      personId,
      educationLevel,
      hasPedagogicalQualification,
      hasRetraining,
      subjectRelevance,
      schoolExperienceYears,
      tutoringExperienceYears,
      questionnaireAnswers,
      lastRecommendationJson: lastRec,
    },
    update: {
      educationLevel,
      hasPedagogicalQualification,
      hasRetraining,
      subjectRelevance,
      schoolExperienceYears,
      tutoringExperienceYears,
      questionnaireAnswers,
      lastRecommendationJson: lastRec,
    },
  });

  await writeAudit({
    entityType: "CandidateProfile",
    entityId: personId,
    action: "questionnaire_submit",
    before: null,
    after: { branchCode: branch.matchedRule?.code, pk: pkRec.recommendedPKCode },
    actorRole: "vice_principal",
    reason: null,
  });

  revalidatePath("/candidates");
  revalidatePath(`/people/${personId}`);
  redirect(`/people/${personId}`);
}
