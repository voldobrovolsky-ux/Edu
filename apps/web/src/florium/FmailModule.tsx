import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFlorium } from "@edumed/florium";
import { dispatchFloriumFmailBadgeCount } from "../lib/floriumSidebarBadgeEvents";
import { type FmailMailbox, useFmailMessages } from "./data/useFmailMessages";
import { HostFloriumPanel } from "./ui/HostFloriumPanel";

export function FmailModule() {
  const { user } = useFlorium();
  const { messages, loading, error } = useFmailMessages();
  const address = `${user.username}@fmail.com`;

  /** Бейдж в сайдбаре не ведём по мок-данным (иначе он «загорается» при открытии модуля). Сброс при входе; положительный счёт — только из реального API/push. */
  useEffect(() => {
    dispatchFloriumFmailBadgeCount(0);
  }, []);

  const folderList: Array<{ id: FmailMailbox; label: string; icon: string }> = [
    { id: "inbox", label: "Входящие", icon: "📥" },
    { id: "sent", label: "Отправленные", icon: "📤" },
    { id: "drafts", label: "Черновики", icon: "📝" },
    { id: "archive", label: "Архив", icon: "🗄️" },
    { id: "spam", label: "Спам", icon: "🚫" },
    { id: "trash", label: "Корзина", icon: "🗑️" },
  ];

  const [activeFolder, setActiveFolder] = useState<FmailMailbox>("inbox");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMore, setShowMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [filterPinnedOnly, setFilterPinnedOnly] = useState(false);
  const [filterHasAttachments, setFilterHasAttachments] = useState(false);
  const [filterFromQuery, setFilterFromQuery] = useState("");
  // __current => по активной папке слева. mailbox:* => по указанной папке. label:* => по ярлыку (игнорируя mailbox).
  const [folderOrLabelFilter, setFolderOrLabelFilter] = useState<string>("__current");
  const [massLabelId, setMassLabelId] = useState<string>("");

  const [bindingPopoverOpen, setBindingPopoverOpen] = useState(false);
  const [bindingDraftType, setBindingDraftType] = useState<"lesson" | "class" | "event" | "journalDecision">("lesson");
  const [bindingDraftRefId, setBindingDraftRefId] = useState("");
  const filtersPopoverRef = useRef<HTMLDivElement>(null);

  const [uiMessages, setUiMessages] = useState(messages);

  useEffect(() => {
    setUiMessages(messages);
    setSelectedIds(new Set());
    setActiveId(null);
  }, [messages]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (!filtersPopoverRef.current) return;
      if (!filtersPopoverRef.current.contains(t)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filtersOpen]);

  const unreadCountByFolder = useMemo(() => {
    const counts: Record<FmailMailbox, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      spam: 0,
      trash: 0,
    };
    for (const m of uiMessages) {
      if (m.isUnread) counts[m.mailbox] += 1;
    }
    return counts;
  }, [uiMessages]);

  const labelDisplayNames: Record<string, string> = {
    important: "Важно",
    projects: "Проекты",
    "class-5a": "Класс 5А",
  };
  const allLabelIds = useMemo(() => Array.from(new Set(uiMessages.flatMap((m) => m.labels))), [uiMessages]);
  const unreadCountByLabel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const id of allLabelIds) map[id] = 0;
    for (const m of uiMessages) {
      if (!m.isUnread) continue;
      for (const lid of m.labels) map[lid] = (map[lid] ?? 0) + 1;
    }
    return map;
  }, [uiMessages, allLabelIds]);

  const visibleMessages = useMemo(() => {
    if (folderOrLabelFilter === "__current") return uiMessages.filter((m) => m.mailbox === activeFolder);
    if (folderOrLabelFilter.startsWith("mailbox:")) {
      const mailbox = folderOrLabelFilter.slice("mailbox:".length) as FmailMailbox;
      return uiMessages.filter((m) => m.mailbox === mailbox);
    }
    if (folderOrLabelFilter.startsWith("label:")) {
      const labelId = folderOrLabelFilter.slice("label:".length);
      return uiMessages.filter((m) => m.labels.includes(labelId));
    }
    return uiMessages.filter((m) => m.mailbox === activeFolder);
  }, [uiMessages, activeFolder, folderOrLabelFilter]);

  const filtered = useMemo(() => {
    const unreadOnly = filterUnreadOnly;
    const pinnedOnly = filterPinnedOnly;
    const hasAttachments = filterHasAttachments;
    const fromQ = filterFromQuery.trim().toLowerCase();

    const q = search.trim().toLowerCase();

    return visibleMessages.filter((m) => {
      if (unreadOnly && !m.isUnread) return false;
      if (pinnedOnly && !m.isPinned) return false;
      if (hasAttachments && m.attachments.length === 0) return false;
      if (fromQ && !m.from.toLowerCase().includes(fromQ)) return false;

      if (!q) return true;
      const hay = `${m.subject} ${m.from} ${m.to.join(",")} ${m.snippet} ${m.body}`.toLowerCase();
      return hay.includes(q);
    });
  }, [visibleMessages, search, filterUnreadOnly, filterPinnedOnly, filterHasAttachments, filterFromQuery]);

  const activeMsg = useMemo(() => uiMessages.find((m) => m.id === activeId) ?? null, [uiMessages, activeId]);

  const selectedMessages = useMemo(() => uiMessages.filter((m) => selectedIds.has(m.id)), [uiMessages, selectedIds]);
  const selectedAllPinned = selectedMessages.length > 0 && selectedMessages.every((m) => m.isPinned);

  const toggleSelected = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const bulkArchive = useCallback(() => {
    setUiMessages((prev) =>
      prev.map((m) =>
        selectedIds.has(m.id)
          ? {
              ...m,
              mailbox: "archive",
              isUnread: false,
              status: "completed",
            }
          : m,
      ),
    );
    if (activeId && selectedIds.has(activeId)) setActiveId(null);
    clearSelection();
  }, [selectedIds, activeId, clearSelection]);

  const bulkDelete = useCallback(() => {
    setUiMessages((prev) =>
      prev.map((m) =>
        selectedIds.has(m.id)
          ? {
              ...m,
              mailbox: "trash",
              isUnread: false,
              status: "completed",
              isPinned: false,
            }
          : m,
      ),
    );
    if (activeId && selectedIds.has(activeId)) setActiveId(null);
    clearSelection();
  }, [selectedIds, activeId, clearSelection]);

  const bulkMarkUnread = useCallback(() => {
    setUiMessages((prev) =>
      prev.map((m) =>
        selectedIds.has(m.id)
          ? {
              ...m,
              isUnread: true,
              status: "unread",
            }
          : m,
      ),
    );
    clearSelection();
  }, [selectedIds, clearSelection]);

  const bulkMarkRead = useCallback(() => {
    setUiMessages((prev) =>
      prev.map((m) =>
        selectedIds.has(m.id)
          ? {
              ...m,
              isUnread: false,
              status: "completed",
            }
          : m,
      ),
    );
    clearSelection();
  }, [selectedIds, clearSelection]);

  const bulkTogglePinned = useCallback(() => {
    const nextPinned = !selectedAllPinned;
    setUiMessages((prev) =>
      prev.map((m) => (selectedIds.has(m.id) ? { ...m, isPinned: nextPinned } : m)),
    );
    clearSelection();
  }, [selectedIds, selectedAllPinned, clearSelection]);

  const bulkAddLabel = useCallback(() => {
    const lid = massLabelId.trim();
    if (!lid) return;
    setUiMessages((prev) =>
      prev.map((m) =>
        selectedIds.has(m.id) ? { ...m, labels: Array.from(new Set([...(m.labels ?? []), lid])) } : m,
      ),
    );
    clearSelection();
  }, [selectedIds, massLabelId, clearSelection]);

  const bulkRemoveLabel = useCallback(() => {
    const lid = massLabelId.trim();
    if (!lid) return;
    setUiMessages((prev) =>
      prev.map((m) => (selectedIds.has(m.id) ? { ...m, labels: (m.labels ?? []).filter((x) => x !== lid) } : m)),
    );
    clearSelection();
  }, [selectedIds, massLabelId, clearSelection]);

  const formatMailTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  return (
    <HostFloriumPanel title="Fmail" subtitle="Like Gmail, but EDUMED." className="h-full min-h-0">
      <div className="flex min-h-0 flex-1 overflow-hidden gap-4">
        {/* Left column: mailboxes */}
        <aside className="flex min-h-0 w-[280px] flex-col overflow-hidden">
          <div className="shrink-0 space-y-3 rounded-[var(--ed-radius-md)] border border-slate-200 bg-[var(--ed-surface)] px-3 py-3">
            <button
              type="button"
              className="ed-btn ed-btn-primary ed-interactive w-full"
              onClick={() => {
                setActiveFolder("drafts");
                clearSelection();
                setActiveId(null);
              }}
            >
              Написать
            </button>
            <div className="text-xs font-semibold text-slate-600">Мой адрес</div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900">
              {address}
            </div>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--ed-radius-md)] border border-slate-200 bg-[var(--ed-surface)]">
            <div className="overflow-y-auto p-2">
              <div className="text-xs font-semibold text-slate-600">Папки</div>
              <div className="mt-2 space-y-1">
                {folderList.map((f) => {
                  const active = f.id === activeFolder;
                  const unreadCount = unreadCountByFolder[f.id] ?? 0;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={[
                        "ed-interactive flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "ed-sidebar-active ed-interactive border border-sky-300 bg-white shadow-sm"
                          : "border border-transparent bg-transparent hover:bg-slate-50",
                      ].join(" ")}
                      onClick={() => {
                        setActiveFolder(f.id);
                        setFolderOrLabelFilter("__current");
                        clearSelection();
                        setActiveId(null);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{f.icon}</span>
                        <span className="truncate">{f.label}</span>
                      </span>
                      {unreadCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  className="ed-interactive flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => setShowMore((v) => !v)}
                >
                  <span>Ещё</span>
                  <span aria-hidden>{showMore ? "▾" : "▸"}</span>
                </button>
                {showMore ? (
                  <div className="mt-2 space-y-1 pl-1">
                    <div className="mb-1 text-xs font-semibold text-slate-600">Ярлыки</div>
                    {allLabelIds.length === 0 ? (
                      <div className="text-xs text-slate-500">Пока нет ярлыков.</div>
                    ) : (
                      allLabelIds.map((lid) => {
                        const active = folderOrLabelFilter === `label:${lid}`;
                        const unreadCount = unreadCountByLabel[lid] ?? 0;
                        return (
                          <button
                            key={lid}
                            type="button"
                            className={[
                              "ed-interactive flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                              active
                                ? "ed-sidebar-active ed-interactive border border-sky-300 bg-white shadow-sm"
                                : "border border-transparent bg-transparent hover:bg-slate-50",
                            ].join(" ")}
                            onClick={() => {
                              setFolderOrLabelFilter(`label:${lid}`);
                              clearSelection();
                              setActiveId(null);
                            }}
                          >
                            <span className="truncate">
                              {labelDisplayNames[lid] ?? lid}
                            </span>
                            {unreadCount > 0 ? (
                              <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        {/* Middle column: list */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--ed-radius-md)] border border-slate-200 bg-[var(--ed-surface)]">
          <div className="shrink-0 border-b border-slate-200 bg-white/80 px-3 py-2">
            <div className="flex items-center justify-between gap-3 relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по письмам…"
                className="ed-input w-full px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs whitespace-nowrap"
                onClick={() => setFiltersOpen((v) => !v)}
                disabled={selectedIds.size > 0}
                aria-expanded={filtersOpen}
              >
                Фильтры
              </button>

              {filtersOpen && selectedIds.size === 0 ? (
                <div
                  ref={filtersPopoverRef}
                  className="absolute right-0 top-full z-20 mt-2 w-[340px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                  role="dialog"
                  aria-label="Фильтры Fmail"
                >
                  <div className="text-sm font-semibold text-slate-900">Фильтры</div>

                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Статус</div>
                      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 text-sm">
                        <span>Непрочитанные</span>
                        <input type="checkbox" checked={filterUnreadOnly} onChange={(e) => setFilterUnreadOnly(e.target.checked)} />
                      </label>
                      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 text-sm">
                        <span>С закреплением</span>
                        <input type="checkbox" checked={filterPinnedOnly} onChange={(e) => setFilterPinnedOnly(e.target.checked)} />
                      </label>
                      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 text-sm">
                        <span>С вложениями</span>
                        <input type="checkbox" checked={filterHasAttachments} onChange={(e) => setFilterHasAttachments(e.target.checked)} />
                      </label>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">От кого</div>
                      <input
                        value={filterFromQuery}
                        onChange={(e) => setFilterFromQuery(e.target.value)}
                        placeholder="Напр.: Security, Bot…"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Папка / ярлык</div>
                      <select
                        value={folderOrLabelFilter}
                        onChange={(e) => setFolderOrLabelFilter(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="__current">Текущая папка</option>
                        {folderList.map((f) => (
                          <option key={f.id} value={`mailbox:${f.id}`}>
                            {f.label}
                          </option>
                        ))}
                        {allLabelIds.map((lid) => (
                          <option key={lid} value={`label:${lid}`}>
                            Ярлык: {labelDisplayNames[lid] ?? lid}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setFilterUnreadOnly(false);
                        setFilterPinnedOnly(false);
                        setFilterHasAttachments(false);
                        setFilterFromQuery("");
                        setFolderOrLabelFilter("__current");
                        setFiltersOpen(false);
                      }}
                    >
                      Сбросить
                    </button>
                    <button type="button" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => setFiltersOpen(false)}>
                      Применить
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            {selectedIds.size > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-600">Выбрано: {selectedIds.size}</span>
                <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" onClick={bulkArchive}>
                  Архивировать
                </button>
                <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" onClick={bulkMarkRead}>
                  Прочитанное
                </button>
                <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" onClick={bulkMarkUnread}>
                  Непрочитанное
                </button>
                <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" onClick={bulkTogglePinned} title="Закрепить/открепить">
                  {selectedAllPinned ? "Снять закрепление" : "Закрепить"}
                </button>
                <select
                  value={massLabelId}
                  onChange={(e) => setMassLabelId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                >
                  <option value="">Ярлык…</option>
                  {allLabelIds.map((lid) => (
                    <option key={lid} value={lid}>
                      {labelDisplayNames[lid] ?? lid}
                    </option>
                  ))}
                </select>
                <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" onClick={bulkAddLabel} disabled={!massLabelId}>
                  Добавить ярлык
                </button>
                <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" onClick={bulkRemoveLabel} disabled={!massLabelId}>
                  Убрать ярлык
                </button>
                <button type="button" className="ed-btn ed-btn-close ed-interactive px-3 py-1.5 text-xs" onClick={bulkDelete}>
                  Удалить
                </button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-600">Загрузка…</div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                {error.message}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">Пока нет писем.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map((m) => {
                  const checked = selectedIds.has(m.id);
                  const unread = m.isUnread;
                  const active = m.id === activeId;
                  return (
                    <div
                      key={m.id}
                      className={[
                        "group relative flex cursor-pointer items-start justify-between gap-3 rounded-2xl border bg-white px-3 py-2.5 shadow-sm transition-all duration-150",
                        active ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60",
                        unread ? "font-semibold bg-slate-50" : "font-medium",
                      ].join(" ")}
                      onClick={() => {
                        setActiveId(m.id);
                      }}
                      role="button"
                      aria-label={`Письмо: ${m.subject}`}
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleSelected(m.id, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {unread ? (
                                  <span
                                    className="inline-flex h-2 w-2 rounded-full bg-sky-500"
                                    aria-label="Непрочитано"
                                  />
                                ) : (
                                  <span className="inline-flex h-2 w-2 rounded-full bg-slate-300" aria-hidden />
                                )}
                                {m.isPinned ? (
                                  <span title="Закреплено" aria-hidden>
                                    📌
                                  </span>
                                ) : null}
                                <div className="line-clamp-1 truncate text-sm text-slate-900">{m.subject}</div>
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{m.snippet}</div>
                            </div>
                            <div className="shrink-0 text-[11px] text-slate-400">{formatMailTime(m.createdAt)}</div>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            От: <span className="font-medium text-slate-700">{m.from}</span> · Кому:{" "}
                            <span className="font-medium text-slate-700">{m.to.join(", ")}</span>
                          </div>
                        </div>
                      </div>

                      {/* Hover quick actions */}
                      <div className="pointer-events-none absolute right-2 top-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUiMessages((prev) =>
                                prev.map((x) =>
                                  x.id === m.id
                                    ? { ...x, mailbox: "archive", isUnread: false, status: "completed", isPinned: false }
                                    : x,
                                ),
                              );
                              if (activeId === m.id) setActiveId(null);
                              clearSelection();
                            }}
                            title="Архив"
                          >
                            🗄️
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUiMessages((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, mailbox: "trash", isUnread: false, status: "completed", isPinned: false } : x)),
                              );
                              if (activeId === m.id) setActiveId(null);
                              clearSelection();
                            }}
                            title="Удалить"
                          >
                            🗑️
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUiMessages((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, isUnread: true, status: "unread" } : x)),
                              );
                            }}
                            title="Пометить непрочитанным"
                          >
                            ✉️
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUiMessages((prev) =>
                                prev.map((x) =>
                                  x.id === m.id ? { ...x, isPinned: !x.isPinned } : x,
                                ),
                              );
                            }}
                            title={m.isPinned ? "Открепить" : "Закрепить"}
                          >
                            {m.isPinned ? "📌" : "📍"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right column: viewer */}
        <section className="flex min-h-0 w-[420px] flex-col overflow-hidden rounded-[var(--ed-radius-md)] border border-slate-200 bg-[var(--ed-surface)]">
          <div className="shrink-0 border-b border-slate-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Просмотр</div>
              {activeMsg ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{formatMailTime(activeMsg.createdAt)}</span>
                  <span className="text-slate-300">•</span>
                  <span>{activeMsg.status}</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">Выберите письмо</div>
              )}
            </div>

            {/* Top actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" disabled={!activeMsg}>
                Ответить
              </button>
              <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" disabled={!activeMsg}>
                Ответить всем
              </button>
              <button type="button" className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs" disabled={!activeMsg}>
                Переслать
              </button>
              <button
                type="button"
                className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs"
                disabled={!activeMsg}
                onClick={() => {
                  if (!activeMsg) return;
                  setUiMessages((prev) =>
                    prev.map((x) =>
                      x.id === activeMsg.id ? { ...x, mailbox: "archive", isUnread: false, status: "completed", isPinned: false } : x,
                    ),
                  );
                  setActiveId(null);
                }}
              >
                Архив
              </button>
              <button
                type="button"
                className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs"
                disabled={!activeMsg}
                onClick={() => {
                  if (!activeMsg) return;
                  setUiMessages((prev) =>
                    prev.map((x) => (x.id === activeMsg.id ? { ...x, isUnread: true, status: "unread" } : x)),
                  );
                }}
              >
                Непрочит.
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!activeMsg ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="text-4xl" aria-hidden>
                  📩
                </div>
                <div className="text-sm font-medium text-slate-800">Пока ничего</div>
                <div className="max-w-[260px] text-sm text-slate-600">Выберите письмо слева.</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-lg font-semibold text-slate-900">{activeMsg.subject}</div>
                <div className="text-xs text-slate-600">
                  От: <span className="font-medium text-slate-800">{activeMsg.from}</span> · Кому:{" "}
                  <span className="font-medium text-slate-800">{activeMsg.to.join(", ")}</span>
                </div>
                {activeMsg.bindings.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {activeMsg.bindings.map((b, idx) => (
                      <span key={`${b.type}:${b.refId}:${idx}`} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                        {b.type}: {b.refId}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="relative">
                  <button
                    type="button"
                    className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs"
                    onClick={() => setBindingPopoverOpen((v) => !v)}
                    title="Добавить связь"
                  >
                    Связать с…
                  </button>
                  {bindingPopoverOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-2 w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="text-sm font-semibold text-slate-900">Связь документа с сущностью</div>
                      <div className="mt-3 grid gap-2">
                        <select
                          value={bindingDraftType}
                          onChange={(e) => setBindingDraftType(e.target.value as typeof bindingDraftType)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="lesson">Урок</option>
                          <option value="class">Класс</option>
                          <option value="event">Событие</option>
                          <option value="journalDecision">Решение по журналу</option>
                        </select>
                        <input
                          value={bindingDraftRefId}
                          onChange={(e) => setBindingDraftRefId(e.target.value)}
                          placeholder="refId (id сущности)…"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setBindingPopoverOpen(false)}>
                          Отмена
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                          disabled={!bindingDraftRefId.trim()}
                          onClick={() => {
                            const refId = bindingDraftRefId.trim();
                            if (!activeMsg) return;
                            setUiMessages((prev) =>
                              prev.map((m) =>
                                m.id === activeMsg.id ? { ...m, bindings: [...m.bindings, { type: bindingDraftType, refId }] } : m,
                              ),
                            );
                            setBindingDraftRefId("");
                            setBindingPopoverOpen(false);
                          }}
                        >
                          Добавить
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800">
                  {activeMsg.body}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-700">Вложения</div>
                  {activeMsg.attachments.length === 0 ? (
                    <div className="mt-1 text-xs text-slate-600">Нет вложений.</div>
                  ) : (
                    <div className="mt-1 space-y-1 text-xs text-slate-600">
                      {activeMsg.attachments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{a.name}</span>
                          {a.sizeBytes != null ? <span className="shrink-0">{a.sizeBytes} B</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </HostFloriumPanel>
  );
}
