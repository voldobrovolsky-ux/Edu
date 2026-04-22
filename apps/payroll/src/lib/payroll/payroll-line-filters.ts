/** Строки прогона только по карточкам, привязанным к users.json (не демо-сид без systemUserId). */
export function linesLinkedToEdumedAccounts<T extends { person: { systemUserId: string | null } }>(lines: T[]): T[] {
  return lines.filter((ln) => Boolean(ln.person.systemUserId?.trim()));
}
