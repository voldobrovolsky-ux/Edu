import { prisma } from "@/lib/db";
import Link from "next/link";
import { deletePersonFromForm } from "@/app/actions/person-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { StatusPill } from "@/components/ui/StatusPill";
import { Abbr } from "@/components/ui/Abbr";
import { ABBR } from "@/lib/abbr-glossary";
import { employmentTypeLabelRu, workFormatLabelRu } from "@/lib/display-labels";
import { syncEdumedStaffIntoPersonTable } from "@/lib/payroll/sync-edumed-users";

const EDUMED_LINKED_HINT =
  "Карточка привязана к учётной записи EDUMED — удаление из списка недоступно. Архивируйте в карточке или отключите пользователя в основной системе.";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; employment?: string; format?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const syncResult = await syncEdumedStaffIntoPersonTable(prisma);

  const where = {
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.employment ? { employmentType: sp.employment } : {}),
    ...(sp.format ? { workFormat: sp.format } : {}),
  };

  const people = await prisma.person.findMany({
    where,
    orderBy: { fullName: "asc" },
    include: {
      officialCategory: true,
      internalCategory: true,
      currentPK: true,
      fixedPK: true,
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Люди"
        description="Кадры из учётных записей EDUMED (users.json) синхронизируются автоматически; кандидаты без входа в систему добавляются вручную."
        actions={
          <Link href="/people/new" className="edu-btn-primary">
            Новый человек
          </Link>
        }
      />

      {!syncResult.ok ? (
        <InlineNotice variant="warning" title="Синхронизация с EDUMED">
          {syncResult.detail}
        </InlineNotice>
      ) : null}

      {sp.err && (
        <InlineNotice variant="danger" title="Ошибка">
          {sp.err}
        </InlineNotice>
      )}

      <form method="get" className="edu-action-slab">
        <div>
          <label className="edu-field-label">Статус</label>
          <select name="status" defaultValue={sp.status ?? ""} className="edu-select mt-1.5 min-w-[10rem] py-2">
            <option value="">Все</option>
            <option value="candidate">Кандидат</option>
            <option value="trainee">Стажёр</option>
            <option value="active">Активный</option>
            <option value="archived">В архиве</option>
          </select>
        </div>
        <div>
          <label className="edu-field-label">Трудоустройство</label>
          <select name="employment" defaultValue={sp.employment ?? ""} className="edu-select mt-1.5 min-w-[11rem] py-2">
            <option value="">Все</option>
            <option value="labor_contract">Трудовой договор</option>
            <option value="no_labor_contract">ГПХ / без ТД</option>
          </select>
        </div>
        <div>
          <label className="edu-field-label">Формат</label>
          <select name="format" defaultValue={sp.format ?? ""} className="edu-select mt-1.5 min-w-[9rem] py-2">
            <option value="">Все</option>
            <option value="staff">Штат</option>
            <option value="part_time">Совместитель</option>
            <option value="trainee">Стажёр</option>
          </select>
        </div>
        <button type="submit" className="edu-btn-secondary">
          Применить
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50">
        <div className="overflow-x-auto">
          <table className="payroll-table-quiet min-w-[880px] edu-table-dense">
            <thead>
              <tr>
                <th className="pl-4">ФИО</th>
                <th className="text-xs font-normal text-muted-foreground">EDUMED</th>
                <th>Статус</th>
                <th>
                  <Abbr title={ABBR.td}>ТД</Abbr> / <Abbr title={ABBR.gph}>ГПХ</Abbr>
                </th>
                <th>Формат</th>
                <th>
                  <Abbr title={ABBR.rk}>РК</Abbr> текущий
                </th>
                <th>
                  <Abbr title={ABBR.rk}>РК</Abbr> фикс.
                </th>
                <th className="pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="pl-4">
                    <Link href={`/people/${p.id}`} className="font-medium text-foreground hover:text-accent hover:underline">
                      {p.fullName}
                    </Link>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {p.systemUsername ? (
                      <span className="font-mono" title="Учётная запись EDUMED">
                        @{p.systemUsername}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <StatusPill status={p.status} />
                  </td>
                  <td className="text-muted-foreground">{employmentTypeLabelRu[p.employmentType] ?? p.employmentType}</td>
                  <td className="text-muted-foreground">{workFormatLabelRu[p.workFormat] ?? p.workFormat}</td>
                  <td className="font-mono text-xs">{p.currentPK?.code ?? "—"}</td>
                  <td className="font-mono text-xs">{p.fixedPK?.code ?? "—"}</td>
                  <td className="pr-4">
                    {p.systemUserId?.trim() ? (
                      <span className="text-xs text-muted-foreground" title={EDUMED_LINKED_HINT}>
                        —
                      </span>
                    ) : (
                      <form action={deletePersonFromForm}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="edu-btn-danger text-xs">
                          Удалить
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {people.length === 0 && (
          <p className="border-t border-border/40 px-4 py-8 text-center text-sm text-muted-foreground">Нет записей по фильтру.</p>
        )}
      </div>
    </div>
  );
}
