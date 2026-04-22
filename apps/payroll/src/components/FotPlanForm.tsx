import { saveFotPlanForm } from "@/app/actions/fot-plan-actions";

type Props = {
  periodId: string;
  periodLabel: string;
  initialPlannedRub: string;
  initialNote: string;
  /** Куда вернуться после сохранения (path + query). */
  returnTo?: string;
};

export function FotPlanForm({ periodId, periodLabel, initialPlannedRub, initialNote, returnTo = "/run" }: Props) {
  return (
    <form action={saveFotPlanForm} className="edu-card space-y-3 p-5 text-sm">
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <div className="font-semibold text-foreground">План ФОТ на месяц</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Период: {periodLabel}</p>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Сумма, ₽</span>
        <input
          type="text"
          name="plannedFotTotal"
          defaultValue={initialPlannedRub}
          placeholder="0"
          className="edu-input mt-1 max-w-xs"
          autoComplete="off"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Комментарий (необязательно)</span>
        <textarea name="note" defaultValue={initialNote} rows={2} className="edu-textarea mt-1 max-w-lg" />
      </label>
      <button type="submit" className="edu-btn-primary">
        Сохранить план
      </button>
      <p className="text-xs text-muted-foreground">Сохранение фиксируется в аудите; влияет на план/факт и календарь.</p>
    </form>
  );
}
