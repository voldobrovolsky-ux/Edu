import { Injectable, Logger } from '@nestjs/common';
import {
  EventBus,
  type EventHandler,
  type Subscription,
  subjectMatches,
} from './event-bus';
import { type DomainEvent, MAX_CASCADE_DEPTH } from './domain-event';

/**
 * In-process транспорт шины (dev/тест). В проде заменяется на NATS JetStream
 * (durable consumers, dedup по Nats-Msg-Id = event.id, max_deliver + DLQ) —
 * без изменения параметров: интерфейс EventBus тот же.
 */
@Injectable()
export class InProcessEventBus extends EventBus {
  private readonly subs: Subscription[] = [];
  private readonly log = new Logger('EventBus');

  subscribe(pattern: string, consumer: string, handler: EventHandler): void {
    this.subs.push({ pattern, consumer, handler });
    this.log.log(`подписка ${consumer} ← ${pattern}`);
  }

  async publish(event: DomainEvent): Promise<void> {
    // depth-guard: обрываем потенциальную петлю каскада
    if (event.depth > MAX_CASCADE_DEPTH) {
      this.log.error(
        `DROP ${event.type} depth=${event.depth} > MAX (защита от петли) corr=${event.correlationId}`,
      );
      return;
    }
    const matched = this.subs.filter((s) => subjectMatches(s.pattern, event.type));
    this.log.log(`▶ ${event.type} depth=${event.depth} → ${matched.length} подписчик(ов)`);
    for (const s of matched) {
      try {
        await s.handler(event);
      } catch (err) {
        // изоляция: падение одного потребителя не валит остальных.
        // в проде: nak → ретрай с backoff → DLQ. Здесь — лог.
        this.log.error(`✗ consumer "${s.consumer}" на ${event.type}: ${(err as Error).message}`);
      }
    }
  }
}
