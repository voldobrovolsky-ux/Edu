import type { BranchEngineResult, PkEngineInput, PkEngineResult } from "./types";

function clampIndex(i: number, max: number): number {
  return Math.max(0, Math.min(max, i));
}

/**
 * Рекомендует уровень PK по ветке, внутренней категории, PR/OP и коридору PK из правила ветки.
 * Не заменяет решение комиссии; фиксированный PK назначается после демо-урока.
 */
export function computePkRecommendation(input: PkEngineInput): PkEngineResult {
  const warnings: string[] = [];
  if (!input.hasPedagogicalQualification) {
    warnings.push("Нет педагогического образования: допуск только как стажёр/ассистент до переподготовки.");
  }

  const ordered = [...input.pkLevelsOrdered].sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.length === 0) {
    return {
      recommendedPKCode: "PK0",
      pkCorridorDescription: "Нет уровней PK в справочнике",
      explanation: "В системе не заданы уровни PK.",
      warnings,
    };
  }

  const codes = ordered.map((p) => p.code);
  const minC = input.branch.pkCorridorMinCode;
  const maxC = input.branch.pkCorridorMaxCode;
  let low = 0;
  let high = codes.length - 1;
  if (minC) {
    const idx = codes.indexOf(minC);
    if (idx >= 0) low = idx;
  }
  if (maxC) {
    const idx = codes.indexOf(maxC);
    if (idx >= 0) high = idx;
  }
  if (low > high) {
    warnings.push("Коридор PK в правиле ветки задан некорректно (min > max), используется весь диапазон.");
    low = 0;
    high = codes.length - 1;
  }

  /** Сдвиг внутри коридора по категории и опыту (PR/OP) */
  let offset = 0;
  if (input.internalCategoryCode === "highest_category") offset += 1;
  else if (input.internalCategoryCode === "first_category") offset += 0;
  else offset -= 1;

  const prNum = Number(input.prCode.replace(/\D/g, "")) || 0;
  const opNum = Number(input.opCode.replace(/\D/g, "")) || 0;
  offset += Math.min(2, Math.floor((prNum + opNum) / 4));

  const center = Math.floor((low + high) / 2);
  const pick = clampIndex(center + offset, high);

  const recommended = codes[pick];
  const corridor =
    minC && maxC ? `от ${minC} до ${maxC} (в справочнике: ${codes.slice(low, high + 1).join(", ")})` : "без ограничений правила";

  const explanation =
    `Коридор: ${corridor}. ` +
    `Внутренняя категория: ${input.internalCategoryCode}. PR=${input.prCode}, OP=${input.opCode}. ` +
    `Смещение внутри коридора: ${offset}. Выбран уровень ${recommended}.`;

  return {
    recommendedPKCode: recommended,
    pkCorridorDescription: corridor,
    explanation,
    warnings,
  };
}
