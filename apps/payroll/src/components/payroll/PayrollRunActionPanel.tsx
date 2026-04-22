import {
  finalizePayrollRunForm,
  reopenPayrollRunForm,
  runPayrollCalculationForm,
} from "@/app/actions/payroll-actions";
import { NewPayrollRunForm, type NewRunPeriodOption } from "@/components/payroll/NewPayrollRunForm";
import { PayrollPeriodCalendar } from "@/components/PayrollPeriodCalendar";
import type { MonthRunInfo } from "@/components/PayrollPeriodCalendar";
import Link from "next/link";
import type { PayrollPeriod, PayrollRun } from "@/generated/prisma";
import { payrollRunStatusLabelRu } from "@/lib/display-labels";

type Props = {
  newRunPeriodOptions: NewRunPeriodOption[];
  runs: (PayrollRun & { period: PayrollPeriod })[];
  activeRunId: string | null;
  activeRun: (PayrollRun & { period: PayrollPeriod }) | null;
  isFinalized: boolean;
  canFinalize: boolean;
  lineCount: number;
  /** Сколько строк в БД скрыто: без привязки Person.systemUserId к EDUMED. */
  excludedLegacyLines?: number;
  calendarYear: number;
  monthTiles: MonthRunInfo[];
  /** Выделение плитки месяца (из URL year/month или активного прогона). */
  selectedCalYear: number | undefined;
  selectedCalMonth: number | undefined;
};

/**
 * Single command slab: primary action (finalize when ready, else recalc), quiet navigation.
 */
