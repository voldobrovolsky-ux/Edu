import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { OutcomeBadge } from "@/components/ui/StatusBadge";
import {
  auditActionLabelRu,
  auditActorRoleLabelRu,
  auditEntityTypeLabelRu,
} from "@/lib/display-labels";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; person?: string }>;
}) {
  const sp = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(sp.entity ? { entityType: { contains: sp.entity } } : {}),
      ...(sp.person ? { entityId: sp.person } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actorPerson: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Журнал аудита"
        description="Хронология действий: сущность, результат, снимки до/после. Используйте фильтры для сужения выборки."
      />

      <form method="get" className="edu-action-slab flex flex-wrap items-end gap-3">
        <label className="min-w-[140px] flex-1 text-sm">
          <span className="edu-field-label mb-1">Тип сущности</span>
          <input name="entity" placeholder="содержит…" defaultValue={sp.entity ?? ""} className="edu-input mt-2" />
        </label>
        <label className="min-w-[140px] flex-1 text-sm">
          <span className="edu-field-label mb-1">ID сущности</span>
          <input name="person" placeholder="точное совпадение" defaultValue={sp.person ?? ""} className="edu-input mt-2" />
        </label>
        <button type="submit" className="edu-btn-secondary">
          Применить фильтр
        </button>
      </form>

      <div className="edu-table-shell">
        <table className="payroll-table-quiet min-w-[960px] edu-table-dense">
          <thead>
            <tr>
              <th className="whitespace-nowrap">Время</th>
              <th>Тип</th>
              <th>ID</th>
              <th>Действие</th>
              <th>Результат</th>
              <th>Роль</th>
              <th className="min-w-[280px]">До / после</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap tabular-nums text-muted-foreground">{l.createdAt.toLocaleString("ru-RU")}</td>
                <td>{auditEntityTypeLabelRu(l.entityType)}</td>
                <td className="max-w-[120px] truncate font-mono text-xs text-muted-foreground">{l.entityId}</td>
                <td>{auditActionLabelRu(l.action)}</td>
                <td>
                  <OutcomeBadge outcome={l.outcome} />
                </td>
                <td className="text-muted-foreground">{auditActorRoleLabelRu(l.actorRole)}</td>
                <td className="max-w-xl align-top">
                  <details className="rounded-lg border border-border/80 bg-elevated/80">
                    <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-foreground hover:bg-elevated">
                      Показать изменения
                    </summary>
                    <div className="space-y-2 border-t border-border/60 p-2 font-mono text-[11px] leading-snug">
                      <div>
                        <span className="text-xs font-sans font-semibold text-danger">До</span>
                        <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-all text-danger/90">{l.beforeJson}</pre>
                      </div>
                      <div className="border-t border-border pt-2">
                        <span className="text-xs font-sans font-semibold text-success">После</span>
                        <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-all text-success/90">{l.afterJson}</pre>
                      </div>
                      {l.reason && <p className="font-sans text-xs text-muted-foreground">Причина: {l.reason}</p>}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && (
          <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">Записей не найдено.</p>
        )}
      </div>
    </div>
  );
}
