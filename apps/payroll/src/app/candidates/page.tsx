import Link from "next/link";
import { loadEdumedCandidatesFromFile } from "@/lib/payroll/edumed-candidates";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineNotice } from "@/components/ui/InlineNotice";

export const dynamic = "force-dynamic";

function initialsFromFio(fio: string | null): string {
  if (!fio?.trim()) return "?";
  const parts = fio.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase().slice(0, 2) || "?";
}

export default function CandidatesPage() {
  const result = loadEdumedCandidatesFromFile();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Кандидаты"
        description="Те же данные, что в EDUMED: «Управление пользователями» → «Кандидаты» (QR и анкета). Карточки обновляются при сохранении файла на сервере API."
      />

      {!result.ok ? (
        <InlineNotice variant="warning" title="Нет доступа к данным">
          {result.detail}
        </InlineNotice>
      ) : null}

      {result.ok && result.cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-elevated/40 px-4 py-10 text-center text-sm text-muted-foreground">
          Кандидатов пока нет. Создайте приглашение в основном приложении: «Управление пользователями» → вкладка «Кандидаты» → «Создать кандидата».
        </p>
      ) : null}

      {result.ok && result.cards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.cards.map((c) => (
            <Link
              key={c.candidateId}
              href={`/candidates/${encodeURIComponent(c.candidateId)}`}
              className="block flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/50 shadow-card transition hover:ring-accent/40"
            >
              <div className="flex flex-1 items-start gap-3 p-4">
                {c.avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatarSrc}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-full border border-border/60 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border/60 bg-elevated text-sm font-semibold text-muted-foreground">
                    {initialsFromFio(c.fio)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold leading-snug text-foreground">
                    {c.fio ?? "Анкета ещё не заполнена"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Кандидат на роль: </span>
                    {c.roleLabel}
                  </p>
                  <p className="mt-2 text-[11px] text-subtle-foreground">
                    {c.status === "submitted" ? "Анкета отправлена" : "Ожидается анкета"} · обн.{" "}
                    {c.updatedAt
                      ? new Date(c.updatedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </p>
                  <p className="mt-3 text-sm font-medium text-accent">Просмотр анкеты →</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