export function PayrollRunActionPanel({
  newRunPeriodOptions,
  runs,
  activeRunId,
  activeRun,
  isFinalized,
  canFinalize,
  lineCount,
  excludedLegacyLines = 0,
  calendarYear,
  monthTiles,
  selectedCalYear,
  selectedCalMonth,
}: Props) {
  const calcDisabled = !activeRunId || isFinalized;
  const calcTitle = !activeRunId
    ? "Выберите период в списке или в календаре"
    : isFinalized
      ? "Сначала откройте расчёт заново"
      : undefined;
  const finalizeIsPrimary = Boolean(canFinalize && activeRunId);
  const recalcIsPrimary = Boolean(activeRunId && !isFinalized && !finalizeIsPrimary);

  return (
    <div className="overflow-hidden rounded-2xl bg-card/95 ring-1 ring-border/50 lg:grid lg:grid-cols-2 lg:items-stretch lg:divide-x lg:divide-border/60">
      <div className="flex min-h-0 flex-col p-5 lg:min-h-[22rem] lg:p-6">
        <h2 className="text-sm font-semibold text-foreground">Расчёт за период</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          «Прогон» — один расчёт зарплаты за календарный месяц. Выберите период в списке ниже или плитку месяца в
          календаре справа; отдельного выпадающего списка «прогон» нет — активный расчёт подсвечен.
        </p>

        {activeRun && (
          <div className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/40 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">{activeRun.period.label}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="text-muted-foreground">{payrollRunStatusLabelRu(activeRun.status)}</span>
          </div>
        )}

        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Расчёты по периодам</p>
        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-sm">
          {runs.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border/80 px-2.5 py-3 text-xs text-muted-foreground">
              Пока нет ни одного расчёта — создайте его через «Новый расчёт» ниже или откройте месяц в календаре справа (если
              для месяца уже есть расчёт).
            </li>
          ) : (
            runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/run?run=${r.id}&year=${r.period.year}&month=${r.period.month}`}
                  className={
                    r.id === activeRunId
                      ? "block rounded-lg bg-accent-soft/60 px-2.5 py-1.5 font-medium text-accent-foreground ring-1 ring-accent/20"
                      : "block rounded-lg px-2.5 py-1.5 text-muted-foreground transition hover:bg-elevated hover:text-foreground"
                  }
                >
                  <span className="block">{r.period.label}</span>
                  <span className="text-xs font-normal text-subtle-foreground">
                    {payrollRunStatusLabelRu(r.status)}
                    {r.calculatedAt
                      ? ` · ${r.calculatedAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>

        <NewPayrollRunForm periodOptions={newRunPeriodOptions} />

        {activeRunId && (
          <form action={runPayrollCalculationForm} className="mt-4 space-y-2 border-t border-border/50 pt-4">
            <input type="hidden" name="runId" value={activeRunId} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={calcDisabled}
                className={recalcIsPrimary ? "edu-btn-primary py-2 text-sm" : "edu-btn-secondary py-2 text-sm"}
                title={calcTitle}
              >
                Пересчитать
              </button>
              {!isFinalized && lineCount === 0 && (
                <span className="text-xs text-muted-foreground">Нет строк — выполните расчёт.</span>
              )}
              {!isFinalized && lineCount > 0 && excludedLegacyLines === lineCount && (
                <span className="text-xs text-amber-800 dark:text-amber-200">
                  Все строки расчёта — по карточкам без привязки к EDUMED; таблицы ниже пусты. Синхронизируйте кадры и пересчитайте.
                </span>
              )}
            </div>
            {isFinalized && (
              <p className="text-xs text-muted-foreground">Пересчёт недоступен: прогон закрыт. Откройте заново ниже.</p>
            )}
          </form>
        )}

        {canFinalize && activeRunId && (
          <form action={finalizePayrollRunForm} className="mt-4 space-y-3 rounded-xl bg-elevated/80 p-3 ring-1 ring-border/50">
            <input type="hidden" name="runId" value={activeRunId} />
            <p className="text-sm font-medium text-foreground">Финализировать</p>
            <p className="text-xs text-muted-foreground">Блокирует пересчёт до открытия.</p>
            <label className="block text-sm">
              <span className="text-muted-foreground">Причина (обязательно)</span>
              <textarea
                name="reason"
                required
                placeholder="Зафиксировано для выплаты…"
                className="edu-textarea mt-1"
                rows={2}
              />
            </label>
            <button type="submit" className={finalizeIsPrimary ? "edu-btn-primary w-full sm:w-auto" : "edu-btn-secondary"}>
              Финализировать
            </button>
          </form>
        )}

        {isFinalized && activeRunId && (
          <form action={reopenPayrollRunForm} className="mt-4 space-y-3 rounded-xl border border-warning/25 bg-warning-soft/30 p-3">
            <input type="hidden" name="runId" value={activeRunId} />
            <p className="text-sm font-medium text-foreground">Открыть заново</p>
            <p className="text-xs text-muted-foreground">Аудит фиксирует действие.</p>
            <label className="block text-sm">
              <span className="text-muted-foreground">Причина (обязательно)</span>
              <textarea name="reason" required className="edu-textarea mt-1" rows={2} placeholder="Исправление начислений…" />
            </label>
            <button type="submit" className="edu-btn-muted w-full border-warning/30 text-warning sm:w-auto">
              Открыть заново
            </button>
          </form>
        )}

        <Link href={`/calendar?year=${calendarYear}`} className="edu-btn-ghost mt-auto pt-5 inline-flex">
          Календарь периодов →
        </Link>
      </div>

      <div className="flex min-h-0 flex-col border-t border-border/60 p-5 lg:min-h-[22rem] lg:border-t-0 lg:p-6">
        <h2 className="text-sm font-semibold text-foreground">Календарь · {calendarYear}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Клик по месяцу — тот же выбор периода, что и в списке слева.</p>
        <div className="mt-3 min-h-0 flex-1">
          <PayrollPeriodCalendar
            embedded
            year={calendarYear}
            months={monthTiles}
            selectedYear={selectedCalYear}
            selectedMonth={selectedCalMonth}
          />
        </div>
      </div>
    </div>
  );
}
