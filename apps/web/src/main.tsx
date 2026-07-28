import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/design/styles.css";
import "@/admin/ds/ds.css";
import { PrefsProvider } from "@/app/prefs";
import { AppShell } from "@/app/AppShell";
import { AdminApp } from "@/admin/AdminApp";
import {
  CurrentUserProvider,
  useCurrentUser,
  resolveCabinet,
  type CurrentUser,
  type CabinetKey,
  type FlorRole,
  type SubRole,
} from "@/cabinets/CurrentUser";
import { MINIMAL_CABINETS, type MinimalKey } from "@/cabinets/roleRegistry";
import { MinimalCabinet } from "@/cabinets/MinimalCabinet";
import { RoleSwitch } from "@/cabinets/RoleSwitch";
import { Home } from "@/home/Home";
import { BindConfirm } from "@/home/BindConfirm";
import { PilotOwner } from "@/pilot/PilotOwner";
import { PilotLogin } from "@/pilot/PilotLogin";

// Роутинг кабинета по роли (ADR-0005). teacher и admin — готовые кабинеты,
// остальные роли — минимальные кабинеты (навигация + главная).
function Shell() {
  const { user } = useCurrentUser();
  // §5.1: кабинет из каталога (бэкенд /me); resolveCabinet — fallback для DEV/без ответа.
  const cab = user.cabinet ?? resolveCabinet(user.florusRole, user.subRole);
  if (cab === "admin") return <AdminApp />;
  if (cab === "teacher") return <AppShell />;
  return <MinimalCabinet def={MINIMAL_CABINETS[cab as MinimalKey]} user={user} />;
}

function AuthedApp({ initialUser }: { initialUser?: CurrentUser }) {
  return (
    <CurrentUserProvider initialUser={initialUser}>
      <PrefsProvider>
        <Shell />
      </PrefsProvider>
      {!import.meta.env.PROD && <RoleSwitch />}
    </CurrentUserProvider>
  );
}

type Gate = { status: "loading" } | { status: "anon" } | { status: "authed"; user?: CurrentUser };

interface MeResp {
  florusUserId: string;
  name: string;
  role: FlorRole;
  subRole: SubRole;
  orgName?: string;
  cabinet?: CabinetKey; // §5.1: кабинет из каталога прав
  permissions?: string[];
}

/**
 * Гейт входа. ПРОД: спрашивает сессию (/api/auth/flor/me); есть — кабинет, нет — главная
 * (лендинг/киоск). DEV: по умолчанию кабинет (DEFAULT_USER + RoleSwitch); главную можно
 * посмотреть через ?screen=home.
 */
function useAuthGate(): Gate {
  const [gate, setGate] = useState<Gate>(() =>
    import.meta.env.PROD ? { status: "loading" } : { status: "authed" },
  );
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    fetch("/api/auth/flor/me", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<MeResp>) : null))
      .then((m) =>
        setGate(
          m
            ? {
                status: "authed",
                user: {
                  name: m.name,
                  florusRole: m.role,
                  subRole: m.subRole,
                  orgName: m.orgName ?? "Школа",
                  cabinet: m.cabinet, // §5.1: из каталога
                  permissions: m.permissions,
                },
              }
            : { status: "anon" },
        ),
      )
      .catch(() => setGate({ status: "anon" }));
  }, []);
  return gate;
}

const PENDING_BIND = "edustore-pending-bind";

function Root() {
  const gate = useAuthGate();
  const params = new URLSearchParams(window.location.search);
  const bind = params.get("bind");

  // ВРЕМЕННЫЙ пилотный auth (AUTH_MODE=pilot-qr): owner-экран и QR-вход — публичные роуты.
  const pilot = params.get("pilot");
  if (pilot === "owner") return <PilotOwner />;
  if (pilot === "login") return <PilotLogin token={params.get("token") ?? ""} />;

  // DEV-превью главной без входа.
  if (!import.meta.env.PROD && params.get("screen") === "home") return <Home />;

  if (gate.status === "loading") return <div className="eds-admin home-boot" />;

  // Привязка устройства с телефона (?bind=CODE) — требует входа.
  if (bind) {
    if (gate.status === "authed") return <BindConfirm code={bind} />;
    try {
      sessionStorage.setItem(PENDING_BIND, bind); // довяжем после входа
    } catch {
      /* ignore */
    }
    return <Home banner="Войдите в кабинет, чтобы привязать устройство" />;
  }

  if (gate.status === "authed") {
    // вернулись со входа с отложенной привязкой — завершаем её
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_BIND);
      if (pending) sessionStorage.removeItem(PENDING_BIND);
    } catch {
      /* ignore */
    }
    if (pending) return <BindConfirm code={pending} />;
    return <AuthedApp initialUser={gate.user} />;
  }

  return <Home />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
