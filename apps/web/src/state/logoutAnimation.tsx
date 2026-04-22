import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { systemSounds } from "../audio/systemSounds";
import { useAuth } from "./auth";
import { useUiPreferences } from "./uiPreferences";

/** Фон как у LoginPage (`bg-slate-50` → #f8fafc). */
const LOGIN_BG = "#f8fafc";

/** Затемнение/появление фона оверлея выхода — дольше, ~2 с. */
const BACKDROP_FADE_MS = 2000;
const LOGO_START_MS = 400;
/** Появление надписи EDUMED. */
const LOGO_IN_MS = 900;
/** Сильная вспышка букв непосредственно перед исчезновением. */
const PURPLE_AT_MS = 3850;
/** Исчезновение надписи EDUMED начинается ровно на 4-й секунде от «Выйти». */
const MERGE_START_MS = 4000;
/** Быстрое растворение после вспышки (должно совпадать с CSS transition при merge). */
const LOGO_MERGE_DURATION_MS = 200;
/** Конец выцветания EDUMED: merge старт + растворение. */
const LOGO_FULLY_GONE_MS = MERGE_START_MS + LOGO_MERGE_DURATION_MS;
/** После исчезновения надписи — пауза, затем экран входа. */
const PAUSE_AFTER_LOGO_MS = 1000;
const LOGIN_REVEAL_START_MS = LOGO_FULLY_GONE_MS + PAUSE_AFTER_LOGO_MS;
const OVERLAY_FADE_MS = 500;
const OVERLAY_UNMOUNT_MS = LOGIN_REVEAL_START_MS + OVERLAY_FADE_MS;

/** Те же буквы и масштаб, что у `PostLoginSplash` (центр экрана). */
const LOGOUT_LETTERS = ["E", "D", "U", "M", "E", "D"] as const;

type LogoutAnimationContextValue = {
  beginLogout: () => void;
  /** Пока идёт сценарий выхода — для fade-out и `pointer-events: none` на `AppLayout`. */
  logoutAnimating: boolean;
};

const LogoutAnimationContext = createContext<LogoutAnimationContextValue | null>(null);

export function useLogoutAnimation(): LogoutAnimationContextValue {
  const v = useContext(LogoutAnimationContext);
  if (!v) throw new Error("useLogoutAnimation must be used within LogoutAnimationProvider");
  return v;
}

