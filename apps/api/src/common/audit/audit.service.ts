import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBus } from '../events/event-bus';
import { Inbox } from '../outbox/inbox.service';
import { type DomainEvent } from '../events/domain-event';
import { COMPLIANCE_EVENTS } from '../../parameters/compliance/contract';
import { CONTINGENT_EVENTS } from '../../parameters/contingent/contract';

// Реестр событий с касанием ПДн → категории + извлечение субъекта (§4.8).
// Расширение покрытия аудита = строка здесь.
const AUDITED: Record<string, { categories: string[]; subject: (p: Record<string, unknown>) => string | undefined }> = {
  [CONTINGENT_EVENTS.studentEnrolled]: { categories: ['identity'], subject: (p) => p.studentId as string },
  [COMPLIANCE_EVENTS.consentRecorded]: { categories: ['consent'], subject: (p) => p.subjectUserId as string },
  [COMPLIANCE_EVENTS.deletionRequested]: { categories: ['identity', 'all'], subject: (p) => p.subjectUserId as string },
};

/**
 * Audit-леджер (§4.8): append-only иммутабельный журнал ПДн-действий. Пишется ИЗ СОБЫТИЙ —
 * подписывается на типы с касанием ПДн и кладёт запись (идемпотентно через inbox).
 * В отличие от OutboxEvent, не чистится и не правится — это и есть «протокол».
 */
@Injectable()
export class AuditService implements OnModuleInit {
  private readonly log = new Logger('Audit');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBus,
    private readonly inbox: Inbox,
  ) {}

  onModuleInit() {
    for (const type of Object.keys(AUDITED)) {
      this.bus.subscribe(type, 'audit', (e) => this.onEvent(e));
    }
  }

  private async onEvent(e: DomainEvent) {
    const spec = AUDITED[e.type];
    if (!spec) return;
    await this.inbox.handle(e.id, 'audit', async (tx) => {
      await tx.auditLog.create({
        data: {
          eventId: e.id,
          workspaceId: e.workspaceId, // из конверта (system-контекст воркера)
          actor: e.actor ?? null,
          subjectUserId: spec.subject(e.payload as Record<string, unknown>) ?? null,
          action: e.type,
          occurredAt: new Date(e.occurredAt),
          persDataCategories: spec.categories,
        },
      });
    });
  }

  /** Чтение журнала (admin), тенант-scoped через guard. */
  list(limit = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { occurredAt: 'desc' }, take: limit });
  }
}
