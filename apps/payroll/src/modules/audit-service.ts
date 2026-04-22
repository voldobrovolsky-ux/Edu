import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

/** Prisma.Decimal / Decimal.js: stringify as plain number so audit JSON matches UI (₽, no scale bugs). */
function toAuditJson(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value, (_key, v) => {
    if (v != null && typeof v === "object") {
      const dec = v as { toFixed?: (n: number) => string; toNumber?: () => number; toString?: () => string };
      if (typeof dec.toFixed === "function") {
        const n =
          typeof dec.toNumber === "function" ? dec.toNumber() : Number(typeof dec.toString === "function" ? dec.toString() : String(v));
        return Number.isFinite(n) ? n : String(v);
      }
    }
    return v;
  });
}

export type AuditWriteParams = {
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  actorRole?: string;
  actorPersonId?: string | null;
  reason?: string | null;
  outcome?: "success" | "failure";
};

export async function writeAudit(params: AuditWriteParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      beforeJson: params.before === undefined ? null : toAuditJson(params.before),
      afterJson: params.after === undefined ? null : toAuditJson(params.after),
      actorRole: params.actorRole ?? null,
      actorPersonId: params.actorPersonId ?? null,
      reason: params.reason ?? null,
      outcome: params.outcome ?? "success",
    },
  });
}

/** Audit row inside a Prisma interactive transaction (same atomicity as the mutation). */
export async function writeAuditTx(tx: Prisma.TransactionClient, params: AuditWriteParams): Promise<void> {
  await tx.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      beforeJson: params.before === undefined ? null : toAuditJson(params.before),
      afterJson: params.after === undefined ? null : toAuditJson(params.after),
      actorRole: params.actorRole ?? null,
      actorPersonId: params.actorPersonId ?? null,
      reason: params.reason ?? null,
      outcome: params.outcome ?? "success",
    },
  });
}
