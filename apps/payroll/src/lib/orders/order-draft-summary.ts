/** Краткое описание черновика приказа для списка (без сырого JSON). */
export function summarizeOrderDraft(type: string, payloadJson: string | null): string {
  if (!payloadJson) return "—";
  try {
    const p = JSON.parse(payloadJson) as Record<string, unknown>;
    if (type === "PK_CHANGE") {
      const oldPk = typeof p.oldPkCode === "string" ? p.oldPkCode : "?";
      const newPk = typeof p.newPkCode === "string" ? p.newPkCode : "?";
      const delta = typeof p.estimatedMonthlyDelta === "number" ? p.estimatedMonthlyDelta : null;
      const deltaStr = delta != null ? `; оценка Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ₽/мес` : "";
      return `PK: ${oldPk} → ${newPk}${deltaStr}`;
    }
    return typeof p.summary === "string" ? p.summary : type;
  } catch {
    return "Данные в payload";
  }
}

export function orderDraftStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Черновик";
    case "approved":
      return "Утверждён";
    case "archived":
      return "Архив";
    default:
      return status;
  }
}
