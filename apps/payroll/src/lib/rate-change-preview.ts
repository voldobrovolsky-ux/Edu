import { buildOrderDraftFromImpact } from "@/modules/order-draft-engine";
import { hourRate } from "@/modules/payroll-engine";
import type { HourlyContext, RateImpactPreview } from "@/modules/types";

export function buildRateImpactPreview(
  fullName: string,
  oldHourly: HourlyContext,
  newHourly: HourlyContext,
  assumedMonthlyHours: number,
): RateImpactPreview {
  const oldRate = hourRate(oldHourly);
  const newRate = hourRate(newHourly);
  return {
    personName: fullName,
    oldHourRate: oldRate,
    newHourRate: newRate,
    oldPkAddon: oldHourly.pkHourlyAddon,
    newPkAddon: newHourly.pkHourlyAddon,
    oldMonthlyEstimate: Math.round(oldRate * assumedMonthlyHours * 100) / 100,
    newMonthlyEstimate: Math.round(newRate * assumedMonthlyHours * 100) / 100,
    assumptionNote: `Условно ${assumedMonthlyHours} учебных часов в месяц (оценка для приказа)`,
  };
}

export function buildOrderDraftForRateChange(
  preview: RateImpactPreview,
  schoolName: string,
): string {
  return buildOrderDraftFromImpact(preview, {
    schoolName,
    orderNumber: "____",
    orderDate: new Date().toLocaleDateString("ru-RU"),
    effectiveDate: new Date().toLocaleDateString("ru-RU"),
    responsibleDirector: "ФИО директора",
    responsibleAccounting: "ФИО бухгалтера",
    basis: "Изменение уровня PK / условий оплаты",
  });
}
