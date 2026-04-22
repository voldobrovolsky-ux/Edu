import { hourRate } from "@/modules/payroll-engine";
import type { HourlyContext } from "@/modules/types";

export function buildPkImpactPreview(params: {
  currentPkAddon: number;
  newPkAddon: number;
  currentPeriodHours: number;
  baseHourRate: number;
  prAddon: number;
  opAddon: number;
  prEnabled: boolean;
  opEnabled: boolean;
}) {
  const oldHourly: HourlyContext = {
    effectiveBaseHourRate: params.baseHourRate,
    pkHourlyAddon: params.currentPkAddon,
    prHourlyAddon: params.prEnabled ? params.prAddon : 0,
    opHourlyAddon: params.opEnabled ? params.opAddon : 0,
    otherHourlyAddons: 0,
  };
  const newHourly: HourlyContext = {
    effectiveBaseHourRate: params.baseHourRate,
    pkHourlyAddon: params.newPkAddon,
    prHourlyAddon: params.prEnabled ? params.prAddon : 0,
    opHourlyAddon: params.opEnabled ? params.opAddon : 0,
    otherHourlyAddons: 0,
  };
  const oldRate = hourRate(oldHourly);
  const newRate = hourRate(newHourly);
  return {
    oldPkAddon: params.currentPkAddon,
    newPkAddon: params.newPkAddon,
    oldRate,
    newRate,
    estimatedMonthlyDelta: Math.round((newRate - oldRate) * params.currentPeriodHours * 100) / 100,
  };
}
