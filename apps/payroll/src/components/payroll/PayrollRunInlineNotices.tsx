type Query = { ok?: string; err?: string };

type Props = {
  query: Query;
};

/** Compact query-string feedback — not full-width alert blocks. */
export function PayrollRunInlineNotices({ query }: Props) {
  const items: { key: string; className: string; text: string }[] = [];

  if (query.ok === "finalize") {
    items.push({
      key: "finalize",
      className: "border-success/25 bg-success-soft/80 text-success",
      text: "Прогон финализирован. Пересчёт недоступен до открытия.",
    });
  }
  if (query.ok === "reopen") {
    items.push({
      key: "reopen",
      className: "border-success/25 bg-success-soft/80 text-success",
      text: "Прогон снова открыт для пересчёта.",
    });
  }
  if (query.ok === "fotplan") {
    items.push({
      key: "fotplan",
      className: "border-success/25 bg-success-soft/80 text-success",
      text: "План ФОТ для периода сохранён.",
    });
  }
  if (query.ok === "recalc") {
    items.push({
      key: "recalc",
      className: "border-success/25 bg-success-soft/80 text-success",
      text: "Расчёт зарплаты за период выполнен.",
    });
  }
  if (query.err) {
    items.push({
      key: "err",
      className: "border-danger/25 bg-danger-soft/60 text-danger",
      text: query.err,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {items.map((i) => (
        <p
          key={i.key}
          className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs leading-snug ${i.className}`}
          role={i.key === "err" ? "alert" : "status"}
        >
          <span className="opacity-70" aria-hidden>
            {i.key === "err" ? "!" : "✓"}
          </span>
          {i.text}
        </p>
      ))}
    </div>
  );
}
