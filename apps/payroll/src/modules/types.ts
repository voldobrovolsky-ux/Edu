/** Shared domain types for payroll & candidate engines (pure, no Prisma imports). */

export type EmploymentType = "labor_contract" | "no_labor_contract";
export type WorkFormat = "staff" | "part_time" | "trainee";
export type PersonStatus = "candidate" | "trainee" | "active" | "archived";
export type InternalCategoryCode = "no_category" | "first_category" | "highest_category";

export type PayrollLineType =
  | "FIX_BASE"
  | "MROT_TOPUP"
  | "MROT_EVALUATION"
  | "REGIONAL_SUBSIDY"
  | "BASE_HOURLY_PAY"
  | "PK_HOURLY_ADDON"
  | "PR_HOURLY_ADDON"
  | "OP_HOURLY_ADDON"
  | "SUBSTITUTION_PAY"
  | "BONUS"
  | "PENALTY"
  | "MANUAL_ADJUSTMENT"
  | "TOTAL";

/** Семантическая группа «лестницы» выплат (Fix / Почасовка / Flex / Итого). */
export type LadderBlock = "fix" | "hourly" | "flex" | "total";

export interface BranchMatchInput {
  educationLevel: string;
  hasPedagogicalQualification: boolean;
  hasRetraining: boolean;
  subjectRelevance: string;
  schoolExperienceYears: number;
  tutoringExperienceYears: number;
}

export interface BranchRuleJson {
  education?: string | "any";
  hasPedagogicalQualification?: boolean | null;
  hasRetraining?: boolean | null;
  schoolExpMin?: number;
  schoolExpMax?: number;
  tutoringMin?: number;
  tutoringOnly?: boolean;
  requireSchoolExp?: boolean;
}

export interface CandidateBranchRuleRecord {
  id: string;
  code: string;
  name: string;
  priority: number;
  matchJson: string;
  eligibility: "teacher_eligible" | "trainee_only";
  recommendedInternalCategoryCode: InternalCategoryCode;
  pkCorridorMinCode: string | null;
  pkCorridorMaxCode: string | null;
  commentTemplate: string;
}

export interface BranchEngineResult {
  matchedRule: CandidateBranchRuleRecord | null;
  matchExplanation: string;
  eligibility: "teacher_eligible" | "trainee_only";
  recommendedInternalCategoryCode: InternalCategoryCode;
  pkCorridorMinCode: string | null;
  pkCorridorMaxCode: string | null;
  comment: string;
}

export interface PkEngineInput {
  branch: BranchEngineResult;
  /** Effective internal category for recommendation (from person or branch) */
  internalCategoryCode: InternalCategoryCode;
  prCode: string;
  opCode: string;
  hasPedagogicalQualification: boolean;
  /** PK level codes ordered low → high for corridor */
  pkLevelsOrdered: { code: string; sortOrder: number }[];
}

export interface PkEngineResult {
  recommendedPKCode: string;
  pkCorridorDescription: string;
  explanation: string;
  warnings: string[];
}

export interface HourlyContext {
  effectiveBaseHourRate: number;
  pkHourlyAddon: number;
  prHourlyAddon: number;
  opHourlyAddon: number;
  otherHourlyAddons: number;
}

export interface AdjustmentInput {
  id: string;
  title: string;
  amount: number;
  direction: "plus" | "minus";
  subsidyCode?: string | null;
  /** true = обязательный фикс (окладная/региональная часть), false = flex */
  isFixComponent: boolean;
  countsTowardMrot: boolean;
  isHourly: boolean;
  isManual: boolean;
  /** Из справочника Subsidy.paymentSource */
  paymentSource?: string | null;
}

export interface ComputedPayrollLine {
  lineType: PayrollLineType;
  title: string;
  quantity: number;
  rate: number;
  amount: number;
  direction: "plus" | "minus";
  formulaText: string;
  sourceReference: string;
  countsTowardMrot: boolean;
  /** Сумма для порога МРОТ, если отличается от `amount` (разные веса оплаты и учёта МРОТ). */
  mrotCountedAmount?: number;
  /** fix = окладная/МРОТ-блок; flex = прочие начисления (в т.ч. замены, премии) */
  flexOrFix: "fix" | "flex";
  /** Группа для UI «лестницы»: Fix / Почасовка / Flex / Итого */
  ladderBlock: LadderBlock;
  explanation: { why: string; details?: Record<string, string | number | boolean | null | undefined> };
}

export interface PayrollPersonInput {
  personId: string;
  fullName: string;
  employmentType: EmploymentType;
  workFormat: WorkFormat;
  /** Эффективные часы для оплаты (Σ ч × payFactor по типам событий). */
  lessonHoursPay: number;
  /** Часы, полностью учитываемые в базе для МРОТ по учебным событиям. */
  lessonHoursMrot: number;
  substitutionHoursPay: number;
  substitutionHoursMrot: number;
  guaranteedMonthlyFixRub: number;
  hourly: HourlyContext;
  adjustments: AdjustmentInput[];
  /** Effective monthly MROT (regional override or federal) */
  effectiveMrotMonthly: number;
  /** If false, skip MROT top-up entirely */
  applyMrot: boolean;
}

export interface PayrollCalculationResult {
  lines: ComputedPayrollLine[];
  totalAmount: number;
  countedTowardMrotBeforeTopup: number;
  mrotShortfall: number;
}

export interface RateImpactPreview {
  personName: string;
  oldHourRate: number;
  newHourRate: number;
  oldPkAddon: number;
  newPkAddon: number;
  oldMonthlyEstimate: number;
  newMonthlyEstimate: number;
  assumptionNote: string;
}
