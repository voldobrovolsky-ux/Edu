import type { PlanVsFactView } from "@/lib/payroll/fot-plan-vs-fact";
import { formatRub } from "@/lib/format-currency";

type Props = {
  view: PlanVsFactView;
};

export function FotPlanVsFactCard({ view }: Props) {
  if (view.kind === "no_plan") {
    return (
      <div className="edu-card-quiet p-5 text-sm">
        <div className="font-semibold text-foreground">План vs факт ФОТ</div>
        <p className="mt-1 text-muted-foreground">План не задан.</p>
        {view.fact != null && (
          <p className="mt-2 text-foreground">
            Факт (по строкам TOTAL): <span className="font-semibold tabular-nums">{formatRub(view.fact)} ₽</span>
          </p>
        )}
      </div>
    );
  }

  if (view.kind === "plan_no_fact") {
    return (
      <div className="rounded-xl border border-info/30 bg-info-soft p-5 text-sm text-info">
        <div className="font-semibold">План vs факт ФОТ</div>
        <p className="mt-1">
          План: <span className="font-semibold tabular-nums text-foreground">{formatRub(view.plan)} ₽</span>
        </p>
        <p className="mt-2 text-sm">Факт недоступен: нет рассчитанного прогона или строк за период.</p>
        {view.note && <p className="mt-3 text-xs opacity-90">Комментарий к плану: {view.note}</p>}
      </div>
    );
  }

  const tone =
    view.status === "above"
      ? "border-warning/35 bg-warning-soft text-warning"
      : "border-success/30 bg-success-soft text-success";

  return (
    <div className={`rounded-xl border px-5 py-4 text-sm shadow-card ${tone}`}>
      <div className="font-semibold text-foreground">План vs факт ФОТ</div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">План</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatRub(view.plan)} ₽</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Факт</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatRub(view.fact)} ₽</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Отклонение (факт − план)</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {view.delta >= 0 ? "+" : ""}
            {formatRub(view.delta)} ₽
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Отклонение %</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {view.deltaPercent != null ? `${view.deltaPercent >= 0 ? "+" : ""}${view.deltaPercent}%` : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs font-medium">
        {view.status === "above" ? "Факт выше плана." : "В пределах плана или ниже."}
      </p>
      {view.note && <p className="mt-2 text-xs text-muted-foreground">Комментарий к плану: {view.note}</p>}
    </div>
  );
}
