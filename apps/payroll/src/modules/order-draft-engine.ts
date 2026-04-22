import type { RateImpactPreview } from "./types";

export interface OrderDraftParams {
  schoolName: string;
  orderNumber: string;
  orderDate: string;
  employeeFullName: string;
  oldConditions: string;
  newConditions: string;
  basis: string;
  effectiveDate: string;
  responsibleDirector: string;
  responsibleAccounting: string;
}

export function buildOrderDraftText(p: OrderDraftParams): string {
  return [
    `${p.schoolName}`,
    `ПРИКАЗ № ${p.orderNumber}`,
    `от ${p.orderDate}`,
    "",
    "О внесении изменений в условия оплаты труда",
    "",
    `Работник: ${p.employeeFullName}`,
    "",
    "Было:",
    p.oldConditions,
    "",
    "Стало:",
    p.newConditions,
    "",
    `Основание: ${p.basis}`,
    "",
    `Вступает в силу: ${p.effectiveDate}`,
    "",
    `Директор: __________________ / ${p.responsibleDirector} /`,
    `Главный бухгалтер: __________________ / ${p.responsibleAccounting} /`,
  ].join("\n");
}

export function buildOrderDraftFromImpact(
  preview: RateImpactPreview,
  extra: Omit<OrderDraftParams, "oldConditions" | "newConditions" | "basis" | "employeeFullName"> & {
    basis?: string;
  },
): string {
  const oldConditions = `Часовая ставка (оценка): ${preview.oldHourRate} ₽/ч; надбавка PK: ${preview.oldPkAddon} ₽/ч; оценка месяца: ${preview.oldMonthlyEstimate} ₽ (${preview.assumptionNote})`;
  const newConditions = `Часовая ставка (оценка): ${preview.newHourRate} ₽/ч; надбавка PK: ${preview.newPkAddon} ₽/ч; оценка месяца: ${preview.newMonthlyEstimate} ₽ (${preview.assumptionNote})`;
  return buildOrderDraftText({
    schoolName: extra.schoolName,
    orderNumber: extra.orderNumber,
    orderDate: extra.orderDate,
    employeeFullName: preview.personName,
    oldConditions,
    newConditions,
    basis: extra.basis ?? "Изменение показателей PK/ставок по служебной необходимости",
    effectiveDate: extra.effectiveDate,
    responsibleDirector: extra.responsibleDirector,
    responsibleAccounting: extra.responsibleAccounting,
  });
}
