"use client";

import { useMemo, useState } from "react";
import { formatPeriodYmRu } from "@/lib/display-labels";

type Period = { year: number; month: number };

function parseKey(k: string): Period {
  const [ys, ms] = k.split("-");
  return { year: parseInt(ys, 10), month: parseInt(ms, 10) };
}

/**
 * Поля year/month для server actions: при наличии календарных периодов из БД — один выбор;
 * иначе — числовые поля (как раньше).
 */
export function YearMonthFormFields({
  periods,
  defaultYear,
  defaultMonth,
  selectClassName = "edu-select sm:col-span-2",
}: {
  periods: Period[];
  defaultYear: number;
  defaultMonth: number;
  /** Сетка формы «Учебные часы» (sm) или «Замены» (lg) — задайте `edu-select lg:col-span-2` для второй. */
  selectClassName?: string;
}) {
  const keys = useMemo(
    () =>
      periods.map((p) => `${p.year}-${p.month}`).filter((k) => {
        const { year, month } = parseKey(k);
        return Number.isFinite(year) && month >= 1 && month <= 12;
      }),
    [periods],
  );

  const initialKey = useMemo(() => {
    const want = `${defaultYear}-${defaultMonth}`;
    if (keys.includes(want)) return want;
    return keys[0] ?? want;
  }, [keys, defaultYear, defaultMonth]);

  const [key, setKey] = useState(initialKey);

  if (periods.length === 0) {
    return (
      <>
        <input
          name="year"
          type="number"
          placeholder="Год"
          defaultValue={defaultYear}
          required
          className="edu-input"
          aria-label="Год"
        />
        <input
          name="month"
          type="number"
          placeholder="Месяц"
          defaultValue={defaultMonth}
          min={1}
          max={12}
          required
          className="edu-input"
          aria-label="Месяц"
        />
      </>
    );
  }

  const { year, month } = parseKey(key);

  return (
    <>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <select
        className={selectClassName}
        value={key}
        aria-label="Период (год и месяц)"
        onChange={(e) => setKey(e.target.value)}
      >
        {periods.map((p) => {
          const k = `${p.year}-${p.month}`;
          return (
            <option key={k} value={k}>
              {formatPeriodYmRu(p.year, p.month)}
            </option>
          );
        })}
      </select>
    </>
  );
}
