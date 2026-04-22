import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { SectionCard } from "@/components/ui/SectionCard";
import { updateHourEventTypeForm } from "@/app/actions/hour-event-type-actions";
import {
  createMrotSetting,
  saveGlobalSettings,
  updateOpAddonForm,
  updatePkAddonForm,
  updatePrAddonForm,
} from "@/app/actions/settings-actions";
import { createAdjustment, createSubsidyType, deleteAdjustment } from "@/app/actions/adjustment-actions";

export default async function PayrollSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  /** Ручные корректировки — только действующие сотрудники в учёте (не кандидаты/стажёры/архив). */
  const adjustmentPeopleWhere = {
    AND: [{ status: "active" }, { isVisibleInAccounting: true }],
  };

  const [settings, pkLevels, prLevels, opLevels, mrots, subsidies, adjustments, adjustmentPeople, hourEventTypes] =
    await Promise.all([
    prisma.systemSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.pKLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
    prisma.pRLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
    prisma.oPLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
    prisma.mrotSetting.findMany({ orderBy: { effectiveDate: "desc" }, take: 5 }),
    prisma.subsidy.findMany({ orderBy: { code: "asc" } }),
    prisma.adjustment.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { person: true, subsidyType: true },
      take: 30,
    }),
    prisma.person.findMany({
      where: adjustmentPeopleWhere,
      orderBy: { fullName: "asc" },
    }),
    prisma.hourEventType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const map = Object.fromEntries(settings.map((s) => [s.key, s.value])) as Record<string, string>;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Настройки оплаты"
        description="Глобальные коэффициенты, справочники PK/PR/OP, типы часов и ручные корректировки."
      />

      {sp.err && <InlineNotice variant="danger">{sp.err}</InlineNotice>}
      {sp.ok === "hourtype" && (
        <InlineNotice variant="success" title="Сохранено">
          Настройки типов событий часов обновлены.
        </InlineNotice>
      )}

      <SectionCard
        title="Типы событий учёта часов"
        description="Вес «оплаты» умножает часы при расчёте почасовки; МРОТ и нагрузка задаются флагами по каждому типу."
      >
        <div className="edu-table-shell">
          <table className="payroll-table-quiet min-w-[720px] edu-table-dense">
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>Оплачивать как час</th>
                <th>МРОТ</th>
                <th>Нагрузка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {hourEventTypes.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs text-muted-foreground">{t.code}</td>
                  <td>{t.name}</td>
                  <td>
                    <form action={updateHourEventTypeForm} id={`het-${t.id}`} className="hidden">
                      <input type="hidden" name="id" value={t.id} />
                    </form>
                    <select
                      name="payFactor"
                      form={`het-${t.id}`}
                      defaultValue={Number(t.payFactor).toString()}
                      className="edu-select py-1 text-xs"
                    >
                      <option value="0">0</option>
                      <option value="0.5">0.5</option>
                      <option value="1">1</option>
                    </select>
                  </td>
                  <td>
                    <select
                      name="countsTowardMrot"
                      form={`het-${t.id}`}
                      defaultValue={t.countsTowardMrot ? "true" : "false"}
                      className="edu-select py-1 text-xs"
                    >
                      <option value="true">да</option>
                      <option value="false">нет</option>
                    </select>
                  </td>
                  <td>
                    <select
                      name="countsTowardLoad"
                      form={`het-${t.id}`}
                      defaultValue={t.countsTowardLoad ? "true" : "false"}
                      className="edu-select py-1 text-xs"
                    >
                      <option value="true">да</option>
                      <option value="false">нет</option>
                    </select>
                  </td>
                  <td>
                    <button type="submit" form={`het-${t.id}`} className="edu-btn-muted px-2 py-1 text-xs">
                      OK
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Глобальные" description="Базовая ставка и параметры, влияющие на расчёт и документы.">
        <form action={saveGlobalSettings} className="edu-form-section max-w-lg space-y-4 text-sm">
          <div>
            <label className="edu-field-label">База ₽/ч</label>
            <input name="baseHourRateRub" defaultValue={map.baseHourRateRub ?? "750"} className="edu-input mt-2" />
          </div>
          <div>
            <label className="edu-field-label">Длительность урока (мин)</label>
            <input name="lessonDurationMinutes" defaultValue={map.lessonDurationMinutes ?? "45"} className="edu-input mt-2" />
          </div>
          <div>
            <label className="edu-field-label">Название школы (для приказов)</label>
            <input name="schoolName" defaultValue={map.schoolName ?? ""} className="edu-input mt-2" />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-elevated/50 px-4 py-3">
            <input
              type="checkbox"
              name="prHourlyPayEnabled"
              defaultChecked={map.prHourlyPayEnabled !== "false"}
              className="edu-checkbox mt-0.5"
            />
            <span className="text-sm text-foreground">Учитывать PR в почасовой надбавке</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-elevated/50 px-4 py-3">
            <input
              type="checkbox"
              name="opHourlyPayEnabled"
              defaultChecked={map.opHourlyPayEnabled !== "false"}
              className="edu-checkbox mt-0.5"
            />
            <span className="text-sm text-foreground">Учитывать OP в почасовой надбавке</span>
          </label>
          <button type="submit" className="edu-btn-primary">
            Сохранить
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Таблица PK (надбавка ₽/ч)">
        <div className="space-y-2">
          {pkLevels.map((pk) => (
            <form key={pk.id} action={updatePkAddonForm} className="flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="pkLevelId" value={pk.id} />
              <span className="w-24 font-mono text-muted-foreground">{pk.code}</span>
              <input name="hourlyAddonRub" defaultValue={pk.addon?.hourlyAddonRub?.toString() ?? "0"} className="edu-input max-w-[140px] py-1.5" />
              <button type="submit" className="edu-btn-muted py-1.5 text-xs">
                OK
              </button>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="PR / OP надбавки ₽/ч">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            {prLevels.map((x) => (
              <form key={x.id} action={updatePrAddonForm} className="mb-2 flex items-end gap-2 text-sm">
                <input type="hidden" name="prLevelId" value={x.id} />
                <span className="w-20 font-mono text-muted-foreground">{x.code}</span>
                <input name="hourlyAddonRub" defaultValue={x.addon?.hourlyAddonRub?.toString() ?? "0"} className="edu-input max-w-[140px] py-1.5" />
                <button type="submit" className="edu-btn-muted py-1.5 text-xs">
                  OK
                </button>
              </form>
            ))}
          </div>
          <div>
            {opLevels.map((x) => (
              <form key={x.id} action={updateOpAddonForm} className="mb-2 flex items-end gap-2 text-sm">
                <input type="hidden" name="opLevelId" value={x.id} />
                <span className="w-20 font-mono text-muted-foreground">{x.code}</span>
                <input name="hourlyAddonRub" defaultValue={x.addon?.hourlyAddonRub?.toString() ?? "0"} className="edu-input max-w-[140px] py-1.5" />
                <button type="submit" className="edu-btn-muted py-1.5 text-xs">
                  OK
                </button>
              </form>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="МРОТ">
        <form action={createMrotSetting} className="max-w-lg space-y-3 text-sm">
          <div>
            <label className="block font-medium text-foreground">Федеральный МРОТ / мес</label>
            <input name="federalMrotMonthly" required className="edu-input mt-1" defaultValue="19242" />
          </div>
          <div>
            <label className="block font-medium text-foreground">Региональное переопределение (пусто = федерал)</label>
            <input name="regionalOverrideMonthly" className="edu-input mt-1" />
          </div>
          <div>
            <label className="block font-medium text-foreground">Дата вступления</label>
            <input name="effectiveDate" type="date" required className="edu-input mt-1" defaultValue="2026-01-01" />
          </div>
          <div>
            <label className="block font-medium text-foreground">Заметки</label>
            <textarea name="notes" rows={2} className="edu-textarea mt-1" />
          </div>
          <button type="submit" className="edu-btn-primary">
            Добавить запись МРОТ
          </button>
        </form>
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {mrots.map((m) => (
            <li key={m.id}>
              с {m.effectiveDate.toLocaleDateString("ru-RU")}: фед {m.federalMrotMonthly.toString()}, регион{" "}
              {m.regionalOverrideMonthly?.toString() ?? "—"}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Типы субсидий / выплат">
        <div className="edu-table-shell">
          <table className="payroll-table-quiet min-w-[720px] w-full edu-table-dense">
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>fix</th>
                <th>МРОТ</th>
                <th>час</th>
                <th>ручн.</th>
                <th>источник</th>
              </tr>
            </thead>
            <tbody>
              {subsidies.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.code}</td>
                  <td>{s.name}</td>
                  <td className="text-center">{s.isFixComponent ? "✓" : ""}</td>
                  <td className="text-center">{s.countsTowardMrot ? "✓" : ""}</td>
                  <td className="text-center">{s.isHourly ? "✓" : ""}</td>
                  <td className="text-center">{s.isManual ? "✓" : ""}</td>
                  <td className="text-xs text-muted-foreground">{s.paymentSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={createSubsidyType} className="mt-6 max-w-xl space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <input name="code" placeholder="код" required className="edu-input" />
            <input name="name" placeholder="название" required className="edu-input" />
          </div>
          <div className="flex flex-wrap gap-4 text-foreground">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isFixComponent" /> fix
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="countsTowardMrot" /> МРОТ
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isHourly" /> почас.
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isManual" defaultChecked /> ручн.
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Источник платежа</label>
            <select name="paymentSource" className="edu-select mt-1" defaultValue="school_budget">
              <option value="school_budget">бюджет школы</option>
              <option value="regional_subsidy">региональная субсидия</option>
              <option value="grant">грант</option>
              <option value="other">прочее</option>
            </select>
          </div>
          <button type="submit" className="edu-btn-secondary">
            Добавить тип
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Ручные корректировки">
        <form action={createAdjustment} className="edu-action-slab mb-6 grid max-w-5xl gap-2 text-sm lg:grid-cols-8">
          <select name="personId" required className="edu-select lg:col-span-2">
            <option value="">— человек —</option>
            {adjustmentPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
          <select name="subsidyTypeId" className="edu-select lg:col-span-2">
            <option value="">тип (опц.)</option>
            {subsidies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <input name="year" type="number" defaultValue={2026} required className="edu-input" />
          <input name="month" type="number" defaultValue={4} min={1} max={12} required className="edu-input" />
          <input name="title" placeholder="название" required className="edu-input lg:col-span-2" />
          <input name="amount" type="number" step="0.01" placeholder="сумма" required className="edu-input" />
          <select name="direction" className="edu-select">
            <option value="plus">+</option>
            <option value="minus">−</option>
          </select>
          <input name="notes" placeholder="заметка" className="edu-input lg:col-span-3" />
          <button type="submit" className="edu-btn-primary">
            Добавить
          </button>
        </form>
        <div className="edu-table-shell">
          <table className="payroll-table-quiet min-w-full edu-table-dense">
            <thead>
              <tr>
                <th>Кто</th>
                <th>Период</th>
                <th>Заголовок</th>
                <th className="text-right">Сумма</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td>{a.person.fullName}</td>
                  <td className="tabular-nums">
                    {a.year}-{String(a.month).padStart(2, "0")}
                  </td>
                  <td>{a.title}</td>
                  <td className="text-right tabular-nums">
                    {a.direction === "plus" ? "+" : "−"}
                    {a.amount.toString()}
                  </td>
                  <td>
                    <form action={deleteAdjustment}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="edu-btn-danger text-xs">
                        удалить
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
