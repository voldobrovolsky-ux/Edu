import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { CommunitoriaCommunityBroadcastModal } from "./CommunitoriaCommunityBroadcastModal";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";

type BotConfig = {
  announcementsRelay: boolean;
  dailyDigest: boolean;
  eventReminders: boolean;
  autoWelcome: boolean;
  allowedCommands: string[];
  welcomeTemplate?: string;
};

type CommunityPayload = {
  id: string;
  name: string;
  description: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
  announcementGroupId: string;
  botEnabled: boolean;
  botConfig: BotConfig;
  metaType?: string;
};

type GroupRow = { groupId: string; title: string; description: string | null; isAnnouncement: boolean };

function asBotConfig(v: unknown): BotConfig {
  if (!v || typeof v !== "object") {
    return {
      announcementsRelay: false,
      dailyDigest: false,
      eventReminders: false,
      autoWelcome: true,
      allowedCommands: [],
      welcomeTemplate: "",
    };
  }
  const o = v as Record<string, unknown>;
  const cmds = Array.isArray(o.allowedCommands) ? o.allowedCommands.filter((x): x is string => typeof x === "string") : [];
  return {
    announcementsRelay: Boolean(o.announcementsRelay),
    dailyDigest: Boolean(o.dailyDigest),
    eventReminders: Boolean(o.eventReminders),
    autoWelcome: Boolean(o.autoWelcome),
    allowedCommands: cmds,
    welcomeTemplate: typeof o.welcomeTemplate === "string" ? o.welcomeTemplate : "",
  };
}

