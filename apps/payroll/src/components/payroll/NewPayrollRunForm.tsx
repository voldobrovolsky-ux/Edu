"use client";

import { useMemo, useState } from "react";
import { createPayrollRunForm } from "@/app/actions/payroll-actions";

export type NewRunPeriodOption = {
  periodId: string;
  label: string;
  /** Уже есть хотя бы один прогон за период — создание дубля отключено. */
  hasRun: boolean;
};

type Props = {
  periodOptions: NewRunPeriodOption[];
};

export function NewPayrollRunForm({ periodOptions }: Props) {
  const [periodId, setPeriodId] = useState("");

  const available = useMemo(() => periodOptions.filter((o) => !o.hasRun), [periodOptions]);
  const noAvailable = available.length === 0;

  const canSubmit = Boolean(periodId) && !noAvailable;

  return (
    <form action={createPayrollRunForm} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/50 pt-4">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Новый расчёт (прогон)
        </label>
        <select
          name="periodId"
          required={!noAvailable}
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          disabled={noAvailable}
          className="edu-select w-full min-w-[180px] py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Период для нового расчёта"
        >
          {noAvailable ? (
            <option value="">Нет доступных периодов</option>
          ) : (
            <>
              <option value="">Выберите период…</option>
              {periodOptions.map((o) => (
                <option key={o.periodId} value={o.periodId} disabled={o.hasRun}>
                  {o.label}
                  {o.hasRun ? " (уже создан)" : ""}
                </option>
              ))}
            </>
          )}
        </select>
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="edu-btn-secondary shrink-0 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        title={noAvailable ? "Все периоды уже имеют расчёт" : !periodId ? "Выберите период в списке" : undefined}
      >
        Создать
      </button>
    </form>
  );
}
