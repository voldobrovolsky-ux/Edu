import { z } from "zod";

export const personFormSchema = z.object({
  fullName: z.string().min(1),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  phone: z.string().optional(),
  status: z.enum(["candidate", "trainee", "active", "archived"]),
  employmentType: z.enum(["labor_contract", "no_labor_contract"]),
  workFormat: z.enum(["staff", "part_time", "trainee"]),
  officialCategoryId: z.string().optional(),
  internalCategoryId: z.string().optional(),
  currentPKLevelId: z.string().optional(),
  fixedPKLevelId: z.string().optional().nullable(),
  recommendedPKLevelId: z.string().optional().nullable(),
  prLevelId: z.string().optional(),
  opLevelId: z.string().optional(),
  branchRuleId: z.string().optional().nullable(),
  baseHourRateOverride: z.string().optional(),
  isVisibleInAccounting: z.coerce.boolean().optional(),
  notes: z.string().optional(),
  guaranteedMonthlyFixRub: z.string().optional(),
});

export const hourEntrySchema = z.object({
  personId: z.string(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  lessonHours: z.coerce.number().nonnegative(),
  hourEventTypeId: z.string().min(1),
  notes: z.string().optional(),
});

export const substitutionSchema = z.object({
  substitutingPersonId: z.string(),
  replacedPersonId: z.string().optional().nullable(),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  hours: z.coerce.number().nonnegative(),
  hourEventTypeId: z.string().optional(),
  notes: z.string().optional(),
});
