import { prisma } from "@/lib/db";
import { loadPkApplyPreview } from "@/lib/payroll/pk-apply-preview";
import { notFound } from "next/navigation";
import { PersonProfileForm } from "@/components/PersonProfileForm";
import { PkApplyCard } from "@/components/PkApplyCard";
import { CandidateRecommendationPanel } from "@/components/CandidateRecommendationPanel";
import { QuestionnaireAnswersPanel } from "@/components/QuestionnaireAnswersPanel";
import { approveRecommendationForm, rejectRecommendationForm } from "@/app/actions/recommendation-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink } from "@/components/ui/BackLink";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { SectionCard } from "@/components/ui/SectionCard";
import { KpiStat } from "@/components/ui/KpiStat";
import { branchRuleDisplayName, educationLevelLabelRu } from "@/lib/display-labels";

function pkWithAddon(
  level: { code: string; addon?: { hourlyAddonRub: unknown } | null } | null,
): string {
  if (!level) return "—";
  const add = level.addon?.hourlyAddonRub != null ? String(level.addon.hourlyAddonRub) : "0";
  return `${level.code} (+${add} ₽/ч)`;
}

export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { personId } = await params;
  const sp = await searchParams;
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      officialCategory: true,
      internalCategory: true,
      currentPK: { include: { addon: true } },
      fixedPK: { include: { addon: true } },
      recommendedPK: { include: { addon: true } },
      prLevel: { include: { addon: true } },
      opLevel: { include: { addon: true } },
      branchRule: true,
      employeeProfile: true,
      candidateProfile: true,
    },
  });
  if (!person) notFound();

  const [catsOff, catsIn, pk, pr, op, branches, recommendations] = await Promise.all([
    prisma.categoryOfficial.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.categoryInternal.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pKLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
    prisma.pRLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
    prisma.oPLevel.findMany({ orderBy: { sortOrder: "asc" }, include: { addon: true } }),
    prisma.candidateBranchRule.findMany({ orderBy: { priority: "desc" } }),
    prisma.rateChangeRecommendation.findMany({
      where: { personId, status: "pending" },
      include: { proposedPK: { include: { addon: true } } },
    }),
  ]);

  const base = await prisma.systemSetting.findUnique({ where: { key: "baseHourRateRub" } });
  const baseRate = base?.value ?? "750";

  const pkApplyDto = await loadPkApplyPreview(personId);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BackLink href="/people">К списку людей</BackLink>
        <PageHeader
          title={person.fullName}
          meta={
            person.systemUsername
              ? `Карточка сотрудника · учётная запись EDUMED @${person.systemUsername}`
              : "Карточка сотрудника · PK, ставка, рекомендации"
          }
        />
      </div>

      {sp.err && <InlineNotice variant="danger">{sp.err}</InlineNotice>}
      {sp.ok === "pk" && (
        <InlineNotice variant="success" title="PK применён">
          Черновик приказа доступен в разделе «Приказы».
        </InlineNotice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiStat label="PK текущий" value={pkWithAddon(person.currentPK)} emphasize hint="Меняется через применение PK и приказ." />
        <KpiStat label="PK фиксированный" value={pkWithAddon(person.fixedPK)} hint="Опорный уровень для расчёта и приказов." />
        <KpiStat label="PK рекомендованный" value={pkWithAddon(person.recommendedPK)} hint="Целевой уровень до утверждения." />
      </div>

      <SectionCard
        title="Рекомендации и применение PK"
        description="Сначала обработайте входящие рекомендации; затем при необходимости подтвердите ручное применение PK с причиной и превью ставки."
      >
        <div className="space-y-8 border-l-4 border-accent pl-5">
          <div>
            <div className="edu-section-title mb-3">Рекомендации</div>
            {recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет ожидающих рекомендаций.</p>
            ) : (
              <ul className="space-y-4">
                {recommendations.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
                    <p className="text-foreground">{r.reasonText}</p>
                    <p className="mt-2 text-muted-foreground">
                      Предлагаемый PK: <span className="font-medium text-foreground">{r.proposedPK?.code ?? "—"}</span>
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action={approveRecommendationForm}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="applyPk" value="true" />
                        <button type="submit" className="edu-btn-primary">
                          Утвердить и применить PK
                        </button>
                      </form>
                      <form action={approveRecommendationForm}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="applyPk" value="false" />
                        <button type="submit" className="edu-btn-secondary">
                          Утвердить без смены PK
                        </button>
                      </form>
                      <form action={rejectRecommendationForm}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="edu-btn-danger">
                          Отклонить
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="edu-section-title mb-3">Установить коэффициент вручную</div>
            <PkApplyCard personId={person.id} dto={pkApplyDto} />
          </div>
        </div>
      </SectionCard>

      <PersonProfileForm personId={person.id}>
        <SectionCard title="Профиль и параметры оплаты" description="Контактные данные, категории, PR/OP, база и фикс. Текущий PK в форме ниже — только для справки; смена через блок выше.">
          <div className="grid max-w-3xl gap-5">
            <div>
              <label className="edu-field-label">ФИО *</label>
              <input name="fullName" required defaultValue={person.fullName} className="edu-input mt-2" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="edu-field-label">Email</label>
                <input name="email" type="email" defaultValue={person.email ?? ""} className="edu-input mt-2" />
              </div>
              <div>
                <label className="edu-field-label">Телефон</label>
                <input name="phone" defaultValue={person.phone ?? ""} className="edu-input mt-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="edu-field-label">Статус</label>
                <select name="status" defaultValue={person.status} className="edu-select mt-2">
                  <option value="candidate">Кандидат</option>
                  <option value="trainee">Стажёр</option>
                  <option value="active">Активный</option>
                  <option value="archived">В архиве</option>
                </select>
              </div>
              <div>
                <label className="edu-field-label">Трудоустройство</label>
                <select name="employmentType" defaultValue={person.employmentType} className="edu-select mt-2">
                  <option value="no_labor_contract">ГПХ / без ТД</option>
                  <option value="labor_contract">Трудовой договор</option>
                </select>
              </div>
              <div>
                <label className="edu-field-label">Формат</label>
                <select name="workFormat" defaultValue={person.workFormat} className="edu-select mt-2">
                  <option value="trainee">Стажёр</option>
                  <option value="staff">Штат</option>
                  <option value="part_time">Совместитель</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="edu-field-label">Официальная категория</label>
                <select name="officialCategoryId" defaultValue={person.officialCategoryId ?? ""} className="edu-select mt-2">
                  <option value="">—</option>
                  {catsOff.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="edu-field-label">Внутренняя категория</label>
                <select name="internalCategoryId" defaultValue={person.internalCategoryId ?? ""} className="edu-select mt-2">
                  <option value="">—</option>
                  {catsIn.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="edu-field-label">PK текущий</label>
                <div className="mt-2 rounded-lg border border-dashed border-border-strong bg-elevated px-3 py-2 text-sm text-foreground">
                  {person.currentPK ? `${person.currentPK.code} (+${person.currentPK.addon?.hourlyAddonRub?.toString() ?? 0} ₽/ч)` : "—"}
                </div>
                <p className="edu-field-hint">
                  Меняется только через «Применить рекомендованный PK» с причиной и приказом, не через эти поля.
                </p>
              </div>
              <div>
                <label className="edu-field-label">PK фиксированный</label>
                <select name="fixedPKLevelId" defaultValue={person.fixedPKLevelId ?? ""} className="edu-select mt-2">
                  <option value="">—</option>
                  {pk.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="edu-field-label">PK рекомендованный</label>
                <select name="recommendedPKLevelId" defaultValue={person.recommendedPKLevelId ?? ""} className="edu-select mt-2">
                  <option value="">—</option>
                  {pk.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="edu-field-label">PR</label>
                <select name="prLevelId" defaultValue={person.prLevelId ?? ""} className="edu-select mt-2">
                  <option value="">—</option>
                  {pr.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} (+{c.addon?.hourlyAddonRub?.toString() ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="edu-field-label">OP</label>
                <select name="opLevelId" defaultValue={person.opLevelId ?? ""} className="edu-select mt-2">
                  <option value="">—</option>
                  {op.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} (+{c.addon?.hourlyAddonRub?.toString() ?? 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="edu-field-label">Ветка</label>
              <select name="branchRuleId" defaultValue={person.branchRuleId ?? ""} className="edu-select mt-2">
                <option value="">—</option>
                {branches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {branchRuleDisplayName(c.code, c.name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="edu-field-label">База ₽/ч (переопределение), глобальная сейчас: {baseRate}</label>
              <input
                name="baseHourRateOverride"
                defaultValue={person.baseHourRateOverride?.toString() ?? ""}
                className="edu-input mt-2"
                placeholder="пусто = глобальная"
              />
            </div>
            <div>
              <label className="edu-field-label">Фикс по ТД ₽/мес</label>
              <input
                name="guaranteedMonthlyFixRub"
                defaultValue={person.employeeProfile?.guaranteedMonthlyFixRub?.toString() ?? ""}
                className="edu-input mt-2"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-elevated/50 px-4 py-3">
              <input type="checkbox" name="isVisibleInAccounting" defaultChecked={person.isVisibleInAccounting} className="edu-checkbox mt-0.5" />
              <span className="text-sm text-foreground">Виден в учёте</span>
            </label>
            <div>
              <label className="edu-field-label">Причина изменения</label>
              <input name="changeReason" className="edu-input mt-2" placeholder="необязательно" />
            </div>
            <div>
              <label className="edu-field-label">Заметки</label>
              <textarea name="notes" rows={3} defaultValue={person.notes ?? ""} className="edu-textarea mt-2" />
            </div>
          </div>
        </SectionCard>
      </PersonProfileForm>

      <SectionCard title="Формула часовой ставки" variant="quiet">
        <p className="text-sm leading-relaxed text-foreground">
          Эффективная база: {person.baseHourRateOverride?.toString() ?? baseRate} ₽/ч (override или глобальная). PK не деньги напрямую:
          надбавка PK = {person.currentPK?.addon?.hourlyAddonRub?.toString() ?? 0} ₽/ч. Итоговая ставка = база + PK + PR + OP (если
          включены в настройках).
        </p>
      </SectionCard>

      {person.candidateProfile && (
        <SectionCard title="Кандидат: анкета" variant="quiet">
          <p className="text-sm leading-relaxed text-foreground">
            Образование: {educationLevelLabelRu[person.candidateProfile.educationLevel] ?? person.candidateProfile.educationLevel}, пед. квалификация:{" "}
            {person.candidateProfile.hasPedagogicalQualification ? "да" : "нет"}, переподготовка:{" "}
            {person.candidateProfile.hasRetraining ? "да" : "нет"}
          </p>
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Все поля анкеты</p>
            <QuestionnaireAnswersPanel json={person.candidateProfile.questionnaireAnswers} />
          </div>
          {person.candidateProfile.lastRecommendationJson && (
            <div className="mt-6">
              <CandidateRecommendationPanel json={person.candidateProfile.lastRecommendationJson} />
            </div>
          )}
        </SectionCard>
      )}

      <p className="text-sm text-muted-foreground">
        Ветка: {person.branchRule ? branchRuleDisplayName(person.branchRule.code, person.branchRule.name) : "—"}
      </p>
    </div>
  );
}
