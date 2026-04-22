import type {
  BranchEngineResult,
  BranchMatchInput,
  BranchRuleJson,
  CandidateBranchRuleRecord,
  InternalCategoryCode,
} from "./types";

function num(n: number | undefined): number {
  return n ?? 0;
}

function parseRule(matchJson: string): BranchRuleJson {
  try {
    return JSON.parse(matchJson) as BranchRuleJson;
  } catch {
    return {};
  }
}

function matches(rule: BranchRuleJson, input: BranchMatchInput): boolean {
  if (rule.education && rule.education !== "any" && input.educationLevel !== rule.education) {
    return false;
  }
  if (rule.hasPedagogicalQualification !== undefined && rule.hasPedagogicalQualification !== null) {
    if (input.hasPedagogicalQualification !== rule.hasPedagogicalQualification) return false;
  }
  if (rule.hasRetraining !== undefined && rule.hasRetraining !== null) {
    if (input.hasRetraining !== rule.hasRetraining) return false;
  }
  const school = num(input.schoolExperienceYears);
  const tutor = num(input.tutoringExperienceYears);
  if (rule.schoolExpMin !== undefined && school < rule.schoolExpMin) return false;
  if (rule.schoolExpMax !== undefined && school > rule.schoolExpMax) return false;
  if (rule.tutoringMin !== undefined && tutor < rule.tutoringMin) return false;
  if (rule.tutoringOnly) {
    if (!(tutor > 0 && school <= 0)) return false;
  }
  if (rule.requireSchoolExp && school <= 0) return false;
  return true;
}

/**
 * Select highest-priority branch rule that matches questionnaire inputs.
 */
export function matchCandidateBranch(
  rules: CandidateBranchRuleRecord[],
  input: BranchMatchInput,
): BranchEngineResult {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    const parsed = parseRule(r.matchJson);
    if (matches(parsed, input)) {
      const eligibility = r.eligibility;
      const ic = r.recommendedInternalCategoryCode as InternalCategoryCode;
      return {
        matchedRule: r,
        matchExplanation: `Сработало правило «${r.name}» (${r.code}): условия matchJson соответствуют анкете.`,
        eligibility,
        recommendedInternalCategoryCode: ic,
        pkCorridorMinCode: r.pkCorridorMinCode,
        pkCorridorMaxCode: r.pkCorridorMaxCode,
        comment: r.commentTemplate,
      };
    }
  }
  return {
    matchedRule: null,
    matchExplanation:
      "Ни одно правило ветки не подошло. Назначена внутренняя категория по умолчанию; проверьте справочник правил.",
    eligibility: "trainee_only",
    recommendedInternalCategoryCode: "no_category",
    pkCorridorMinCode: null,
    pkCorridorMaxCode: null,
    comment: "Требуется ручной разбор отдела кадров.",
  };
}
