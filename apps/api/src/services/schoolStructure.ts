import { classGroupStore } from "../store/classGroupStore.js";
import { classStore } from "../store/classStore.js";
import type { ClassGroup, SchoolClass, StudentProfile } from "../types/school.js";
import { parseStudentCode } from "../utils/codes.js";

export const DEFAULT_CLASS_GROUP_NUMBERS = [1, 2] as const;

export type TeachingAssignmentPart = "whole_class" | "group1" | "group2";

export type SchoolClassWithGroups = SchoolClass & {
  groups: ClassGroup[];
};

export function partToGroupNumber(part: TeachingAssignmentPart): number | null {
  if (part === "whole_class") return null;
  if (part === "group1") return 1;
  if (part === "group2") return 2;
  return null;
}

export function groupNumberToPart(groupNumber: number | null): TeachingAssignmentPart {
  if (groupNumber == null) return "whole_class";
  if (groupNumber === 1) return "group1";
  if (groupNumber === 2) return "group2";
  return "whole_class";
}

export function getClassPartLabel(groupNumber: number | null): string {
  return groupNumber == null ? "Весь класс" : `${groupNumber} группа`;
}

export function ensureDefaultGroupsForGrade(grade: number): ClassGroup[] {
  if (!classStore.findByGrade(grade)) throw new Error("CLASS_NOT_FOUND");
  for (const groupNumber of DEFAULT_CLASS_GROUP_NUMBERS) {
    classGroupStore.create({ grade, groupNumber });
  }
  return classGroupStore.listByGrade(grade);
}

export function ensureDefaultGroupsForAllClasses(): void {
  for (const schoolClass of classStore.list()) {
    ensureDefaultGroupsForGrade(schoolClass.grade);
  }
}

export function createSchoolClassWithGroups(grade: number): SchoolClassWithGroups {
  const schoolClass = classStore.create(grade);
  const groups = ensureDefaultGroupsForGrade(grade);
  return {
    ...schoolClass,
    groups,
  };
}

export function listClassesWithGroups(): SchoolClassWithGroups[] {
  ensureDefaultGroupsForAllClasses();
  return classStore.list().map((schoolClass) => ({
    ...schoolClass,
    groups: classGroupStore.listByGrade(schoolClass.grade),
  }));
}

export function resolveClassGroup(args: {
  grade: number;
  groupNumber: number;
  autoCreateDefault?: boolean;
}): ClassGroup | null {
  const existing = classGroupStore.findByGradeAndNumber(args.grade, args.groupNumber);
  if (existing) return existing;

  if (args.autoCreateDefault !== false && DEFAULT_CLASS_GROUP_NUMBERS.includes(args.groupNumber as 1 | 2)) {
    return classGroupStore.create({ grade: args.grade, groupNumber: args.groupNumber });
  }

  return null;
}

export function listExistingGroupsForStudentCodes(): Array<{ grade: number; groupNumber: number }> {
  ensureDefaultGroupsForAllClasses();
  return classStore
    .list()
    .flatMap((schoolClass) =>
      classGroupStore.listByGrade(schoolClass.grade).map((group) => ({
        grade: group.grade,
        groupNumber: group.groupNumber,
      })),
    );
}

export function resolveStudentPlacement(profile: StudentProfile): {
  grade: number;
  groupNumber: number;
  classGroupId: string | null;
} | null {
  if (Number.isInteger(profile.grade) && Number.isInteger(profile.groupNumber)) {
    return {
      grade: profile.grade as number,
      groupNumber: profile.groupNumber as number,
      classGroupId: typeof profile.classGroupId === "string" ? profile.classGroupId : null,
    };
  }

  try {
    const parsed = parseStudentCode({
      code: profile.studentCode,
      existingGroups: listExistingGroupsForStudentCodes(),
    });
    const classGroup = classGroupStore.findByGradeAndNumber(parsed.grade, parsed.group);
    return {
      grade: parsed.grade,
      groupNumber: parsed.group,
      classGroupId: classGroup?.id ?? null,
    };
  } catch {
    return null;
  }
}
