import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Slim session passed in by the host app. Flörium does not fetch the user; the host supplies
 * `florusSession` (e.g. via {@link FlöriumProvider}).
 *
 * - `id` — same value as the host's `PublicUser.id` (stable key for API correlation).
 * - `username` — same as `PublicUser.username`; used for display and for addresses like
 *   `username@fmail.com` inside Flörium modules.
 *
 * TODO: Extend with optional fields when the host opts in — e.g. `primaryRole`, locale, or a
 * shallow slice of `profilePrefs` — without coupling this package to the host's `PublicUser` type.
 */
export interface FlorusSession {
  id: string;
  username: string;
}

export type FloriumActiveModule = "communitoria" | "fmail" | "rivi" | null;

export interface FloriumContextValue {
  user: FlorusSession;
  activeModule: FloriumActiveModule;
  navigate: (module: FloriumActiveModule) => void;
}

const FloriumContext = createContext<FloriumContextValue | null>(null);

// TODO: Sync activeModule with URL / deep links when Flörium is split into a standalone product.

export function FlöriumProvider({
  children,
  florusSession,
}: {
  children: ReactNode;
  florusSession: FlorusSession;
}) {
  const [activeModule, setActiveModule] = useState<FloriumActiveModule>(null);

  const navigate = useCallback((module: FloriumActiveModule) => {
    setActiveModule(module);
  }, []);

  const value = useMemo(
    (): FloriumContextValue => ({
      user: florusSession,
      activeModule,
      navigate,
    }),
    [florusSession, activeModule, navigate],
  );

  return (
    <FloriumContext.Provider value={value}>{children}</FloriumContext.Provider>
  );
}

export function useFlorium(): FloriumContextValue {
  const ctx = useContext(FloriumContext);
  if (!ctx) {
    throw new Error("useFlorium must be used within FlöriumProvider");
  }
  return ctx;
}
