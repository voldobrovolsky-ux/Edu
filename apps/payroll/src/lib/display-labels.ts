/** UI-only labels: API values stay unchanged. */

const MONTHS_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export function formatPeriodYmRu(year: number, month: number): string {
  const m = MONTHS_RU[month - 1] ?? String(month);
  return `${m} ${year}`;
}

export const personStatusLabelRu: Record<string, string> = {
  active: "Активный",
  candidate: "Кандидат",
  trainee: "Стажёр",
  archived: "В архиве",
};

export const employmentTypeLabelRu: Record<string, string> = {
  no_labor_contract: "ГПХ / без ТД",
  labor_contract: "Трудовой договор",
};

export const workFormatLabelRu: Record<string, string> = {
  staff: "Штат",
  part_time: "Совместитель",
  trainee: "Стажёр",
};

/** Payroll run line types → short Russian title for tables. */
export function payrollLineTypeLabelRu(lineType: string): string {
  const map: Record<string, string> = {
    TOTAL: "Итого",
    FIX_BASE: "Фикс по ТД / гарантия",
    REGIONAL_SUBSIDY: "Региональная субсидия",
    MROT_TOPUP: "Доплата до МРОТ",
    MROT_EVALUATION: "Расчёт МРОТ",
    BASE_HOURLY_PAY: "Базовая ставка",
    PK_HOURLY_ADDON: "Надбавка РК",
    PR_HOURLY_ADDON: "Надбавка PR",
    OP_HOURLY_ADDON: "Надбавка OP",
    SUBSTITUTION_PAY: "Замены",
    BONUS: "Премии",
    PENALTY: "Штрафы",
    MANUAL_ADJUSTMENT: "Ручные корректировки",
  };
  return map[lineType] ?? lineType;
}

export function payrollRunStatusLabelRu(status: string): string {
  if (status === "draft") return "черновик";
  if (status === "calculated") return "рассчитан";
  if (status === "finalized") return "финализирован";
  return status;
}

export function auditActionLabelRu(action: string): string {
  const map: Record<string, string> = {
    APPLY_PK_CHANGE: "Изменение коэффициента",
    CREATE_ORDER_DRAFT: "Создан черновик приказа",
  };
  return map[action] ?? action;
}

export function auditEntityTypeLabelRu(entityType: string): string {
  const map: Record<string, string> = {
    Person: "Сотрудник",
    OrderDraft: "Приказ",
  };
  return map[entityType] ?? entityType;
}

export function auditActorRoleLabelRu(role: string | null | undefined): string {
  if (!role) return "—";
  if (role === "system_admin") return "Система";
  return role;
}

/** Branch rule: show human title only (code is for API/storage). */
export function branchRuleDisplayName(code: string, name: string): string {
  return name?.trim() ? name : code;
}

/** Уровень образования (анкета кандидата / ветка) — коды из формы и seed. */
export const educationLevelLabelRu: Record<string, string> = {
  higher_pedagogical: "Высшее педагогическое",
  higher_non_pedagogical: "Высшее непедагогическое",
  vocational_pedagogical: "Среднее профессиональное (педагогическое)",
  vocational_non_pedagogical: "Среднее профессиональное (непедагогическое)",
};

/** Подписи полей сохранённой анкеты (`questionnaireAnswers` JSON). */
export const candidateIntakeFieldLabelRu: Record<string, string> = {
  personId: "Существующий человек (id)",
  fullName: "ФИО",
  educationLevel: "Уровень образования",
  hasPedagogicalQualification: "Педагогическое образование",
  hasRetraining: "Педагогическая переподготовка",
  subjectRelevance: "Релевантность предмета",
  schoolExperienceYears: "Опыт школы (лет)",
  tutoringExperienceYears: "Репетиторство (лет)",
  prLevelId: "Уровень PR (id)",
  opLevelId: "Уровень OP (id)",
  applyRecommendedPk: "Сразу выставить рекомендованный PK текущим",
};

export function formatQuestionnaireValue(key: string, raw: string): string {
  if (raw === "on") return "да";
  if (raw === "") return "—";
  if (key === "educationLevel") {
    return educationLevelLabelRu[raw] ?? raw;
  }
  return raw;
}
