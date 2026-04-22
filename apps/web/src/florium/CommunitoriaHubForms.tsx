import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { CommunitoriaCreateCommunityWizard } from "./CommunitoriaCreateCommunityWizard";
import { CreateGroupWizard } from "./CreateGroupWizard";

type ChatUserRow = { id: string; fio: string; username: string; role: string; avatarUrl: string | null };

export function NewChatHubForm({ onClose }: { onClose: () => void }) {
  const { accessToken: token } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [users, setUsers] = useState<ChatUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        if (!cancelled) setUsers(r.users ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить пользователей");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, debouncedQ]);

  const selected = useMemo(() => users.find((u) => u.id === selectedId), [users, selectedId]);

  const start = () => {
    if (!selectedId || !selected) return;
    window.dispatchEvent(
      new CustomEvent("edumed:communitoria-start-direct", {
        detail: { peerUserId: selectedId, title: selected.fio },
      }),
    );
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Выберите пользователя из базы EDUMED для личного чата. Поиск по ФИО и @username.
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Поиск
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ФИО или username…"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-2"
        />
      </label>
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-1">
        {loading ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">Загрузка…</li>
        ) : users.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">Пользователи не найдены</li>
        ) : (
          users.map((u) => {
            const on = selectedId === u.id;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className={[
                    "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    on ? "bg-sky-50 text-sky-950 ring-1 ring-sky-200" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="font-medium text-slate-900">{u.fio}</span>
                  <span className="text-xs text-slate-500">
                    @{u.username} · {u.role}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selectedId}
          onClick={start}
          className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Начать чат
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

export function CreateGroupHubForm({ onClose }: { onClose: () => void }) {
  return <CreateGroupWizard onClose={onClose} />;
}

export function CreateCommunityHubForm({ onClose }: { onClose: () => void }) {
  return <CommunitoriaCreateCommunityWizard onClose={onClose} />;
}

export function CreateConferenceHubForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const submit = () => {
    console.log("[Communitoria] conference stub", { title, date, time });
    window.alert("TODO: интеграция с сервисом конференций Flör Group.");
  };

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="w-fit text-left text-sm text-sky-700 hover:underline" onClick={onClose}>
        ← Закрыть
      </button>
      <h3 className="text-sm font-semibold text-slate-900">Создать конференцию</h3>
      <p className="text-xs text-slate-600">
        В будущем здесь будет доступен полный функционал конференций (аналог Zoom) с возможностью подключать участников экосистемы Flör
        Group.
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Название
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Дата
        <input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="ДД.ММ.ГГГГ"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Время
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="ЧЧ:ММ"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <button type="button" className="ed-btn ed-btn-primary ed-interactive mt-2 rounded-xl px-4 py-2 text-sm" onClick={submit}>
        Создать конференцию
      </button>
    </div>
  );
}

export function AssistantHubPanel({ onClose }: { onClose: () => void }) {
  const openAssistant = () => {
    window.dispatchEvent(new CustomEvent("edumed:communitoria-open-assistant"));
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Ассистент Communitoria откроется в центральной панели модуля. Вы можете продолжить диалог там.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm" onClick={openAssistant}>
          Открыть ассистента
        </button>
        <button type="button" className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
