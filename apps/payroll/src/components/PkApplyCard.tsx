"use client";

import { applyFixedPkFromForm } from "@/app/actions/person-actions";
import { useMemo, useState } from "react";
import type { PkApplyPreviewDto } from "@/lib/payroll/pk-apply-preview";

type Props = {
  personId: string;
  dto: PkApplyPreviewDto;
};

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

export function PkApplyCard({ personId, dto }: Props) {
  const [reason, setReason] = useState("");

  const canSubmit = useMemo(() => {
    return dto.canApply && dto.preview !== null && reason.trim().length > 0;
  }, [dto.canApply, dto.preview, reason]);

  if (!dto.canApply || !dto.preview) {
    return dto.blockReason ? (
      <div className="rounded-xl border border-border bg-elevated px-4 py-3 text-sm text-muted-foreground">{dto.blockReason}</div>
    ) : null;
  }

  const p = dto.preview;

  return (
    <div className="space-y-4">
      <div className="edu-section-title">Подтверждение изменений</div>

      {dto.warning && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">{dto.warning}</div>
      )}

      <div className="edu-table-shell overflow-hidden">
        <table className="edu-table">
          <thead>
            <tr>
              <th></th>
              <th>Было</th>
              <th>Станет</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-medium text-foreground">PK надбавка</td>
              <td className="tabular-nums">+{formatRub(p.oldPkAddon)} ₽/ч</td>
              <td className="tabular-nums">+{formatRub(p.newPkAddon)} ₽/ч</td>
            </tr>
            <tr>
              <td className="font-medium text-foreground">Итоговая ставка</td>
              <td className="tabular-nums">{formatRub(p.oldRate)} ₽/ч</td>
              <td className="tabular-nums">{formatRub(p.newRate)} ₽/ч</td>
            </tr>
            <tr>
              <td className="font-medium text-foreground">Оценка за период</td>
              <td className="tabular-nums" colSpan={2}>
                {formatRub(p.estimatedMonthlyDelta)} ₽/мес при {dto.currentPeriodHours} уч. ч.
                {dto.periodLabel ? <span className="text-muted-foreground"> ({dto.periodLabel})</span> : null}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        База для формулы: {formatRub(dto.baseHourRateUsed)} ₽/ч (override или глобальная). Ставка = база + PK + (PR) + (OP) по
        настройкам.
      </p>

      <form action={applyFixedPkFromForm} className="space-y-3 border-t border-border pt-4">
        <input type="hidden" name="personId" value={personId} />
        <label className="block text-sm font-medium text-foreground">Причина применения PK (обязательно)</label>
        <textarea
          name="pkApplyReason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="edu-textarea"
          placeholder="Решение администрации…"
        />
        <button type="submit" disabled={!canSubmit} className="edu-btn-primary disabled:opacity-45">
          Применить рекомендованный PK к текущему и фиксированному
        </button>
        {!canSubmit && reason.trim().length === 0 && (
          <p className="text-xs text-muted-foreground">Укажите причину — без неё применение недоступно.</p>
        )}
      </form>
    </div>
  );
}
