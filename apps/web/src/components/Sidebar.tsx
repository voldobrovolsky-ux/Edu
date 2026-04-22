import { useCallback, useEffect, useRef, useState } from "react";
import { playIncomingNotificationSound } from "../audio/systemSounds";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { OfficeSection } from "../types/office";
import { SECTION_LABELS } from "../lib/office";
import {
  FLORIUM_FMAIL_BADGE_EVENT,
  FLORIUM_RIVI_BADGE_EVENT,
} from "../lib/floriumSidebarBadgeEvents";
import {
  emitPersonalizationSidebarSync,
  type PersonalizationSidebarSectionId,
} from "../lib/personalizationSidebarSync";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

function FloriumCardBadge({ count, compact }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  const label = compact ? (count > 9 ? "•" : String(count)) : count > 99 ? "99+" : String(count);
  return (
    <span
      className={[
        "pointer-events-none absolute z-[2] flex items-center justify-center rounded-full bg-rose-600 font-bold leading-none text-white shadow-sm",
        compact
          ? "right-0.5 top-0.5 h-3.5 min-w-[0.75rem] px-0.5 text-[7px]"
          : "right-2 top-2 h-[18px] min-w-[1.1rem] px-1 text-[10px]",
      ].join(" ")}
      aria-label={`Уведомлений: ${count}`}
    >
      {label}
    </span>
  );
}