function LogoutAnimationOverlay({
  generation,
  startedAt,
  onDone,
}: {
  generation: number;
  /** t = 0 в момент клика «Выйти» (синхронно с beginLogout). */
  startedAt: number;
  onDone: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const genRef = useRef(generation);
  genRef.current = generation;
  const logoutRef = useRef(auth.logout);
  logoutRef.current = auth.logout;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const [backdropOpaque, setBackdropOpaque] = useState(0);
  const [logoIn, setLogoIn] = useState(false);
  const [purple, setPurple] = useState(false);
  const [merge, setMerge] = useState(false);
  const [fadeOverlay, setFadeOverlay] = useState(false);

  useLayoutEffect(() => {
    const id = window.requestAnimationFrame(() => setBackdropOpaque(1));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const ids: number[] = [];
    const delay = (targetMs: number) => Math.max(0, targetMs - (Date.now() - startedAt));

    ids.push(
      window.setTimeout(() => {
        if (genRef.current !== generation) return;
        setLogoIn(true);
      }, delay(LOGO_START_MS)),
    );

    ids.push(
      window.setTimeout(() => {
        if (genRef.current !== generation) return;
        setPurple(true);
      }, delay(PURPLE_AT_MS)),
    );

    ids.push(
      window.setTimeout(() => {
        if (genRef.current !== generation) return;
        setMerge(true);
      }, delay(MERGE_START_MS)),
    );

    ids.push(
      window.setTimeout(() => {
        if (genRef.current !== generation) return;
        logoutRef.current();
        navigateRef.current("/login", { replace: true, state: { logoutReveal: true } });
      }, delay(LOGIN_REVEAL_START_MS)),
    );

    ids.push(
      window.setTimeout(() => {
        if (genRef.current !== generation) return;
        setFadeOverlay(true);
      }, delay(LOGIN_REVEAL_START_MS)),
    );

    ids.push(
      window.setTimeout(() => {
        if (genRef.current !== generation) return;
        onDone();
      }, delay(OVERLAY_UNMOUNT_MS)),
    );

    return () => {
      for (const t of ids) window.clearTimeout(t);
    };
  }, [generation, onDone, startedAt]);

  const mergeDurationMs = LOGO_MERGE_DURATION_MS;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-transparent"
      style={{
        zIndex: 61000,
        pointerEvents: "auto",
        opacity: fadeOverlay ? 0 : 1,
        transition: `opacity ${OVERLAY_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: LOGIN_BG,
          opacity: backdropOpaque,
          transition: `opacity ${BACKDROP_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          pointerEvents: "none",
        }}
      />
      <div
        className="relative z-[1] flex select-none items-center justify-center px-4 font-sans text-[clamp(2.25rem,10vw,3.75rem)] font-bold tracking-[0.12em]"
        style={{
          opacity: merge ? 0 : logoIn ? 1 : 0,
          transform: logoIn ? "scale(1)" : "scale(0.96)",
          transition: merge
            ? `opacity ${mergeDurationMs}ms cubic-bezier(0.45, 0, 0.55, 1)`
            : `opacity ${LOGO_IN_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${LOGO_IN_MS}ms cubic-bezier(0.34, 1.2, 0.64, 1)`,
        }}
      >
        {LOGOUT_LETTERS.map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            style={{
              display: "inline-block",
              color: merge ? LOGIN_BG : purple ? "#a855f7" : "#64748b",
              textShadow: purple && !merge
                ? "0 0 4px rgba(255,255,255,1), 0 0 14px rgba(255,255,255,0.95), 0 0 28px rgba(250,250,255,0.9), 0 0 48px rgba(168,85,247,0.95), 0 0 80px rgba(139,92,246,0.65)"
                : "none",
              filter: purple && !merge ? "drop-shadow(0 0 12px rgba(255,255,255,0.9)) drop-shadow(0 0 24px rgba(168,85,247,0.85))" : "none",
              transition: merge
                ? `color ${mergeDurationMs}ms cubic-bezier(0.45, 0, 0.55, 1), text-shadow 120ms ease-out, filter 120ms ease-out`
                : purple
                  ? "color 90ms linear, text-shadow 90ms linear, filter 90ms linear"
                  : undefined,
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LogoutAnimationProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const ui = useUiPreferences();
  const [session, setSession] = useState<{ generation: number; startedAt: number } | null>(null);
  const generationRef = useRef(0);

  const beginLogout = useCallback(() => {
    if (session) return;
    if (!ui.showLogoutSplash || ui.audioGuidanceMode !== "full") {
      auth.logout();
      navigate("/login", { replace: true });
      return;
    }
    // Звук в том же синхронном стеке, что и клик «Выйти» — иначе autoplay режет play() из useEffect оверлея.
    // eslint-disable-next-line no-console -- диагностика звука выхода
    console.log("[LOGOUT_SOUND_CALL]");
    systemSounds.preload(["completion_of_work"]);
    systemSounds.play("completion_of_work");
    generationRef.current += 1;
    const startedAt = Date.now();
    setSession({ generation: generationRef.current, startedAt });
  }, [session, ui.showLogoutSplash, ui.audioGuidanceMode, auth, navigate]);

  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  const logoutAnimating = session !== null;

  const value = useMemo(
    () => ({ beginLogout, logoutAnimating }),
    [beginLogout, logoutAnimating],
  );

  return (
    <LogoutAnimationContext.Provider value={value}>
      {children}
      {session
        ? createPortal(
            <LogoutAnimationOverlay
              generation={session.generation}
              startedAt={session.startedAt}
              onDone={clearSession}
            />,
            document.body,
          )
        : null}
    </LogoutAnimationContext.Provider>
  );
}
