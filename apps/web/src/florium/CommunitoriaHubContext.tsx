import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AssistantHubPanel,
  CreateCommunityHubForm,
  CreateConferenceHubForm,
  CreateGroupHubForm,
  NewChatHubForm,
} from "./CommunitoriaHubForms";
import { EDUMED_SESSION_FOCUS_COMMUNITORIA } from "./communitoriaConstants";

export type CommunitoriaHubMode =
  | "newChat"
  | "createGroup"
  | "createCommunity"
  | "createConference"
  | "assistant";

type CommunitoriaHubContextValue = {
  open: (mode: CommunitoriaHubMode) => void;
  close: () => void;
  mode: CommunitoriaHubMode | null;
};

const CommunitoriaHubContext = createContext<CommunitoriaHubContextValue | null>(null);

const TITLES: Record<CommunitoriaHubMode, string> = {
  newChat: "Новый чат",
  createGroup: "Создать группу",
  createCommunity: "Создать сообщество",
  createConference: "Создать конференцию",
  assistant: "Ассистент",
};

function CommunitoriaHubModal({
  mode,
  onClose,
}: {
  mode: CommunitoriaHubMode;
  onClose: () => void;
}) {
  const tryClose = useCallback(() => {
    if (mode === "createGroup" || mode === "createCommunity") {
      const msg =
        mode === "createGroup"
          ? "Вы уверены, что хотите выйти без создания группы?"
          : "Вы уверены, что хотите выйти без создания сообщества?";
      const ok = window.confirm(msg);
      if (!ok) return;
    }
    onClose();
  }, [mode, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryClose]);

  const body = useMemo(() => {
    switch (mode) {
      case "newChat":
        return <NewChatHubForm onClose={onClose} />;
      case "createGroup":
        return <CreateGroupHubForm onClose={onClose} />;
      case "createCommunity":
        return <CreateCommunityHubForm onClose={onClose} />;
      case "createConference":
        return <CreateConferenceHubForm onClose={onClose} />;
      case "assistant":
        return <AssistantHubPanel onClose={onClose} />;
    }
  }, [mode, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const wide = mode === "createGroup" || mode === "createCommunity";
  const layer = (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[8px]"
      role="presentation"
      aria-hidden
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="communitoria-hub-title"
        className={[
          "flex max-h-[min(92vh,820px)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]",
          wide ? "max-w-2xl" : "max-w-lg",
        ].join(" ")}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 id="communitoria-hub-title" className="text-base font-semibold text-slate-900">
            {TITLES[mode]}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            onClick={tryClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{body}</div>
      </div>
    </div>
  );

  return createPortal(layer, document.body);
}

export function CommunitoriaHubProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<CommunitoriaHubMode | null>(null);

  const close = useCallback(() => setMode(null), []);

  const ensureFloriumCommunitoria = useCallback(() => {
    const onFlorium = location.pathname === "/florium" || location.pathname.startsWith("/florium/");
    if (!onFlorium) {
      try {
        sessionStorage.setItem(EDUMED_SESSION_FOCUS_COMMUNITORIA, "1");
      } catch {
        // ignore
      }
      navigate("/florium");
    } else {
      window.dispatchEvent(new CustomEvent("edumed:florium-navigate-module", { detail: "communitoria" }));
    }
  }, [location.pathname, navigate]);

  const open = useCallback(
    (next: CommunitoriaHubMode) => {
      setMode(next);
      ensureFloriumCommunitoria();
    },
    [ensureFloriumCommunitoria],
  );

  const value = useMemo(
    (): CommunitoriaHubContextValue => ({
      open,
      close,
      mode,
    }),
    [open, close, mode],
  );

  return (
    <CommunitoriaHubContext.Provider value={value}>
      {children}
      {mode ? <CommunitoriaHubModal mode={mode} onClose={close} /> : null}
    </CommunitoriaHubContext.Provider>
  );
}

export function useCommunitoriaHub(): CommunitoriaHubContextValue {
  const ctx = useContext(CommunitoriaHubContext);
  if (!ctx) {
    throw new Error("useCommunitoriaHub must be used within CommunitoriaHubProvider");
  }
  return ctx;
}
