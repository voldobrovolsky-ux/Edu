import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";
import type { ChatTopic, CommunitoriaGroupPanelState } from "./data/useChatMessages";
import { CommunitoriaMemberPicker } from "./CommunitoriaMemberPicker";

const PRESET_AVATARS = ["💬", "👥", "📚", "🎓", "🛡️", "🌿"];

export function CommunitoriaGroupManageModal({
  open,
  onClose,
  token,
  groupId,
  initial,
  topics,
  members,
  myId,
  myRole,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  token: string | null;
  groupId: string;
  initial: CommunitoriaGroupPanelState | null;
  topics: ChatTopic[];
  members: Array<{ userId: string; fio: string; username: string; role: string }>;
  myId: string;
  myRole: string | null;
  onUpdated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("💬");
  const [groupType, setGroupType] = useState<"standard" | "announcements">("standard");
  const [history, setHistory] = useState<"full" | "month" | "hidden">("full");
  const [perms, setPerms] = useState<CommunitoriaGroupPanelState["permissions"]>({
    sendMessages: "all",
    sendDocuments: true,
    addMembers: true,
    pinMessages: true,
    changeGroupSettings: true,
    changeGroupInfo: true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteLabel, setInviteLabel] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [links, setLinks] = useState<CommunitoriaGroupPanelState["inviteLinks"]>([]);
  const [memberMenu, setMemberMenu] = useState<{ x: number; y: number; userId: string } | null>(null);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [selectedAdd, setSelectedAdd] = useState<Set<string>>(new Set());
  const [topicWizard, setTopicWizard] = useState<"idle" | "step1" | "step2">("idle");
  const [topicEmoji, setTopicEmoji] = useState("📌");
  const [topicName, setTopicName] = useState("");
  const [topicDesc, setTopicDesc] = useState("");
  const [topicView, setTopicView] = useState<"all" | "members" | "admins">("all");
  const [topicWrite, setTopicWrite] = useState<"all" | "admins">("all");
  const avatarBtnRef = useRef<HTMLButtonElement>(null);
  const [avOpen, setAvOpen] = useState(false);

  useEffect(() => {
    if (!open || !initial) return;
    setTitle(initial.title);
    setDescription(initial.description ?? "");
    setAvatarEmoji(initial.avatarEmoji ?? "💬");
    setGroupType(initial.groupType);
    setHistory(initial.historyForNewMembers);
    setPerms(initial.permissions);
    setLinks(initial.inviteLinks ?? []);
  }, [open, initial]);

  const canManage = myRole === "owner" || myRole === "admin";

  const saveBasics = useCallback(async () => {
    if (!token || !canManage) return;
    setSaving(true);
    setErr(null);
    try {
      await api.chats.patchGroup(token, groupId, {
        title: title.trim(),
        description: description.trim() || null,
        avatarEmoji,
        groupMeta: {
          groupType,
          historyForNewMembers: history,
          permissions: perms,
        },
      });
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }, [token, canManage, groupId, title, description, avatarEmoji, groupType, history, perms, onUpdated]);

  const createLink = useCallback(async () => {
    if (!token || !canManage) return;
    setErr(null);
    try {
      const r = await api.chats.createGroupInviteLink(token, groupId, {
        label: inviteLabel.trim() || undefined,
        password: invitePassword.trim() || null,
      });
      const row = r.link;
      setLinks((prev) => [
        ...prev,
        {
          id: row.id,
          label: row.label,
          token: row.token,
          createdAt: row.createdAt,
          hasPassword: row.hasPassword,
        },
      ]);
      setInviteLabel("");
      setInvitePassword("");
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать ссылку");
    }
  }, [token, canManage, groupId, inviteLabel, invitePassword, onUpdated]);

  const primaryUrl = useMemo(() => {
    const t = initial?.inviteToken;
    if (!t) return "";
    return `${window.location.origin}/section/chats/join/${encodeURIComponent(t)}`;
  }, [initial?.inviteToken]);

  const setPerm = useCallback(<K extends keyof CommunitoriaGroupPanelState["permissions"]>(k: K, v: CommunitoriaGroupPanelState["permissions"][K]) => {
    setPerms((p) => {
      const next = { ...p, [k]: v };
      void (async () => {
        if (!token || !canManage) return;
        try {
          await api.chats.patchGroup(token, groupId, { groupMeta: { permissions: next } });
          onUpdated();
        } catch {
          // откат в UI не делаем — пользователь увидит refetch
        }
      })();
      return next;
    });
  }, [token, canManage, groupId, onUpdated]);

  const onMemberCtx = useCallback((e: MouseEvent, userId: string) => {
    e.preventDefault();
    setMemberMenu({ x: e.clientX, y: e.clientY, userId });
  }, []);

  const runMemberAction = useCallback(
    async (action: "profile" | "makeAdmin" | "removeAdmin" | "kick", target: string) => {
      if (!token) return;
      setMemberMenu(null);
      try {
        if (action === "profile") {
          window.alert("Скоро: профиль пользователя.");
          return;
        }
        if (action === "makeAdmin") {
          await api.chats.patchGroupMember(token, groupId, target, { role: "admin" });
        } else if (action === "removeAdmin") {
          await api.chats.patchGroupMember(token, groupId, target, { role: "member" });
        } else if (action === "kick") {
          if (!window.confirm("Исключить пользователя из группы?")) return;
          await api.chats.removeGroupMember(token, groupId, target);
        }
        onUpdated();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [token, groupId, onUpdated],
  );

  const addSelectedMembers = useCallback(async () => {
    if (!token || !canManage) return;
    for (const id of selectedAdd) {
      try {
        await api.chats.addGroupMember(token, groupId, { userId: id, role: "member" });
      } catch {
        // continue
      }
    }
    setSelectedAdd(new Set());
    setAddMembersOpen(false);
    onUpdated();
  }, [token, canManage, groupId, selectedAdd, onUpdated]);

  const createTopic = useCallback(async () => {
    if (!token || !canManage || !topicName.trim()) return;
    try {
      await api.chats.createTopic(token, groupId, {
        name: topicName.trim(),
        description: topicDesc.trim() || null,
        emoji: topicEmoji,
      });
      window.alert(
        `Тема создана (права: просмотр — ${topicView}, запись — ${topicWrite}). В API тем пока без отдельных ACL; настройки сохранены в мастере для будущей синхронизации.`,
      );
      setTopicWizard("idle");
      setTopicName("");
      setTopicDesc("");
      onUpdated();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Ошибка");
    }
  }, [token, canManage, groupId, topicName, topicDesc, topicEmoji, topicView, topicWrite, onUpdated]);

  if (!open) return null;

  const layer = (
    <div className="fixed inset-0 z-[10070] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" role="presentation">
      <div className="flex max-h-[min(90vh,780px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Управление группой</h2>
          <button type="button" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p> : null}

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Основная информация</h3>
            <div className="mt-3 flex flex-wrap gap-4">
              <div>
                <button
                  ref={avatarBtnRef}
                  type="button"
                  onClick={() => setAvOpen((v) => !v)}
                  className={[
                    "flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow",
                    communitoriaColorClassForKey(groupId),
                  ].join(" ")}
                >
                  {avatarEmoji || communitoriaInitials(title)}
                </button>
                {avOpen
                  ? createPortal(
                      <div className="fixed inset-0 z-[10080]" role="presentation">
                        <button type="button" className="absolute inset-0" aria-label="Закрыть" onClick={() => setAvOpen(false)} />
                        <div className="absolute left-8 top-28 z-[10081] grid w-48 grid-cols-3 gap-1 rounded-xl border bg-white p-2 shadow-lg">
                          {PRESET_AVATARS.map((e) => (
                            <button key={e} type="button" className="text-2xl hover:bg-slate-50" onClick={() => { setAvatarEmoji(e); setAvOpen(false); }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
              <div className="min-w-[200px] flex-1 space-y-2">
                <label className="block text-xs text-slate-600">
                  Название
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-slate-600">
                  Описание
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-slate-600">
                  Тип группы
                  <select
                    value={groupType}
                    onChange={(e) => setGroupType(e.target.value as "standard" | "announcements")}
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                  >
                    <option value="standard">Обычная</option>
                    <option value="announcements">Объявления</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveBasics()}
                  className="ed-btn ed-btn-primary ed-interactive rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                >
                  Сохранить основное
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">История для новых участников</h3>
            <div className="mt-2 space-y-2 text-sm">
              {(
                [
                  ["full", "Видна полностью"],
                  ["month", "Видна за последний месяц"],
                  ["hidden", "История скрыта"],
                ] as const
              ).map(([v, lab]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="hist" checked={history === v} onChange={() => setHistory(v)} />
                  {lab}
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Темы</h3>
              <button type="button" className="text-sm text-sky-700 hover:underline" onClick={() => setTopicWizard("step1")}>
                Создать тему
              </button>
            </div>
            <ul className="mt-2 divide-y rounded-lg border border-slate-100">
              {topics.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span>{t.emoji}</span>
                  <span>{t.name}</span>
                </li>
              ))}
            </ul>
            {topicWizard !== "idle" ? (
              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm">
                {topicWizard === "step1" ? (
                  <>
                    <div className="font-medium">Шаг 1: тема</div>
                    <input value={topicEmoji} onChange={(e) => setTopicEmoji(e.target.value)} className="mt-2 w-20 rounded border px-2 py-1" />
                    <input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="Название" className="mt-2 w-full rounded border px-2 py-1" />
                    <textarea value={topicDesc} onChange={(e) => setTopicDesc(e.target.value)} placeholder="Описание" rows={2} className="mt-2 w-full rounded border px-2 py-1" />
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="rounded-lg bg-sky-600 px-3 py-1 text-white" onClick={() => setTopicWizard("step2")}>
                        Далее
                      </button>
                      <button type="button" onClick={() => setTopicWizard("idle")}>
                        Отмена
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-medium">Шаг 2: права (черновик)</div>
                    <label className="mt-2 block text-xs">
                      Кто видит темы
                      <select value={topicView} onChange={(e) => setTopicView(e.target.value as typeof topicView)} className="mt-1 w-full rounded border px-2 py-1">
                        <option value="all">Все</option>
                        <option value="members">Только участники</option>
                        <option value="admins">Только админы</option>
                      </select>
                    </label>
                    <label className="mt-2 block text-xs">
                      Кто пишет
                      <select value={topicWrite} onChange={(e) => setTopicWrite(e.target.value as typeof topicWrite)} className="mt-1 w-full rounded border px-2 py-1">
                        <option value="all">Все</option>
                        <option value="admins">Только админы</option>
                      </select>
                    </label>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setTopicWizard("step1")}>
                        Назад
                      </button>
                      <button type="button" className="rounded-lg bg-sky-600 px-3 py-1 text-white" onClick={() => void createTopic()}>
                        Создать
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Разрешения</h3>
            <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                Отправлять сообщения
                <select
                  value={perms.sendMessages}
                  onChange={(e) => setPerm("sendMessages", e.target.value as "all" | "admins")}
                  className="rounded-lg border px-2 py-1"
                >
                  <option value="all">Все</option>
                  <option value="admins">Только админы</option>
                </select>
              </label>
              {(
                [
                  ["sendDocuments", "Отправлять документы"],
                  ["addMembers", "Добавлять участников"],
                  ["pinMessages", "Закреплять сообщения"],
                  ["changeGroupSettings", "Менять настройки группы"],
                  ["changeGroupInfo", "Менять информацию о группе"],
                ] as const
              ).map(([k, lab]) => (
                <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <span>{lab}</span>
                  <input
                    type="checkbox"
                    checked={perms[k]}
                    onChange={(e) => setPerm(k, e.target.checked)}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Пригласительные ссылки</h3>
            <p className="mt-1 text-xs text-slate-500">Пригласительная ссылка и пароль отправляются одним сообщением.</p>
            {primaryUrl ? (
              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs break-all">
                <span className="font-medium">Основная:</span> {primaryUrl}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={inviteLabel} onChange={(e) => setInviteLabel(e.target.value)} placeholder="Краткое имя" className="rounded-lg border px-2 py-1 text-sm" />
              <input value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="Пароль (необязательно)" className="rounded-lg border px-2 py-1 text-sm" type="password" />
              <button type="button" onClick={() => void createLink()} className="rounded-lg bg-slate-800 px-3 py-1 text-sm text-white">
                Создать ссылку
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-xs">
              {links.map((l) => (
                <li key={l.id} className="rounded border border-slate-100 px-2 py-2">
                  <div className="font-medium">{l.label || "Ссылка"}</div>
                  <div className="break-all text-slate-600">{`${window.location.origin}/section/chats/join/${l.token}`}</div>
                  <div className="text-slate-400">{l.createdAt}</div>
                  <div>{l.hasPassword ? "С паролем" : "Без пароля"}</div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Администраторы</h3>
            <ul className="mt-2 space-y-1">
              {members
                .filter((m) => m.role === "admin" || m.role === "owner")
                .map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 text-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs">{communitoriaInitials(m.fio)}</span>
                    {m.fio}
                    {m.role === "owner" ? <span className="text-xs text-amber-700">создатель</span> : null}
                  </li>
                ))}
            </ul>
          </section>

          <section>
            <button type="button" className="text-sm font-semibold text-slate-800 hover:underline" onClick={() => setAddMembersOpen(true)}>
              Участники ({members.length})
            </button>
            <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-100">
              {members.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    onContextMenu={(e) => onMemberCtx(e, m.userId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className={["flex h-8 w-8 items-center justify-center rounded-full text-xs text-white", communitoriaColorClassForKey(m.userId)].join(" ")}>
                      {communitoriaInitials(m.fio)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{m.fio}</span>
                    <span className="text-xs text-slate-500">{m.role === "owner" ? "создатель" : m.role === "admin" ? "админ" : "участник"}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-2 text-sm text-sky-700" onClick={() => setAddMembersOpen(true)}>
              + Добавить пользователей
            </button>
          </section>
        </div>
      </div>

      {memberMenu ? (
        createPortal(
          <div
            className="fixed z-[10090] min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
            style={{ left: memberMenu.x, top: memberMenu.y }}
            role="menu"
          >
            <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => void runMemberAction("profile", memberMenu.userId)}>
              Просмотреть профиль
            </button>
            {memberMenu.userId !== myId && canManage ? (
              <>
                {members.find((x) => x.userId === memberMenu.userId)?.role === "member" ? (
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => void runMemberAction("makeAdmin", memberMenu.userId)}>
                    Сделать администратором
                  </button>
                ) : members.find((x) => x.userId === memberMenu.userId)?.role === "admin" ? (
                  <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => void runMemberAction("removeAdmin", memberMenu.userId)}>
                    Снять права администратора
                  </button>
                ) : null}
                <button type="button" className="block w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50" onClick={() => void runMemberAction("kick", memberMenu.userId)}>
                  Исключить из группы
                </button>
              </>
            ) : null}
            <button type="button" className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => setMemberMenu(null)}>
              Закрыть
            </button>
          </div>,
          document.body,
        )
      ) : null}

      {addMembersOpen
        ? createPortal(
            <div className="fixed inset-0 z-[10085] flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
              <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-4 shadow-xl">
                <div className="mb-2 flex justify-between">
                  <span className="font-semibold">Добавить пользователей</span>
                  <button type="button" className="rounded-lg px-2 text-slate-500 hover:bg-slate-100" onClick={() => setAddMembersOpen(false)} aria-label="Закрыть">
                    ✕
                  </button>
                </div>
                <CommunitoriaMemberPicker
                  selectedIds={selectedAdd}
                  onToggle={(id, row) => {
                    setSelectedAdd((prev) => {
                      const n = new Set(prev);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    });
                    void row;
                  }}
                  excludeUserIds={[myId, ...members.map((m) => m.userId)]}
                />
                <button type="button" className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm text-white" onClick={() => void addSelectedMembers()}>
                  Добавить выбранных
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );

  return createPortal(layer, document.body);
}
