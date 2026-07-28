import { randomUUID } from 'node:crypto';

/** Предел глубины каскада — защита от петель (A→B→A). */
export const MAX_CASCADE_DEPTH = 12;

/** Единый конверт события (см. docs/PARAMETERS.md §3). */
export interface DomainEvent<T = unknown> {
  id: string; // идемпотентный ключ (= Nats-Msg-Id в проде)
  type: string; // "<param>.<aggregate>.<verbPast>.v1"
  occurredAt: string; // ISO
  workspaceId: string; // тенант = школа (Workspace)
  correlationId: string; // один на весь каскад
  causationId?: string | null; // событие-причина (предыдущее звено)
  depth: number; // глубина каскада
  actor?: string | null; // кто инициировал
  payload: T;
}

export function newEvent<T>(args: {
  type: string;
  workspaceId: string;
  payload: T;
  actor?: string;
  correlationId?: string;
  causationId?: string;
  depth?: number;
}): DomainEvent<T> {
  const id = randomUUID();
  return {
    id,
    type: args.type,
    occurredAt: new Date().toISOString(),
    workspaceId: args.workspaceId,
    correlationId: args.correlationId ?? id,
    causationId: args.causationId ?? null,
    depth: args.depth ?? 0,
    actor: args.actor ?? 'system',
    payload: args.payload,
  };
}

/**
 * Породить событие-следствие, продолжающее каскад: сохраняет correlationId,
 * ставит causationId = id родителя и увеличивает depth (для depth-guard).
 */
export function continuation<T>(
  parent: DomainEvent,
  type: string,
  payload: T,
  actor = 'system',
): DomainEvent<T> {
  return newEvent({
    type,
    workspaceId: parent.workspaceId,
    payload,
    correlationId: parent.correlationId,
    causationId: parent.id,
    depth: parent.depth + 1,
    actor,
  });
}
