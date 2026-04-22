import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useFlorium, type FloriumActiveModule } from "@edumed/florium";
import { UiTransitionSwap } from "../components/UiTransitionSwap";
import { EDUMED_SESSION_FOCUS_COMMUNITORIA } from "./communitoriaConstants";
import { CommunitoriaModule } from "./CommunitoriaModule";
import { FmailModule } from "./FmailModule";
import { RiviModule } from "./RiviModule";

const MODULE_TABS: { id: Exclude<FloriumActiveModule, null>; label: string }[] = [
  { id: "communitoria", label: "Communitoria" },
  { id: "fmail", label: "Fmail" },
  { id: "rivi", label: "Rivi" },
];

/**
 * Host-owned layout: module bodies use EDUMED data hooks; заголовок — только название раздела.
 */
export function SmartFloriumLayout({ className }: { className?: string }) {
  const { activeModule, navigate } = useFlorium();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (activeModule === null) {
      navigate("communitoria");
    }
  }, [activeModule, navigate]);

  useEffect(() => {
    const m = searchParams.get("m");
    if ((m === "communitoria" || m === "fmail" || m === "rivi") && activeModule !== m) {
      navigate(m);
    }
  }, [searchParams, activeModule, navigate]);

  useEffect(() => {
    if (activeModule !== "communitoria" && activeModule !== "fmail" && activeModule !== "rivi") return;
    setSearchParams(
      (prev) => {
        if (prev.get("m") === activeModule) return prev;
        const next = new URLSearchParams(prev);
        next.set("m", activeModule!);
        return next;
      },
      { replace: true },
    );
  }, [activeModule, setSearchParams]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(EDUMED_SESSION_FOCUS_COMMUNITORIA) === "1") {
        sessionStorage.removeItem(EDUMED_SESSION_FOCUS_COMMUNITORIA);
        navigate("communitoria");
      }
    } catch {
      // ignore
    }
  }, [navigate]);

  useEffect(() => {
    const onModule = (e: Event) => {
      const d = (e as CustomEvent<FloriumActiveModule>).detail;
      if (d === "communitoria" || d === "fmail" || d === "rivi") {
        navigate(d);
      }
    };
    window.addEventListener("edumed:florium-navigate-module", onModule);
    return () => window.removeEventListener("edumed:florium-navigate-module", onModule);
  }, [navigate]);

  function renderModule() {
    switch (activeModule) {
      case "fmail":
        return <FmailModule />;
      case "rivi":
        return <RiviModule />;
      case "communitoria":
      default:
        return <CommunitoriaModule />;
    }
  }

  const rootClass = [
    activeModule === "rivi"
      ? "flex min-h-0 min-w-0 w-full max-w-none flex-1 flex-col gap-0 overflow-hidden text-slate-800"
      : "flex min-h-0 min-w-0 w-full max-w-[min(100%,1600px)] flex-1 flex-col gap-0 overflow-hidden text-slate-800",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <header className="shrink-0 border-b border-slate-200 bg-[var(--ed-surface)] px-1 py-2">
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Модули Flörium">
          {MODULE_TABS.map(({ id, label }) => {
            const isActive = (activeModule ?? "communitoria") === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => navigate(id)}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sky-600 text-white shadow-sm"
                    : "border border-slate-200/90 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50/80",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-2">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <UiTransitionSwap transitionKey={activeModule ?? "pending"}>{renderModule()}</UiTransitionSwap>
        </div>
      </div>
    </div>
  );
}
