/** Контракты завуча/методиста (Архстандарт §6). Категории standards.updated не пересекаются. */
export const STANDARDS_EVENTS = {
  assessmentPolicyUpdated: 'edustore.assessment-policy.updated',
  timingProfileUpdated: 'edustore.timing-profile.updated',
  standardsUpdated: 'edustore.standards.updated', // category: оргстандарты | содержание | шаблон
  fgosHoursApproved: 'edustore.fgos-hours.approved',
} as const;

export interface StandardsUpdatedV1 {
  category: string;
}
export interface FgosHoursApprovedV1 {
  classId: string;
  disciplineId: string;
  hours: number;
}
