import { useEffect } from "react";
import { useFlorium, type FloriumActiveModule } from "../core/FlöriumProvider";
import { CommunitoriaPlaceholder } from "../modules/communitoria";
import { FmailPlaceholder } from "../modules/fmail";
import { RiviPlaceholder } from "../modules/rivi";

/*
 * TODO: Push notifications & device registration — subscribe to host-provided channels or a future
 * Florium notification service; keep tokens out of this package until the host exposes a safe API.
 *
 * TODO: "Secret vault" flows — Fmail (or a dedicated module) as a confirmation channel for
 * high-assurance actions; integrate with host identity / step-up auth when the backend supports it.
 */

const MODULES: { id: Exclude<FloriumActiveModule, null>; label: string }[] = [
  { id: "communitoria", label: "Communitoria · messaging" },
  { id: "fmail", label: "Fmail · secure mail" },
  { id: "rivi", label: "Rivi · work scenes" },
];

export interface FloriumLayoutProps {
  /** Optional class on the outer wrapper for host theming. */
  className?: string;
}

/**
 * In-app shell: user strip, module tabs, and active module view. Module switching uses
 * `navigate` from {@link useFlorium} only (no host router).
 */
export function FloriumLayout({ className }: FloriumLayoutProps) {
  const { user, activeModule, navigate } = useFlorium();

  useEffect(() => {
    if (activeModule === null) {
      navigate("communitoria");
    }
  }, [activeModule, navigate]);

  function renderModule() {
    switch (activeModule) {
      case "fmail":
        return <FmailPlaceholder />;
      case "rivi":
        return <RiviPlaceholder />;
      case "communitoria":
      default:
        return <CommunitoriaPlaceholder />;
    }
  }

  const rootClass = ["flex flex-col gap-6 max-w-4xl", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <header className="ed-panel p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="ed-h2 mb-1">Flörium workspace</h1>
            <p className="ed-caption text-slate-600 max-w-xl">
              Personal console for deep work, creative flows, and routine tasks.
            </p>
            <p className="text-sm text-slate-600 mt-3">
              Signed in as <span className="font-medium text-slate-800">{user.username}</span> (ID:{" "}
              <span className="font-mono font-medium text-slate-800">{user.id}</span>)
            </p>
          </div>
          <nav
            className="flex flex-wrap gap-2 shrink-0"
            aria-label="Flörium modules"
          >
            {MODULES.map(({ id, label }) => {
              const isActive = activeModule === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={
                    isActive
                      ? "ed-btn ed-btn-primary px-4 py-2 text-sm underline decoration-2 underline-offset-4 shadow-md"
                      : "ed-btn ed-btn-secondary px-4 py-2 text-sm border border-slate-200"
                  }
                  aria-pressed={isActive}
                  onClick={() => navigate(id)}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <div>{renderModule()}</div>
    </div>
  );
}
