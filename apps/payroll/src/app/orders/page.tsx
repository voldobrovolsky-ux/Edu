export const dynamic = 'force-dynamic';

import { prisma } from "@/lib/db";
import { orderDraftStatusLabel, summarizeOrderDraft } from "@/lib/orders/order-draft-summary";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";

function typeLabel(t: string): string {
  switch (t) {
    case "PK_CHANGE":
      return "Изменение PK";
    case "PAYROLL_FINALIZATION":
      return "Финализация ЗП";
    default:
      return t;
  }
}

function orderCardTitle(d: { title: string | null; type: string }): string {
  if (d.title === "Проект приказа: применение рекомендованного PK") return "Изменение коэффициента (черновик)";
  return d.title || typeLabel(d.type);
}

export default async function OrdersPage() {
  const drafts = await prisma.orderDraft.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { person: true },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Черновики приказов"
        description="Проекты приказов создаются при применении PK и других операций. Текст для директора — в превью в карточке записи."
      />

      {drafts.length === 0 ? (
        <EmptyState
          title="Черновиков пока нет"
          description="После применения PK или финализации ЗП записи появятся здесь."
        />
      ) : (
        <ul className="space-y-5">
          {drafts.map((d) => (
            <li key={d.id}>
              <SectionCard
                variant="quiet"
                title={orderCardTitle(d)}
                description={
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={d.createdAt.toISOString()}>{d.createdAt.toLocaleString("ru-RU")}</time>
                    {d.person && (
                      <>
                        <span aria-hidden>·</span>
                        <Link href={`/people/${d.person.id}`} className="edu-link">
                          {d.person.fullName}
                        </Link>
                      </>
                    )}
                  </span>
                }
              >
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground ring-1 ring-accent/15">
                    {typeLabel(d.type)}
                  </span>
                  <span className="inline-flex rounded-lg bg-elevated px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
                    {orderDraftStatusLabel(d.status)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">
                  <span className="text-muted-foreground">Кратко:</span> {summarizeOrderDraft(d.type, d.payload)}
                </p>
                {d.type === "PK_CHANGE" && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="edu-section-title mb-2">Текст приказа</div>
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground shadow-card">
                      {d.bodyText}
                    </pre>
                  </div>
                )}
              </SectionCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}