export function Sidebar({
  sections,
  collapsed,
  onToggleCollapsed,
}: {
  sections: OfficeSection[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const location = useLocation();
  const auth = useAuth();
  const token = auth.accessToken;
  const [chatUnread, setChatUnread] = useState(0);
  const [fmailBadge, setFmailBadge] = useState(0);
  const [riviBadge, setRiviBadge] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);

  const refreshChatUnread = useCallback(async () => {
    if (!token) {
      prevUnreadRef.current = null;
      setChatUnread(0);
      return;
    }
    try {
      const r = await api.chats.unreadCount(token);
      const next = typeof r.total === "number" && r.total > 0 ? r.total : 0;
      const prev = prevUnreadRef.current;
      if (prev !== null && next > prev) {
        playIncomingNotificationSound();
      }
      prevUnreadRef.current = next;
      setChatUnread(next);
    } catch {
      prevUnreadRef.current = 0;
      setChatUnread(0);
    }
  }, [token]);

  useEffect(() => {
    void refreshChatUnread();
  }, [refreshChatUnread]);

  useEffect(() => {
    const onRefresh = () => void refreshChatUnread();
    window.addEventListener("edumed:chat-unread-refresh", onRefresh);
    const id = window.setInterval(() => void refreshChatUnread(), 20000);
    return () => {
      window.removeEventListener("edumed:chat-unread-refresh", onRefresh);
      window.clearInterval(id);
    };
  }, [refreshChatUnread]);

  useEffect(() => {
    if (!token) {
      setFmailBadge(0);
      setRiviBadge(0);
      return;
    }
    const onFmail = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      setFmailBadge(typeof d === "number" && d >= 0 ? d : 0);
    };
    const onRivi = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      setRiviBadge(typeof d === "number" && d >= 0 ? d : 0);
    };
    window.addEventListener(FLORIUM_FMAIL_BADGE_EVENT, onFmail);
    window.addEventListener(FLORIUM_RIVI_BADGE_EVENT, onRivi);
    return () => {
      window.removeEventListener(FLORIUM_FMAIL_BADGE_EVENT, onFmail);
      window.removeEventListener(FLORIUM_RIVI_BADGE_EVENT, onRivi);
    };
  }, [token]);

  const floriumMod =
    location.pathname === "/florium"
      ? new URLSearchParams(location.search).get("m") || "communitoria"
      : null;

  const floriumBlocks = [
    {
      m: "communitoria" as const,
      to: "/florium?m=communitoria",
      letter: "C",
      titleAttr: "Communitoria — чаты, общие комнаты и обсуждения.",
      a11yLabel: "Communitoria",
    },
    {
      m: "fmail" as const,
      to: "/florium?m=fmail",
      letter: "F",
      titleAttr: "Fmail — почта и длинные сообщения.",
      a11yLabel: "Fmail",
    },
    {
      m: "rivi" as const,
      to: "/florium?m=rivi",
      letter: "R",
      titleAttr: "Rivi — заметки, черновики и личные списки.",
      a11yLabel: "Rivi",
    },
  ] as const;

  const iconBySection: Record<OfficeSection, string> = {
    main: "🏠",
    analytics: "📊",
    document_archive: "📁",
    journal: "📘",
    timetable: "🗓️",
    methospace: "🧩",
    chats: "💬",
    diary: "📝",
    users_admin: "👥",
    parent_finance: "👛",
    student_finance: "🏦",
    payroll: "💼",
  };

  const selectedSectionFromLocation = useCallback((): PersonalizationSidebarSectionId | null => {
    if (location.pathname === "/section/tasks") return "tasks";
    if (location.pathname === "/section/payroll" || location.pathname.startsWith("/section/payroll/")) return "payroll";
    if (location.pathname === "/documents") return "document_archive";
    if (location.pathname.startsWith("/section/")) {
      const maybe = location.pathname.replace("/section/", "").split("/")[0] ?? "";
      if (sections.includes(maybe as OfficeSection)) return maybe as OfficeSection;
    }
    return null;
  }, [location.pathname, sections]);

  useEffect(() => {
    emitPersonalizationSidebarSync({ selected: selectedSectionFromLocation() });
  }, [selectedSectionFromLocation]);

  return (
    <aside
      className={[
        collapsed ? "w-[76px]" : "w-72",
        "sticky top-4 m-4 max-h-[calc(100vh-2rem)] shrink-0 self-start overflow-y-auto overflow-x-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition-all duration-200",
      ].join(" ")}
    >
      <div className={collapsed ? "px-2 py-3" : "px-4 py-4"}>
        <div className="flex items-center justify-between gap-2">
          {!collapsed ? (
            <div>
              <div className="text-sm font-semibold tracking-tight text-[color:var(--ed-text)]">EDUMED</div>
              <div className="mt-0.5 text-xs text-[color:var(--ed-text-muted)]">v0.1</div>
            </div>
          ) : (
            <div className="text-sm font-semibold text-[color:var(--ed-text)]">ED</div>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="ed-btn ed-btn-ghost ed-interactive px-3 py-1.5 text-xs"
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            ☰
          </button>
        </div>
      </div>
      <nav className="px-2 pb-4">
        {sections.map((s) => (
          <NavLink
            key={s}
            to={s === "document_archive" ? "/documents" : `/section/${s}`}
            end={s !== "document_archive"}
            className={({ isActive }) =>
              [
                "group flex items-center gap-2 rounded-full px-3 py-2.5 text-sm transition-all duration-200",
                isActive
                  ? "ed-sidebar-active ed-interactive translate-y-[-1px] border"
                  : "ed-interactive border border-transparent text-[color:var(--ed-text)] hover:bg-slate-100",
              ].join(" ")
            }
            title={SECTION_LABELS[s]}
            onMouseEnter={() => emitPersonalizationSidebarSync({ hovered: s })}
            onMouseLeave={() => emitPersonalizationSidebarSync({ hovered: null })}
            onFocus={() => emitPersonalizationSidebarSync({ hovered: s })}
            onBlur={() => emitPersonalizationSidebarSync({ hovered: null })}
            onClick={() => emitPersonalizationSidebarSync({ selected: s })}
          >
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm">
              {iconBySection[s]}
            </span>
            {!collapsed ? (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{SECTION_LABELS[s]}</span>
              </span>
            ) : null}
          </NavLink>
        ))}
        <Link
          to="/section/tasks"
          title="Трекер задач"
          className={[
            "group mt-1 flex items-center gap-2 rounded-full px-3 py-2.5 text-sm transition-all duration-200",
            location.pathname === "/section/tasks"
              ? "ed-sidebar-active ed-interactive translate-y-[-1px] border"
              : "ed-interactive border border-transparent text-[color:var(--ed-text)] hover:bg-slate-100",
          ].join(" ")}
          onMouseEnter={() => emitPersonalizationSidebarSync({ hovered: "tasks" })}
          onMouseLeave={() => emitPersonalizationSidebarSync({ hovered: null })}
          onFocus={() => emitPersonalizationSidebarSync({ hovered: "tasks" })}
          onBlur={() => emitPersonalizationSidebarSync({ hovered: null })}
          onClick={() => emitPersonalizationSidebarSync({ selected: "tasks" })}
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm">
            ✓
          </span>
          {!collapsed ? <span className="truncate">Трекер задач</span> : null}
        </Link>
        {collapsed ? (
          <div className="mt-2 px-0.5">
            <div className="grid grid-cols-3 gap-1" aria-label="Flörium: три модуля">
              {floriumBlocks.map((b) => {
                const active = location.pathname === "/florium" && floriumMod === b.m;
                const badgeCount = b.m === "communitoria" ? chatUnread : b.m === "fmail" ? fmailBadge : riviBadge;
                return (
                  <NavLink
                    key={b.m}
                    to={b.to}
                    title={b.titleAttr}
                    aria-label={b.a11yLabel}
                    {...(b.m === "communitoria" ? { "data-dedus-id": "communitoria.openFlorium" } : {})}
                    className={[
                      "relative flex min-h-[68px] min-w-0 flex-1 items-center justify-center rounded-xl border bg-white text-[color:var(--ed-text)] shadow-sm transition-all duration-200",
                      active
                        ? "ed-sidebar-active ed-interactive z-[1] border-sky-300 ring-2 ring-inset ring-sky-400/35"
                        : "border-slate-200 hover:bg-slate-50/95 hover:shadow-md",
                    ].join(" ")}
                  >
                    <FloriumCardBadge count={badgeCount} compact />
                    <span className="text-[1.65rem] font-bold leading-none tracking-tight text-[color:var(--ed-text)]" aria-hidden>
                      {b.letter}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 px-0.5">
            <div className="grid grid-cols-3 gap-2">
              {floriumBlocks.map((b) => {
                const active = location.pathname === "/florium" && floriumMod === b.m;
                const badgeCount = b.m === "communitoria" ? chatUnread : b.m === "fmail" ? fmailBadge : riviBadge;
                return (
                  <NavLink
                    key={b.m}
                    to={b.to}
                    title={b.titleAttr}
                    aria-label={b.a11yLabel}
                    {...(b.m === "communitoria" ? { "data-dedus-id": "communitoria.openFlorium" } : {})}
                    className={[
                      "relative flex min-h-[72px] min-w-0 items-center justify-center rounded-2xl border bg-white text-[color:var(--ed-text)] shadow-sm transition-all duration-200",
                      active
                        ? "ed-sidebar-active ed-interactive z-[1] border-sky-300 ring-2 ring-inset ring-sky-400/40"
                        : "border-slate-200 hover:bg-slate-50/95 hover:shadow-md",
                    ].join(" ")}
                  >
                    <FloriumCardBadge count={badgeCount} />
                    <span
                      className="text-[2rem] font-bold leading-none tracking-tight text-[color:var(--ed-text)] sm:text-[2.125rem]"
                      aria-hidden
                    >
                      {b.letter}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
        <NavLink
          to="/settings/personalization"
          className={({ isActive }) =>
            [
              "group mt-2 flex items-center gap-2 rounded-full px-3 py-2.5 text-sm transition-all duration-200",
              isActive
                ? "ed-sidebar-active ed-interactive translate-y-[-1px] border"
                : "ed-interactive border border-transparent text-[color:var(--ed-text)] hover:bg-slate-100",
            ].join(" ")
          }
          title="Персонализация"
        >
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm">⚙️</span>
          {!collapsed ? <span className="truncate">Персонализация</span> : null}
        </NavLink>
      </nav>
    </aside>
  );
}

