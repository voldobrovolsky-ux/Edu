import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { OfficeConfig } from "../types/office";
import { computeOfficeSections } from "../lib/office";
import { roleLabelRu } from "../lib/profileForm";
import { Sidebar } from "../components/Sidebar";
import { TaskTrackerReminderHost } from "../components/TaskTrackerReminderHost";
import { SectionTransitionOutlet } from "../components/SectionTransitionOutlet";
import { PostLoginSplash } from "../components/PostLoginSplash";
import { DedusAssistantOverlay } from "../components/DedusAssistantOverlay";
import { CommunitoriaHubProvider } from "../florium/CommunitoriaHubContext";
import { DedusProvider } from "../state/dedusContext";
import {
  markPostLoginSplashFinished,
  shouldShowPostLoginSplash,
} from "../session/postLoginSplashSession";
import { useAuth } from "../state/auth";
import { useLogoutAnimation } from "../state/logoutAnimation";
import { useUiPreferences } from "../state/uiPreferences";
import { RIVI_FOCUS_MODE_EVENT } from "../florium/riviStorage";

export function AppLayout() {
  const auth = useAuth();
  const { beginLogout, logoutAnimating } = useLogoutAnimation();
  const ui = useUiPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [postLoginSplashOpen, setPostLoginSplashOpen] = useState(
    () => shouldShowPostLoginSplash() && ui.showLoginSplash && ui.audioGuidanceMode === "full",
  );

  const onPostLoginSplashDone = useCallback(() => {
    markPostLoginSplashFinished();
    setPostLoginSplashOpen(false);
  }, []);
  useEffect(() => {
    if (!ui.showLoginSplash || ui.audioGuidanceMode !== "full") {
      markPostLoginSplashFinished();
      setPostLoginSplashOpen(false);
    }
  }, [ui.showLoginSplash, ui.audioGuidanceMode]);
  const [office, setOffice] = useState<OfficeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("edumed.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [riviFocusMode, setRiviFocusMode] = useState(false);

  useEffect(() => {
    const onFocusMode = (e: Event) => {
      const active = Boolean((e as CustomEvent<boolean>).detail);
      setRiviFocusMode(active);
      if (active) setIsSidebarCollapsed(true);
    };
    window.addEventListener(RIVI_FOCUS_MODE_EVENT, onFocusMode);
    return () => window.removeEventListener(RIVI_FOCUS_MODE_EVENT, onFocusMode);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("edumed.sidebar.collapsed", isSidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = auth.user?.locale === "en" ? "en" : "ru";
  }, [auth.user?.locale]);

  useEffect(() => {
    let cancelled = false;
    api.office()
      .then((r) => {
        if (cancelled) return;
        setOffice(r.office);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "OFFICE_LOAD_FAILED");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = useMemo(() => {
    if (!office || !auth.user) return [];
    const raw = computeOfficeSections({
      office,
      primaryRole: auth.user.primaryRole,
      secondaryRoles: auth.user.secondaryRoles,
    });
    // TODO: «Чаты» перенесены в Flörium → Communitoria; пункт скрыт из основного меню.
    return raw.filter((s) => s !== "chats");
  }, [office, auth.user]);

  const prevLocationRef = useRef<string | null>(null);
  useEffect(() => {
    const full = `${location.pathname}${location.search}`;
    const prev = prevLocationRef.current;
    prevLocationRef.current = full;
    if (prev === null) return;
    if (ui.sidebarAutoCollapse !== "each_section") return;
    if (full === prev) return;
    const prevPath = prev.split("?")[0] ?? prev;
    if (location.pathname === "/florium" && prevPath === "/florium") return;
    setIsSidebarCollapsed(true);
  }, [location.pathname, location.search, ui.sidebarAutoCollapse]);

  useEffect(() => {
    if (ui.sidebarAutoCollapse !== "idle_timeout") return;
    let t = 0;
    const arm = () => {
      window.clearTimeout(t);
      if (isSidebarCollapsed) return;
      t = window.setTimeout(() => setIsSidebarCollapsed(true), 38000);
    };
    arm();
    const onAct = () => arm();
    window.addEventListener("mousemove", onAct);
    window.addEventListener("keydown", onAct);
    window.addEventListener("click", onAct);
    return () => {
      window.removeEventListener("mousemove", onAct);
      window.removeEventListener("keydown", onAct);
      window.removeEventListener("click", onAct);
      window.clearTimeout(t);
    };
  }, [ui.sidebarAutoCollapse, isSidebarCollapsed]);

  const hideProfileHeader = location.pathname === "/florium" || location.pathname.startsWith("/florium/");
  const isFloriumRoute = hideProfileHeader;
  const isPersonalizationRoute = location.pathname === "/settings/personalization";

  return (
    <DedusProvider>
    <CommunitoriaHubProvider>
    {postLoginSplashOpen ? <PostLoginSplash onComplete={onPostLoginSplashDone} /> : null}
    <DedusAssistantOverlay />
    <TaskTrackerReminderHost />
    <div
      className={[
        "font-sans text-slate-800",
        logoutAnimating ? "ed-logout-dim" : "",
        isFloriumRoute ? "flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden" : "min-h-screen",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={["flex min-w-0 flex-1", isFloriumRoute ? "min-h-0 overflow-hidden" : "min-h-screen"].join(" ")}>
        <Sidebar
          sections={sections}
          collapsed={riviFocusMode ? true : isSidebarCollapsed}
          onToggleCollapsed={() => {
            if (riviFocusMode) {
              setRiviFocusMode(false);
              setIsSidebarCollapsed(false);
              return;
            }
            setIsSidebarCollapsed((prev) => !prev);
          }}
        />
        <div className={["flex min-w-0 flex-1 flex-col", isFloriumRoute ? "min-h-0 overflow-hidden" : "min-h-0"].join(" ")}>
          {!hideProfileHeader ? (
            <header
              className={[
                "ed-panel ed-panel-hover mx-4 mt-4 flex items-center justify-between gap-4 px-5 py-4",
                isPersonalizationRoute ? "lg:mr-[calc(20rem+1.5rem)]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {auth.user ? `${auth.user.lastName} ${auth.user.firstName}` : "—"}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {auth.user
                    ? `@${auth.user.username} · ${roleLabelRu(auth.user.primaryRole)} · ${auth.user.secondaryRoles.length ? auth.user.secondaryRoles.map(roleLabelRu).join(", ") : "—"}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="ed-btn ed-btn-secondary ed-interactive px-4 py-2 text-sm"
                  onClick={() => navigate("/profile")}
                >
                  Профиль
                </button>
                <button
                  type="button"
                  className="ed-btn ed-btn-primary ed-interactive px-4 py-2 text-sm"
                  onClick={() => beginLogout()}
                >
                  Выйти
                </button>
              </div>
            </header>
          ) : null}

          {error ? (
            <div className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Ошибка загрузки office-конфига: {error}
            </div>
          ) : null}

          <main
            className={[
              "flex min-w-0 flex-1 flex-col px-4 py-4",
              hideProfileHeader ? (riviFocusMode ? "min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-2" : "min-h-0 flex-1 overflow-hidden pt-6") : "min-h-0",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <SectionTransitionOutlet />
          </main>
        </div>
      </div>
    </div>
    </CommunitoriaHubProvider>
    </DedusProvider>
  );
}