export function CommunitoriaCommunityScreen({
  communityId,
  token,
  onBack,
  onOpenGroup,
}: {
  communityId: string;
  token: string;
  onBack: () => void;
  onOpenGroup: (groupId: string, title: string, fromCommunity?: { id: string; name: string }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [community, setCommunity] = useState<CommunityPayload | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [patching, setPatching] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [digestErr, setDigestErr] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const communityRef = useRef(community);
  communityRef.current = community;

  const openGroupCtx = { id: communityId, name: community?.name ?? "Сообщество" };

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    void api.chats
      .getCommunity(token, communityId)
      .then((r) => {
        const c = r.community as Record<string, unknown>;
        setCommunity({
          id: String(c.id ?? communityId),
          name: String(c.name ?? ""),
          description: typeof c.description === "string" ? c.description : null,
          avatarEmoji: typeof c.avatarEmoji === "string" ? c.avatarEmoji : null,
          avatarImageUrl: typeof c.avatarImageUrl === "string" ? c.avatarImageUrl : null,
          announcementGroupId: String(c.announcementGroupId ?? ""),
          botEnabled: Boolean(c.botEnabled),
          botConfig: asBotConfig(c.botConfig),
          metaType: typeof c.metaType === "string" ? c.metaType : undefined,
        });
        setGroups((r.groups ?? []) as GroupRow[]);
        setCanManage(Boolean(r.canManage));
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : "Не удалось загрузить сообщество");
        setCommunity(null);
      })
      .finally(() => setLoading(false));
  }, [token, communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchBot = useCallback(
    async (partial: { botEnabled?: boolean; botConfig?: BotConfig }) => {
      if (!canManage || patching) return;
      setPatching(true);
      try {
        const r = await api.chats.patchCommunity(token, communityId, partial);
        const c = r.community as Record<string, unknown>;
        setCommunity((prev) =>
          prev
            ? {
                ...prev,
                botEnabled: typeof c.botEnabled === "boolean" ? c.botEnabled : prev.botEnabled,
                botConfig: c.botConfig ? asBotConfig(c.botConfig) : prev.botConfig,
              }
            : prev,
        );
      } catch {
        void load();
      } finally {
        setPatching(false);
      }
    },
    [canManage, patching, token, communityId, load],
  );

  const announcement = groups.find((g) => g.isAnnouncement);
  const themeGroups = groups.filter((g) => !g.isAnnouncement);

  if (loading && !community) {
    return (
      <div className="ed-panel flex min-h-[320px] flex-1 flex-col items-center justify-center border border-slate-200 bg-white">
        <p className="text-sm text-slate-500">Загрузка сообщества…</p>
      </div>
    );
  }

  if (err || !community) {
    return (
      <div className="ed-panel flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 border border-slate-200 bg-white px-4">
        <p className="text-center text-sm text-rose-700">{err ?? "Сообщество недоступно"}</p>
        <button type="button" className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm" onClick={onBack}>
          Назад
        </button>
      </div>
    );
  }

  return (
    <div className="ed-panel flex min-h-0 flex-1 flex-col overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-sky-700 hover:bg-sky-50"
            onClick={onBack}
          >
            ← Назад
          </button>
          {canManage ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
              onClick={() => setBroadcastOpen(true)}
            >
              <span aria-hidden>📢</span>
              Оповещение
            </button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {community.avatarImageUrl ? (
            <img src={community.avatarImageUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-slate-100" />
          ) : (
            <div
              className={[
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl text-white",
                communitoriaColorClassForKey(community.id),
              ].join(" ")}
            >
              {community.avatarEmoji || communitoriaInitials(community.name)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">{community.name}</h1>
            {community.metaType ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{community.metaType}</p>
            ) : null}
            <p className="mt-1 text-sm text-slate-600">{community.description?.trim() || "Нет описания."}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Анонсы сообщества</h2>
          {announcement ? (
            <button
              type="button"
              onClick={() => onOpenGroup(announcement.groupId, announcement.title, openGroupCtx)}
              className="w-full rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-left text-sm font-medium text-amber-950 shadow-sm transition hover:border-amber-300"
            >
              📣 {announcement.title}
              <span className="mt-1 block text-xs font-normal text-amber-900/80">Только важные объявления</span>
            </button>
          ) : (
            <p className="text-sm text-slate-500">Анонс-чат не найден.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Группы сообщества</h2>
          {themeGroups.length === 0 ? (
            <p className="text-sm text-slate-500">Пока только анонс-чат.</p>
          ) : (
            <ul className="space-y-2">
              {themeGroups.map((g) => (
                <li key={g.groupId}>
                  <button
                    type="button"
                    onClick={() => onOpenGroup(g.groupId, g.title, openGroupCtx)}
                    className="flex w-full flex-col rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left text-sm transition hover:border-sky-200 hover:bg-white"
                  >
                    <span className="font-medium text-slate-900">{g.title}</span>
                    {g.description ? <span className="mt-0.5 line-clamp-2 text-xs text-slate-600">{g.description}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage ? (
          <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Управление</h2>
            <p className="mb-3 text-xs text-slate-600">Название, состав групп и приглашения — в следующих итерациях. Ниже — бот-ассистент.</p>

            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">Бот включён</span>
              <button
                type="button"
                role="switch"
                aria-checked={community.botEnabled}
                disabled={patching}
                onClick={() => void patchBot({ botEnabled: !community.botEnabled })}
                className={[
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  community.botEnabled ? "bg-sky-600" : "bg-slate-300",
                  patching ? "opacity-60" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                    community.botEnabled ? "left-5" : "left-0.5",
                  ].join(" ")}
                />
              </button>
            </div>

            <h3 className="mb-2 text-[11px] font-semibold text-slate-600">Бот-ассистент</h3>
            <ul className="space-y-2 text-sm">
              {(
                [
                  ["announcementsRelay", "Дублировать анонсы в группы"],
                  ["dailyDigest", "Ежедневный дайджест"],
                  ["eventReminders", "Напоминания о событиях EDUMED"],
                  ["autoWelcome", "Приветствие новых участников"],
                ] as const
              ).map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">{label}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-sky-600"
                    checked={community.botConfig[key]}
                    disabled={patching || !community.botEnabled}
                    onChange={(e) => {
                      const next = { ...community.botConfig, [key]: e.target.checked };
                      setCommunity((prev) => (prev ? { ...prev, botConfig: next } : prev));
                      void patchBot({ botConfig: next });
                    }}
                  />
                </li>
              ))}
            </ul>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Шаблон приветствия
              <textarea
                value={community.botConfig.welcomeTemplate ?? ""}
                disabled={patching || !community.botEnabled}
                onChange={(e) =>
                  setCommunity((prev) =>
                    prev ? { ...prev, botConfig: { ...prev.botConfig, welcomeTemplate: e.target.value } } : prev,
                  )
                }
                onBlur={(e) => {
                  const cur = communityRef.current;
                  if (!cur) return;
                  const nextCfg = { ...cur.botConfig, welcomeTemplate: e.currentTarget.value };
                  setCommunity({ ...cur, botConfig: nextCfg });
                  void patchBot({ botConfig: nextCfg });
                }}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <p className="mt-2 text-[11px] text-slate-500">
              Команды: {community.botConfig.allowedCommands.length ? community.botConfig.allowedCommands.join(", ") : "по умолчанию"}{" "}
              (редактор списка — позже).
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Тестовый дайджест</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Мок: отправит пример сообщения от бота в выбранные группы (тему + дополнительные).
                  </div>
                </div>
                <button
                  type="button"
                  className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-3 py-2 text-xs disabled:opacity-50"
                  disabled={!community.botEnabled || !community.botConfig.dailyDigest || digestSending}
                  onClick={async () => {
                    setDigestErr(null);
                    setDigestSending(true);
                    try {
                      const relayTargets = groups.filter((g) => !g.isAnnouncement).map((g) => g.groupId);
                      await api.chats.broadcastCommunity(token, communityId, {
                        text: "Тестовый дайджест от бота: итоги дня (mock).",
                        groupIds: relayTargets.length ? relayTargets : groups.map((g) => g.groupId),
                        sender: "bot",
                      });
                      await load();
                    } catch (e) {
                      setDigestErr(e instanceof Error ? e.message : "Не удалось отправить тестовый дайджест");
                    } finally {
                      setDigestSending(false);
                    }
                  }}
                >
                  {digestSending ? "Отправка…" : "Отправить тестовый дайджест"}
                </button>
              </div>
              {digestErr ? <div className="mt-2 text-xs text-rose-700">{digestErr}</div> : null}
            </div>
          </section>
        ) : null}
      </div>

      <CommunitoriaCommunityBroadcastModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        token={token}
        communityId={communityId}
        communityName={community.name}
        groups={groups.map((g) => ({ groupId: g.groupId, title: g.title, isAnnouncement: g.isAnnouncement }))}
        announcementGroupId={community.announcementGroupId}
        botEnabled={community.botEnabled}
        onSent={() => {
          window.dispatchEvent(new CustomEvent("edumed:chat-unread-refresh"));
          void load();
        }}
      />
    </div>
  );
}
