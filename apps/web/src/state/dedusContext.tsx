import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type DedusMode = "idle" | "awaitingAction" | "explaining" | "voice";

export interface DedusState {
  /** Режим помощи (затемнение, панель, подсветки). «Дух» живёт при !active. */
  active: boolean;
  mode: DedusMode;
  /** Закреплённый кликом блок — источник FAQ. */
  pinnedTargetId: string | null;
  lastQuestion: string | null;
  eyeViewport: { x: number; y: number } | null;
  voiceReplyStub: string | null;
}

type DedusContextValue = DedusState & {
  activateFromKeyboard: (cursorPosition: { x: number; y: number }) => void;
  pinToTarget: (targetId: string, rect: DOMRect, sourceElement: HTMLElement) => void;
  clearHoverTarget: () => void;
  startVoiceQuestion: () => void;
  finishVoiceQuestion: (text: string) => void;
  closeAssistant: () => void;
};

const DedusContext = createContext<DedusContextValue | null>(null);

const SHIFT_HOLD_MS = 3000;
const DEDUS_MARKED_CLASS = "dedus-marked-block";
const DEDUS_HOVER_CLASS = "dedus-hover-block";
const DEDUS_PINNED_CLASS = "dedus-pinned-block";

const SPIRIT_MARGIN = 44;
const SPIRIT_LERP = 0.0075;
const SPIRIT_FLUSH_MS = 52;
const SPIRIT_DETOUR_CHANCE = 0.11;
const SPIRIT_PAUSE_MIN_MS = 1400;
const SPIRIT_PAUSE_MAX_MS = 3800;
const SPIRIT_ARRIVE_DIST = 4;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

function eyeNearRect(rect: DOMRect): { x: number; y: number } {
  const pad = 14;
  const x = Math.min(rect.right + pad, window.innerWidth - 48);
  const y = rect.top + rect.height / 2;
  return { x: Math.max(24, x), y: Math.max(24, Math.min(window.innerHeight - 24, y)) };
}

function randomPointOnPerimeter(w: number, h: number, m: number): { x: number; y: number } {
  const iw = Math.max(80, w - 2 * m);
  const ih = Math.max(80, h - 2 * m);
  const perim = 2 * iw + 2 * ih;
  let t = Math.random() * perim;
  const topLen = iw;
  const rightLen = ih;
  const bottomLen = iw;
  if (t < topLen) {
    return { x: m + t, y: m };
  }
  t -= topLen;
  if (t < rightLen) {
    return { x: w - m, y: m + t };
  }
  t -= rightLen;
  if (t < bottomLen) {
    return { x: w - m - t, y: h - m };
  }
  t -= bottomLen;
  return { x: m, y: h - m - t };
}

function maybeDetour(
  p: { x: number; y: number },
  w: number,
  h: number,
  m: number,
): { x: number; y: number } {
  if (Math.random() > SPIRIT_DETOUR_CHANCE) return p;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const pull = 0.12 + Math.random() * 0.16;
  return {
    x: Math.max(m + 8, Math.min(w - m - 8, p.x + (cx - p.x) * pull)),
    y: Math.max(m + 8, Math.min(h - m - 8, p.y + (cy - p.y) * pull)),
  };
}

function pickSpiritTarget(w: number, h: number, m: number): { x: number; y: number } {
  const base = randomPointOnPerimeter(w, h, m);
  return maybeDetour(base, w, h, m);
}

function applyMarkedBlocksAll(): HTMLElement[] {
  const nodes = document.querySelectorAll<HTMLElement>("[data-dedus-id]");
  const list: HTMLElement[] = [];
  for (const el of nodes) {
    el.classList.add(DEDUS_MARKED_CLASS);
    list.push(el);
  }
  return list;
}

function removeMarkedBlocks(nodes: HTMLElement[]) {
  for (const el of nodes) {
    el.classList.remove(DEDUS_MARKED_CLASS);
    el.classList.remove(DEDUS_HOVER_CLASS);
    el.classList.remove(DEDUS_PINNED_CLASS);
  }
}

function initialSpiritPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 120, y: 100 };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return randomPointOnPerimeter(w, h, SPIRIT_MARGIN);
}

export function DedusProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<DedusMode>("idle");
  const [pinnedTargetId, setPinnedTargetId] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [eyeViewport, setEyeViewport] = useState<{ x: number; y: number } | null>(initialSpiritPos);
  const [voiceReplyStub, setVoiceReplyStub] = useState<string | null>(null);

  const markedNodesRef = useRef<HTMLElement[]>([]);
  const hoveredElRef = useRef<HTMLElement | null>(null);
  const pinnedElRef = useRef<HTMLElement | null>(null);
  const shiftTimerRef = useRef<number | null>(null);
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const holdingDedusShiftRef = useRef(false);
  const activeRef = useRef(false);
  const moveRafRef = useRef<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pinnedIdRef = useRef<string | null>(null);
  pinnedIdRef.current = pinnedTargetId;

  const spiritRafRef = useRef<number | null>(null);
  const spiritPosRef = useRef<{ x: number; y: number }>(initialSpiritPos());
  const spiritTargetRef = useRef<{ x: number; y: number }>(initialSpiritPos());
  const spiritPauseUntilRef = useRef(0);
  const spiritFlushRef = useRef(0);
  const latestEyeRef = useRef(eyeViewport);
  latestEyeRef.current = eyeViewport;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const clearShiftTimer = useCallback(() => {
    if (shiftTimerRef.current != null) {
      window.clearTimeout(shiftTimerRef.current);
      shiftTimerRef.current = null;
    }
  }, []);

  const clearHoverOutline = useCallback(() => {
    hoveredElRef.current?.classList.remove(DEDUS_HOVER_CLASS);
    hoveredElRef.current = null;
  }, []);

  const clearHoverTarget = useCallback(() => {
    clearHoverOutline();
    if (!pinnedIdRef.current) {
      setMode("awaitingAction");
    }
  }, [clearHoverOutline]);

  const clearPinVisual = useCallback(() => {
    pinnedElRef.current?.classList.remove(DEDUS_PINNED_CLASS);
    pinnedElRef.current = null;
    setPinnedTargetId(null);
  }, []);

  const closeAssistant = useCallback(() => {
    clearShiftTimer();
    holdingDedusShiftRef.current = false;
    activeRef.current = false;
    removeMarkedBlocks(markedNodesRef.current);
    markedNodesRef.current = [];
    clearHoverOutline();
    clearPinVisual();
    setActive(false);
    setMode("idle");
    setVoiceReplyStub(null);
    const le = latestEyeRef.current;
    if (le) {
      spiritPosRef.current = { x: le.x, y: le.y };
    }
    spiritTargetRef.current = pickSpiritTarget(
      window.innerWidth,
      window.innerHeight,
      SPIRIT_MARGIN,
    );
    spiritPauseUntilRef.current = 0;
  }, [clearShiftTimer, clearHoverOutline, clearPinVisual]);

  const activateFromKeyboard = useCallback(
    (pos: { x: number; y: number }) => {
      removeMarkedBlocks(markedNodesRef.current);
      markedNodesRef.current = applyMarkedBlocksAll();
      activeRef.current = true;
      setActive(true);
      setMode("awaitingAction");
      setPinnedTargetId(null);
      pinnedElRef.current = null;
      setEyeViewport({ x: pos.x + 8, y: pos.y + 4 });
      setVoiceReplyStub(null);
      clearHoverOutline();
    },
    [clearHoverOutline],
  );

  const pinToTarget = useCallback(
    (targetId: string, rect: DOMRect, sourceElement: HTMLElement) => {
      clearHoverOutline();
      pinnedElRef.current?.classList.remove(DEDUS_PINNED_CLASS);
      sourceElement.classList.add(DEDUS_PINNED_CLASS);
      pinnedElRef.current = sourceElement;
      setPinnedTargetId(targetId);
      setMode("explaining");
      setEyeViewport(eyeNearRect(rect));
    },
    [clearHoverOutline],
  );

  const startVoiceQuestion = useCallback(() => {
    if (!activeRef.current || !pinnedIdRef.current) return;
    setMode("voice");
  }, []);

  const finishVoiceQuestion = useCallback((text: string) => {
    const trimmed = text.trim();
    setLastQuestion(trimmed || null);
    setMode("explaining");
    setVoiceReplyStub(trimmed ? "Скоро здесь будет ответ Дедуса." : null);
  }, []);

  const flushHoverAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!activeRef.current || modeRef.current === "voice") return;

      if (pinnedIdRef.current) {
        const el = document.querySelector(`[data-dedus-id="${CSS.escape(pinnedIdRef.current)}"]`) as HTMLElement | null;
        if (el) {
          setEyeViewport(eyeNearRect(el.getBoundingClientRect()));
        }
        return;
      }

      const top = document.elementFromPoint(clientX, clientY);
      if (!(top instanceof Element)) {
        clearHoverOutline();
        setEyeViewport({ x: clientX + 10, y: clientY + 4 });
        setMode("awaitingAction");
        return;
      }
      const overlayRoot = document.querySelector("[data-dedus-help-overlay-root]");
      if (overlayRoot && overlayRoot.contains(top)) {
        return;
      }
      const el = top.closest("[data-dedus-id]") as HTMLElement | null;
      if (!el) {
        clearHoverOutline();
        setEyeViewport({ x: clientX + 10, y: clientY + 4 });
        setMode("awaitingAction");
        return;
      }
      if (hoveredElRef.current && hoveredElRef.current !== el) {
        hoveredElRef.current.classList.remove(DEDUS_HOVER_CLASS);
      }
      el.classList.add(DEDUS_HOVER_CLASS);
      hoveredElRef.current = el;
      setEyeViewport(eyeNearRect(el.getBoundingClientRect()));
      setMode("awaitingAction");
    },
    [clearHoverOutline],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!active || !pinnedTargetId) return;
    const sync = () => {
      const el = document.querySelector(`[data-dedus-id="${CSS.escape(pinnedTargetId)}"]`) as HTMLElement | null;
      if (el instanceof HTMLElement) {
        pinnedElRef.current = el;
        el.classList.add(DEDUS_PINNED_CLASS);
        setEyeViewport(eyeNearRect(el.getBoundingClientRect()));
      }
    };
    sync();
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [active, pinnedTargetId]);

  useEffect(() => {
    if (active) {
      if (spiritRafRef.current != null) {
        window.cancelAnimationFrame(spiritRafRef.current);
        spiritRafRef.current = null;
      }
      return;
    }

    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      return;
    }

    const start = latestEyeRef.current ?? spiritPosRef.current;
    spiritPosRef.current = { x: start.x, y: start.y };
    spiritTargetRef.current = pickSpiritTarget(window.innerWidth, window.innerHeight, SPIRIT_MARGIN);
    spiritPauseUntilRef.current = 0;
    spiritFlushRef.current = performance.now();

    const tick = (now: number) => {
      if (activeRef.current) {
        spiritRafRef.current = null;
        return;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      const m = SPIRIT_MARGIN;
      const pos = spiritPosRef.current;
      const tgt = spiritTargetRef.current;

      if (now < spiritPauseUntilRef.current) {
        spiritRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      pos.x += (tgt.x - pos.x) * SPIRIT_LERP;
      pos.y += (tgt.y - pos.y) * SPIRIT_LERP;

      const dist = Math.hypot(tgt.x - pos.x, tgt.y - pos.y);
      if (dist < SPIRIT_ARRIVE_DIST) {
        pos.x = tgt.x;
        pos.y = tgt.y;
        spiritTargetRef.current = pickSpiritTarget(w, h, m);
        if (Math.random() < 0.35) {
          spiritPauseUntilRef.current = now + SPIRIT_PAUSE_MIN_MS + Math.random() * (SPIRIT_PAUSE_MAX_MS - SPIRIT_PAUSE_MIN_MS);
        }
      }

      if (now - spiritFlushRef.current >= SPIRIT_FLUSH_MS) {
        spiritFlushRef.current = now;
        setEyeViewport({ x: pos.x, y: pos.y });
      }

      spiritRafRef.current = window.requestAnimationFrame(tick);
    };

    spiritRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (spiritRafRef.current != null) {
        window.cancelAnimationFrame(spiritRafRef.current);
        spiritRafRef.current = null;
      }
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = window.requestAnimationFrame(() => {
      const p = lastMouseRef.current;
      flushHoverAt(p.x, p.y);
    });
    return () => window.cancelAnimationFrame(id);
  }, [active, flushHoverAt]);

  useEffect(() => {
    if (!active) return;

    const onMove = (e: MouseEvent) => {
      if (moveRafRef.current != null) window.cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = window.requestAnimationFrame(() => {
        moveRafRef.current = null;
        flushHoverAt(e.clientX, e.clientY);
      });
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (moveRafRef.current != null) window.cancelAnimationFrame(moveRafRef.current);
    };
  }, [active, flushHoverAt]);

  useEffect(() => {
    if (!active) return;

    const onClickCapture = (e: MouseEvent) => {
      if (modeRef.current === "voice") return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      const overlayRoot = document.querySelector("[data-dedus-help-overlay-root]");
      if (overlayRoot && overlayRoot.contains(t)) return;
      const el = (t instanceof Element ? t.closest("[data-dedus-id]") : null) as HTMLElement | null;
      if (!el) return;
      const id = el.getAttribute("data-dedus-id");
      if (!id) return;
      pinToTarget(id, el.getBoundingClientRect(), el);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [active, pinToTarget]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeRef.current) {
          e.preventDefault();
          closeAssistant();
          return;
        }
        if (holdingDedusShiftRef.current) {
          e.preventDefault();
          clearShiftTimer();
          holdingDedusShiftRef.current = false;
        }
        return;
      }

      if (e.key !== "Shift") return;
      if (activeRef.current || holdingDedusShiftRef.current) return;
      if (isTypingTarget(document.activeElement)) return;

      holdingDedusShiftRef.current = true;
      clearShiftTimer();
      shiftTimerRef.current = window.setTimeout(() => {
        shiftTimerRef.current = null;
        holdingDedusShiftRef.current = false;
        if (isTypingTarget(document.activeElement)) return;
        const p = lastMouseRef.current;
        activateFromKeyboard({ x: p.x, y: p.y });
      }, SHIFT_HOLD_MS);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      if (e.getModifierState("Shift")) return;
      clearShiftTimer();
      holdingDedusShiftRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      clearShiftTimer();
      holdingDedusShiftRef.current = false;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [activateFromKeyboard, closeAssistant, clearShiftTimer]);

  const value = useMemo<DedusContextValue>(
    () => ({
      active,
      mode,
      pinnedTargetId,
      lastQuestion,
      eyeViewport,
      voiceReplyStub,
      activateFromKeyboard,
      pinToTarget,
      clearHoverTarget,
      startVoiceQuestion,
      finishVoiceQuestion,
      closeAssistant,
    }),
    [
      active,
      mode,
      pinnedTargetId,
      lastQuestion,
      eyeViewport,
      voiceReplyStub,
      activateFromKeyboard,
      pinToTarget,
      clearHoverTarget,
      startVoiceQuestion,
      finishVoiceQuestion,
      closeAssistant,
    ],
  );

  return <DedusContext.Provider value={value}>{children}</DedusContext.Provider>;
}

export function useDedus(): DedusContextValue {
  const v = useContext(DedusContext);
  if (!v) throw new Error("useDedus must be used within DedusProvider");
  return v;
}
