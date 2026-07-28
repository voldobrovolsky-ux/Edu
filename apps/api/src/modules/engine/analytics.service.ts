import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { TenantContext } from '../../common/tenant/tenant-context';
import { newEvent } from '../../common/events/domain-event';
import { ENGINE_EVENTS, type KtpShiftProposedV1 } from './engine.contract';

// Пороги персонализации (Движок §6): риск ниже RISK; показываем только при достаточной уверенности.
const RISK = 0.5;
const MIN_CONFIDENCE = 0.5;
const TOPIC_REVIEW_PCT = 60;

/**
 * Персонализация (Движок §6): движок ПРЕДЛАГАЕТ (atRisk/topicsReview/сдвиг), человек РЕШАЕТ.
 * Авто-применения ИОМ-сдвига к плану НЕТ — `ktp.shift.proposed` ждёт `ktp.approved`.
 * atRisk без достаточного confidence НЕ показывается (Движок §6).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async classAnalytics(classId: string, disciplineId: string) {
    const students = await this.prisma.student.findMany({ where: { classId }, select: { id: true, displayName: true } });
    const nameById = new Map(students.map((s) => [s.id, s.displayName]));
    const edges = await this.prisma.masteryEdge.findMany({
      where: { studentId: { in: students.map((s) => s.id) }, competencyNode: { disciplineId } },
      include: { competencyNode: true },
    });

    // atRisk: низкий score + достаточный confidence
    const atRisk = edges
      .filter((e) => e.score != null && e.score < RISK && e.confidence >= MIN_CONFIDENCE)
      .map((e) => ({
        studentId: e.studentId, // UI учителя — реальное имя; ИИ-граница (ai-query) — гейт id→code
        studentName: nameById.get(e.studentId) ?? e.studentId,
        arCode: e.competencyNode.fgosArCode,
        reason: `mastery ${Math.round((e.score ?? 0) * 100)}% (conf ${Math.round(e.confidence * 100)}%)`,
        action: 'индивидуальная дифференциация',
      }));

    // topicsReview: классовый агрегат по arCode (только уверенные сигналы)
    const byCode: Record<string, number[]> = {};
    for (const e of edges)
      if (e.score != null && e.confidence >= MIN_CONFIDENCE) (byCode[e.competencyNode.fgosArCode] ??= []).push(e.score);
    const topicsReview = Object.entries(byCode)
      .map(([arCode, scores]) => ({
        arCode,
        classPct: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100),
        evidence: `${scores.length} учеников`,
      }))
      .filter((t) => t.classPct < TOPIC_REVIEW_PCT);

    return { atRisk, topicsReview };
  }

  /** Предложение корректировки КТП → ktp.shift.proposed (предложение, БЕЗ авто-применения). */
  async proposeKtpAdjust(lessonId: string, action: string, teacherId: string, reason?: string) {
    const ws = TenantContext.require();
    await this.prisma.$transaction((tx) =>
      this.outbox.enqueue(
        tx,
        newEvent<KtpShiftProposedV1>({
          type: ENGINE_EVENTS.ktpShiftProposed,
          workspaceId: ws,
          actor: teacherId,
          payload: { lessonId, action, reason },
        }),
      ),
    );
    return { ok: true, proposed: { lessonId, action }, note: 'ждёт решения человека (ktp.approved)' };
  }
}
