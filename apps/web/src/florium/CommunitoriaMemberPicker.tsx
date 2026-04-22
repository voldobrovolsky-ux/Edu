import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";

export type PickerUserRow = {
  id: string;
  fio: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  allowDirectGroupAdd?: boolean;
  lastSeenAt?: string | null;
};

function formatLastSeenRu(lastSeenAt: string | null | undefined, online: boolean): string {
  if (online) return "онлайн";
  if (!lastSeenAt) return "давно не был(а) в сети";
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return "был(а) в сети недавно";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "был(а) только что";
  if (m < 60) return `был(а) ${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `был(а) ${h} ч. назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return "был(а) вчера";
  return `был(а) ${d} дн. назад`;
}

export function CommunitoriaMemberPicker({
  selectedIds,
  onToggle,
  excludeUserIds = [],
  placeholder = "Найти пользователя…",
}: {
  selectedIds: Set<string>;
  onToggle: (userId: string, row: PickerUserRow) => void;
  excludeUserIds?: string[];
  placeholder?: string;
}) {
  const { accessToken: token } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [users, setUsers] = useState<PickerUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!token) {
      setUsers([]);
      setError("Нет сессии");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .chatsUsers(token, debouncedQ || undefined)
      .then((r) => {
        if (!cancelled) {
          setUsers(
            (r.users ?? []).map((u) => ({
              id: u.id,
              fio: u.fio,
              username: u.username,
              role: u.role,
              avatarUrl: u.avatarUrl,
              allowDirectGroupAdd: u.allowDirectGroupAdd !== false,
              lastSeenAt: u.lastSeenAt ?? null,
            })),
          );
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, debouncedQ]);

  useEffect(() => {
    if (!token || users.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, boolean> = {};
      await Promise.all(
        users.slice(0, 40).map(async (u) => {
          try {
            const p = await api.chats.presence(token, u.id);
            if (!cancelled) next[u.id] = Boolean(p.online);
          } catch {
            if (!cancelled) next[u.id] = false;
          }
        }),
      );
      if (!cancelled) setOnlineMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, users]);

  const exclude = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);

  const selectedChips = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u] as const));
    return [...selectedIds].map((id) => byId.get(id)).filter(Boolean) as PickerUserRow[];
  }, [users, selectedIds]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-2"
      />
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {selectedChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedChips.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-950"
            >
              {u.fio}
              <button
                type="button"
                className="rounded-full px-1 text-sky-700 hover:bg-sky-200"
                aria-label={`Убрать ${u.fio}`}
                onClick={() => onToggle(u.id, u)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
        {loading ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">Загрузка…</li>
        ) : users.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">Пользователи не найдены</li>
        ) : (
          users.map((u) => {
            if (exclude.has(u.id)) return null;
            const on = selectedIds.has(u.id);
            const online = onlineMap[u.id] ?? false;
            return (
              <li key={u.id}>
                <label className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(u.id, u)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600"
                  />
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      className={[
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                        communitoriaColorClassForKey(u.id),
                      ].join(" ")}
                    >
                      {communitoriaInitials(u.fio)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{u.fio}</span>
                    <span className="block truncate text-xs text-slate-500">
                      @{u.username} · {u.role}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {formatLastSeenRu(u.lastSeenAt, online)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
