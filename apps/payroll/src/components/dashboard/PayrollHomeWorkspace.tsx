import Link from "next/link";
import type { PersonFotRow } from "@/lib/payroll/fot-analytics";
import { Abbr } from "@/components/ui/Abbr";
import { RunStatusBadge } from "@/components/ui/StatusBadge";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { ABBR } from "@/lib/abbr-glossary";
import { employmentTypeLabelRu, workFormatLabelRu } from "@/lib/display-labels";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function shortRole(row: PersonFotRow): string {
  const w = workFormatLabelRu[row.workFormat] ?? row.workFormat;
  const t = employmentTypeLabelRu[row.employmentType] ?? row.employmentType;
  return `${t} · ${w}`;
}

type PeriodDto = { id: string; year: number; month: number; label: string };
type RunDto = {
  id: string;
  status: string;
  finalizedAt: Date | null;
  calculatedAt: Date | null;
  calcError: string | null;
};

type Props = {
  period: PeriodDto | null;
  run: RunDto | null;
  personRows: PersonFotRow[];
  selectedPersonId: string | null;
  runFotTotal: number;
  /** Строки прогона, отброшенные как привязанные к карточкам без EDUMED (старый демо-сид). */
  excludedLegacyLines?: number;
};

export function PayrollHomeWorkspace({
  period,
  run,
  personRows,
  selectedPersonId,
  runFotTotal,
  excludedLegacyLines = 0,
}: Props) {
  const selectedRow = selectedPersonId ? personRows.find((r) => r.personId === selectedPersonId) : null;
  const runHref = run ? `/run?run=${run.id}` : period ? `/run?year=${period.year}&month=${period.month}` : "/run";
  const calendarHref = period ? `/calendar?year=${period.year}&month=${String(period.month)}` : "/calendar";

  return (
    <div className="space-y-6">
      {/* Top: period + run + actions */}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Рабочее место ЗП</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Бухгалтерия · выплаты</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {period ? (
              <span className="inline-flex items-center rounded-lg bg-elevated px-2.5 py-1 font-medium tabular-nums text-foreground ring-1 ring-border">
                Период: {period.label}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Период не выбран —{" "}
                <Link href="/calendar" className="font-medium text-accent hover:underline">
                  выбрать в календаре
                </Link>
              </span>
            )}
            {run ? (
              <>
                <RunStatusBadge status={run.status} finalized={Boolean(run.finalizedAt)} />
                {run.calculatedAt && (
                  <span className="text-xs text-muted-foreground">
                    Расчёт: {run.calculatedAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </>
            ) : period ? (
              <span className="rounded-lg bg-warning-soft/80 px-2.5 py-1 text-xs font-medium text-warning">
                Нет прогона за этот период
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={runHref} className="edu-btn-primary">
            {run ? "Открыть расчёт" : "Перейти к расчёту ЗП"}
          </Link>
          <Link href={calendarHref} className="edu-btn-secondary">
            Календарь периодов
          </Link>
          <Link href="/people" className="edu-btn-muted">
            Все люди
          </Link>
        </div>
      </header>

      {run?.calcError && (
        <InlineNotice variant="danger" title="Ошибка расчёта">
          {run.calcError}
        </InlineNotice>
      )}

      {excludedLegacyLines > 0 && (
        <InlineNotice variant="warning" title="Скрыты строки старого прогона">
          {excludedLegacyLines} строк(и) относятся к карточкам без привязки к учётной записи EDUMED и не показываются здесь. Чтобы видеть выплаты по текущим кадрам из системы, создайте новый прогон и выполните расчёт заново.
        </InlineNotice>
      )}

      {/* Master-detail */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start">
        {/* LEFT: people + money */}
        <section className="min-w-0 rounded-2xl border border-border/70 bg-card shadow-card ring-1 ring-border/40">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Сотрудники и выплаты</h2>
            {run && personRows.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                <Abbr title={ABBR.fot}>ФОТ</Abbr> по прогону:{" "}
                <span className="font-semibold text-foreground">{formatRub(runFotTotal)} ₽</span>
              </span>
            )}
          </div>

          {!period && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
              Нет расчётных периодов. Начните с календаря или настроек.
            </div>
          )}

          {period && !run && (
            <div className="space-y-4 px-4 py-8 sm:px-5">
              <p className="text-sm leading-relaxed text-foreground">
                Для <span className="font-medium tabular-nums">{period.label}</span> ещё нет прогона расчёта. Создайте прогон, чтобы здесь
                появились суммы по людям.
              </p>
              <Link href={`/run?year=${period.year}&month=${period.month}`} className="edu-btn-primary inline-flex">
                Начать расчёт за период
              </Link>
            </div>
          )}

          {run && personRows.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
              {excludedLegacyLines > 0 ? (
                <>
                  Нет строк по сотрудникам из учётных записей EDUMED. В прогоне остались только старые карточки без
                  привязки к системе — откройте расчёт ЗП и пересчитайте после актуализации кадров в «Люди», либо создайте
                  новый прогон.
                </>
              ) : (
                <>В прогоне пока нет строк — выполните расчёт на странице расчёта ЗП.</>
              )}
            </div>
          )}

          {run && personRows.length > 0 && (
            <div className="overflow-x-auto">
              <div className="min-w-[640px] divide-y divide-border/40">
                <div className="grid grid-cols-[minmax(8rem,1fr)_4.5rem_4.5rem_4.5rem_5.5rem] gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:px-5">
                  <span>Сотрудник</span>
                  <span className="text-right">
                    <Abbr title={ABBR.fix}>Fix</Abbr>
                  </span>
                  <span className="text-right">
                    <Abbr title={ABBR.hourly}>Почас.</Abbr>
                  </span>
                  <span className="text-right">
                    <Abbr title={ABBR.flex}>Flex</Abbr>
                  </span>
                  <span className="text-right">Итого</span>
                </div>
                {personRows.map((row) => {
                  const active = row.personId === selectedPersonId;
                  return (
                    <Link
                      key={row.personId}
                      href={`/?person=${row.personId}`}
                      scroll={false}
                      className={`grid grid-cols-[minmax(8rem,1fr)_4.5rem_4.5rem_4.5rem_5.5rem] gap-2 px-4 py-3 text-sm transition sm:px-5 ${
                        active
                          ? "bg-accent-soft/55 ring-1 ring-inset ring-accent/25"
                          : "hover:bg-elevated/80"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{row.fullName}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{shortRole(row)}</div>
                      </div>
                      <span className="text-right tabular-nums text-muted-foreground">{formatRub(row.fix)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{formatRub(row.hourly)}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{formatRub(row.flex)}</span>
                      <span className="text-right font-semibold tabular-nums text-foreground">{formatRub(row.total)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: detail */}
        <aside className="min-w-0 rounded-2xl border border-border/70 bg-elevated/90 shadow-card ring-1 ring-border/30">
          <div className="border-b border-border/50 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Выплата по выбранному</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Снимок по последнему прогону выбранного периода</p>
          </div>

          {!period ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center sm:px-5">
              <span className="text-2xl opacity-40" aria-hidden>
                📋
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Сначала создайте расчётные периоды в календаре и прогон ЗП — тогда здесь появятся суммы по сотрудникам.
              </p>
              <Link href="/calendar" className="edu-btn-secondary text-xs">
                Открыть календарь периодов
              </Link>
            </div>
          ) : !run ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center sm:px-5">
              <span className="text-2xl opacity-40" aria-hidden>
                ⏳
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Для периода <span className="font-medium text-foreground">{period.label}</span> ещё нет прогона расчёта. Создайте его на странице «Расчёт выплат».
              </p>
              <Link href={`/run?year=${period.year}&month=${period.month}`} className="edu-btn-secondary text-xs">
                Перейти к расчёту
              </Link>
            </div>
          ) : personRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground sm:px-5">
              В прогоне пока нет строк по сотрудникам из EDUMED — выполните расчёт или синхронизируйте кадры.
            </div>
          ) : !selectedRow ? (
            <div className="px-4 py-8 text-sm text-muted-foreground sm:px-5">
              {personRows.length > 0
                ? "Выберите сотрудника в списке слева — здесь появится сумма и разбивка."
                : "Нет данных для выбранного человека."}
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <div>
                <Link href={`/people/${selectedRow.personId}`} className="text-lg font-semibold text-foreground hover:text-accent hover:underline">
                  {selectedRow.fullName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">{shortRole(selectedRow)}</p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">К выплате</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{formatRub(selectedRow.total)} ₽</p>
              </div>

              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Abbr title={ABBR.fix}>Fix</Abbr>
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatRub(selectedRow.fix)} ₽</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Abbr title={ABBR.hourly}>Почас.</Abbr>
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatRub(selectedRow.hourly)} ₽</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Abbr title={ABBR.flex}>Flex</Abbr>
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatRub(selectedRow.flex)} ₽</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
                <Link href={`/run?run=${run.id}`} className="edu-btn-secondary text-xs">
                  Полный расчёт ЗП
                </Link>
                <Link href={`/people/${selectedRow.personId}`} className="edu-btn-muted text-xs">
                  Карточка человека
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
