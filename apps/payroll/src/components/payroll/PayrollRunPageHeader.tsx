import { RunStatusBadge } from "@/components/ui/StatusBadge";
import type { PayrollPeriod, PayrollRun } from "@/generated/prisma";

type Props = {
  activeRun: (PayrollRun & { period: PayrollPeriod }) | null;
  isFinalized: boolean;
};

/**
 * Command-surface header: title + period cluster, status chip, muted run metadata below.
 */
export function PayrollRunPageHeader({ activeRun, isFinalized }: Props) {
  return (
    <header className="border-b border-border/80 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">Расчёт выплат</h1>
          {activeRun ? (
            <>
              <p className="text-lg font-medium leading-snug text-foreground">{activeRun.period.label}</p>
              <p className="text-sm text-muted-foreground">Прогон, ФОТ и детализация по педагогам</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Выберите прогон ниже или создайте новый для периода.</p>
          )}
        </div>
        {activeRun && (
          <div className="flex shrink-0 items-center gap-2 sm:pt-1">
            <RunStatusBadge status={activeRun.status} finalized={isFinalized} />
          </div>
        )}
      </div>

      {activeRun && (
        <div className="mt-4 flex flex-col gap-1 border-t border-border/60 pt-4 text-xs text-subtle-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {activeRun.calculatedAt && (
              <span>
                Расчёт: {activeRun.calculatedAt.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            )}
            {activeRun.finalizedAt && (
              <span>
                Финализация: {activeRun.finalizedAt.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            )}
            {!activeRun.calculatedAt && !activeRun.finalizedAt && <span>Даты расчёта ещё не зафиксированы</span>}
          </div>
        </div>
      )}

      {isFinalized && activeRun && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft/35 px-3 py-2.5 text-xs leading-snug text-foreground">
          <span className="mt-0.5 shrink-0 text-warning" aria-hidden>
            ●
          </span>
          <span>
            Прогон закрыт: пересчёт недоступен до открытия заново. Учёт часов по периоду также защищён.
          </span>
        </div>
      )}
    </header>
  );
}
