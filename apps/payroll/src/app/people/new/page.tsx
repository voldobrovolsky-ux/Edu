import { prisma } from "@/lib/db";
import { createPerson } from "@/app/actions/person-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { BackLink } from "@/components/ui/BackLink";
import { Abbr } from "@/components/ui/Abbr";
import { ABBR } from "@/lib/abbr-glossary";

export default async function NewPersonPage() {
  const [pr, op, pk, officialCats, internalCats, branches] = await Promise.all([
    prisma.pRLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.oPLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pKLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.categoryOfficial.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.categoryInternal.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.candidateBranchRule.findMany({ orderBy: { priority: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <BackLink href="/people">К списку людей</BackLink>
        <PageHeader
          title="Новый человек"
          description="Создание карточки сотрудника или кандидата. PR/OP — для расчёта ставки."
        />
      </div>

      <form action={createPerson} className="space-y-6">
        <SectionCard title="Основное" description="ФИО, статус и даты.">
          <div className="grid max-w-2xl gap-4">
            <div>
              <label className="edu-field-label">ФИО</label>
              <input
                name="fullName"
                required
                className="edu-input mt-2"
                placeholder="Иванов Иван Иванович"
                autoComplete="name"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">При сохранении слова приводятся к виду с заглавной буквы.</p>
            </div>
            <div>
              <label className="edu-field-label">Статус</label>
              <select name="status" className="edu-select mt-2">
                <option value="candidate">Кандидат</option>
                <option value="trainee">Стажёр</option>
                <option value="active">Активный</option>
                <option value="archived">В архиве</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="edu-field-label">Дата найма</label>
                <input name="hireDate" type="date" className="edu-input mt-2" />
              </div>
              <div>
                <label className="edu-field-label">Дата увольнения</label>
                <input name="terminationDate" type="date" className="edu-input mt-2" />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Параметры оплаты"
          description="Необязательно — можно задать позже в карточке. Трудоустройство и формат влияют на расчёт."
        >
          <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="edu-field-label">
                Трудоустройство (<Abbr title={ABBR.td}>ТД</Abbr> / <Abbr title={ABBR.gph}>ГПХ</Abbr>)
              </label>
              <select name="employmentType" className="edu-select mt-2">
                <option value="no_labor_contract">ГПХ / без ТД</option>
                <option value="labor_contract">Трудовой договор</option>
              </select>
            </div>
            <div>
              <label className="edu-field-label">Формат</label>
              <select name="workFormat" className="edu-select mt-2">
                <option value="trainee">Стажёр</option>
                <option value="staff">Штат</option>
                <option value="part_time">Совместитель</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="edu-field-label">Официальная категория</label>
              <select name="officialCategoryId" className="edu-select mt-2">
                <option value="">—</option>
                {officialCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="edu-field-label">Внутренняя категория</label>
              <select name="internalCategoryId" className="edu-select mt-2">
                <option value="">—</option>
                {internalCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="edu-field-label">Ветка (правила кандидата)</label>
              <select name="branchRuleId" className="edu-select mt-2">
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="edu-field-label">
                <Abbr title={ABBR.rk}>РК</Abbr> текущий
              </label>
              <select name="currentPKLevelId" className="edu-select mt-2">
                <option value="">—</option>
                {pk.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="PR / OP" description="Уровни для расчёта ставки.">
          <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="edu-field-label">
                <Abbr title={ABBR.pr}>PR</Abbr>
              </label>
              <select name="prLevelId" className="edu-select mt-2">
                <option value="">—</option>
                {pr.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="edu-field-label">
                <Abbr title={ABBR.op}>OP</Abbr>
              </label>
              <select name="opLevelId" className="edu-select mt-2">
                <option value="">—</option>
                {op.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/50 pt-6">
          <button type="submit" className="edu-btn-primary">
            Создать
          </button>
        </div>
      </form>
    </div>
  );
}
