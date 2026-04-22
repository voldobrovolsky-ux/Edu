import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ED_Z_PREVIEW_DECORATION } from "../lib/zLayers";
import type { FullUiPreferences } from "../state/uiPersonalization";
import { personalizationRootClasses, personalizationSandboxCssVars } from "../state/uiPersonalization";
import { usePersonalizationPreview } from "../state/personalizationPreview";
import {
  PersonalizationDraftSample,
  type PersonalizationDemoPhase,
} from "./PersonalizationDraftSample";

function sleep(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

const MORPH_MS = 320;

function PrefsSandbox({
  prefs,
  title,
  subtitle,
}: {
  prefs: FullUiPreferences;
  title: string;
  subtitle: string;
}) {
  const classes = personalizationRootClasses(prefs);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);

  return (
    <div
      className={`ed-personalization-preview-sandbox flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 rounded-lg border border-slate-200/80 p-3 ${dark ? "dark" : ""} ${classes.join(" ")}`}
      style={personalizationSandboxCssVars(prefs) as CSSProperties}
    >
      <div className="shrink-0 text-xs font-semibold text-[var(--ed-text)]">{title}</div>
      <p className="shrink-0 text-[10px] leading-snug text-[var(--ed-text-muted)]">{subtitle}</p>
      <div className="ed-preview-sample-panel ed-panel-hover min-h-0 flex-1 space-y-2">
        <div className="text-xs font-medium text-[var(--ed-text)]">Блок</div>
        <p className="text-[11px] text-[var(--ed-text-muted)]">Пример панели и кнопки.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="ed-preview-sample-btn">
            Кнопка
          </button>
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800">
            список
          </span>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_POS_KEY = "edumed.personalization.preview.pos";
const PREVIEW_SIZE_KEY = "edumed.personalization.preview.size";

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

const RIGHT_NAV_RESERVE_LG = 312;

function isWideViewport() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

function clampPreviewPosition(x: number, y: number, w: number, _h: number) {
  const reserve = isWideViewport() ? RIGHT_NAV_RESERVE_LG : 16;
  const maxX = Math.max(8, window.innerWidth - reserve - w - 8);
  const maxY = Math.max(8, window.innerHeight - 48);
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  };
}

/** Летающий глаз: без резерва под правую колонку — как и слева, может наезжать на любую панель (z-index выше). */
function clampOrbPosition(x: number, y: number, w: number, _h: number) {
  const m = 8;
  const maxX = Math.max(m, window.innerWidth - w - m);
  const maxY = Math.max(m, window.innerHeight - 48);
  return {
    x: Math.max(m, Math.min(x, maxX)),
    y: Math.max(m, Math.min(y, maxY)),
  };
}

function preferredWindowPosition(fromX: number, fromY: number, w: number, h: number) {
  const reserve = isWideViewport() ? RIGHT_NAV_RESERVE_LG : 16;
  const centerX = Math.max(8, (window.innerWidth - reserve - w) / 2);
  const centerY = Math.max(8, (window.innerHeight - h) / 2 - 10);
  // Мягко тянем окно к центру, но оставляем «естественную» связь с положением орба.
  const blendedX = fromX * 0.28 + centerX * 0.72;
  const blendedY = fromY * 0.35 + centerY * 0.65;
  return clampPreviewPosition(blendedX, blendedY, w, h);
}

/** Центр орба относительно курсора: чуть вправо и вниз, чтобы не перекрывать указатель. */
const ORB_CURSOR_OFFSET = { x: 40, y: 32 } as const;
const ORB_FOLLOW_LERP = 0.16;
const ORB_FLOAT_AMP = { x: 8, y: 7 } as const;

function orbTopLeftForAnchor(centerX: number, centerY: number, orbSize: number) {
  return clampOrbPosition(centerX - orbSize / 2, centerY - orbSize / 2, orbSize, orbSize);
}

function idleFloatXY(tSec: number): { x: number; y: number } {
  return {
    x:
      Math.sin(tSec * 1.15) * ORB_FLOAT_AMP.x * 0.55 +
      Math.sin(tSec * 2.05 + 1.1) * ORB_FLOAT_AMP.x * 0.45,
    y:
      Math.cos(tSec * 0.92 + 0.4) * ORB_FLOAT_AMP.y * 0.6 +
      Math.cos(tSec * 1.73 + 0.2) * ORB_FLOAT_AMP.y * 0.4,
  };
}

export function PersonalizationPreviewPanel() {
  const {
    isOpen,
    windowOpen,
    baseline,
    draft,
    demoNonce,
    isDirty,
    previewFocusField,
    previewEyeButtonRef,
    lastEyeCursorClient,
    personalizationEyeSeq,
    wantsMorphClose,
    saveDraft,
    cancelDraft,
    requestMorphClose,
    completeMorphRetractToOrb,
  } = usePersonalizationPreview();

  const [phase, setPhase] = useState<PersonalizationDemoPhase>("idle");
  const [showActions, setShowActions] = useState(false);
  const dragState = useRef<{
    kind: "move" | "resize";
    sx: number;
    sy: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const draggingRef = useRef(false);
  const anchorDocRef = useRef({ x: 0, y: 0 });
  const [isDraggingUi, setIsDraggingUi] = useState(false);

  const [rect, setRect] = useState(() => readStoredJson(PREVIEW_POS_KEY, { x: 48, y: 96 }));
  const [size, setSize] = useState(() =>
    readStoredJson(PREVIEW_SIZE_KEY, {
      w: Math.min(720, typeof window !== "undefined" ? window.innerWidth - 80 : 720),
      h: 440,
    }),
  );
  const liveSizeRef = useRef(size);
  liveSizeRef.current = size;

  /** Текущий экранный прямоугольник панели (морфинг глаз ↔ окно). */
  const [box, setBox] = useState({ x: 48, y: 96, w: 400, h: 300 });
  const [morphTransition, setMorphTransition] = useState(false);
  const [contentOpaque, setContentOpaque] = useState(true);
  const closingTimerRef = useRef(0);
  const wasOpenRef = useRef(false);

  const ORB_SIZE = 44;
  const cursorTargetRef = useRef<{ x: number; y: number } | null>(null);
  /** Сырой курсор; якорь орба сглаживается и смещён на ORB_CURSOR_OFFSET. */
  const orbRawCursorRef = useRef<{ x: number; y: number } | null>(null);
  const orbSmoothCursorRef = useRef<{ x: number; y: number } | null>(null);
  const orbFloatStartMsRef = useRef<number | null>(null);
  const lastOrbSnapSeqRef = useRef(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const openTargetFromBox = useCallback(
    (x: number, y: number) => {
      const c = preferredWindowPosition(x, y, size.w, size.h);
      return { x: c.x, y: c.y, w: size.w, h: size.h };
    },
    [size.w, size.h],
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wantsMorphClose) return;

    if (!windowOpen) {
      wasOpenRef.current = false;
      setMorphTransition(false);
      setContentOpaque(false);
      const snapEyeClick = personalizationEyeSeq !== lastOrbSnapSeqRef.current;
      if (snapEyeClick) {
        lastOrbSnapSeqRef.current = personalizationEyeSeq;
        const t =
          lastEyeCursorClient ??
          (() => {
            const eye = previewEyeButtonRef.current?.getBoundingClientRect();
            return eye ? { x: eye.left + eye.width / 2, y: eye.top + eye.height / 2 } : null;
          })();
        if (t) {
          cursorTargetRef.current = t;
          orbRawCursorRef.current = { x: t.x, y: t.y };
          orbSmoothCursorRef.current = { x: t.x, y: t.y };
          orbFloatStartMsRef.current = performance.now();
          const f = idleFloatXY(0);
          const o = orbTopLeftForAnchor(
            t.x + ORB_CURSOR_OFFSET.x + f.x,
            t.y + ORB_CURSOR_OFFSET.y + f.y,
            ORB_SIZE,
          );
          setBox({ x: o.x, y: o.y, w: ORB_SIZE, h: ORB_SIZE });
        }
      } else {
        setBox((b) => ({ ...b, w: ORB_SIZE, h: ORB_SIZE }));
      }
      return;
    }

    const justOpenedWindow = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpenedWindow) return;

    const target = openTargetFromBox(box.x, box.y);
    anchorDocRef.current = { x: target.x + window.scrollX, y: target.y + window.scrollY };
    setRect((r) => ({ ...r, x: target.x, y: target.y }));
    setMorphTransition(false);
    setContentOpaque(false);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setMorphTransition(true);
        setBox({ x: target.x, y: target.y, w: target.w, h: target.h });
        window.setTimeout(() => setContentOpaque(true), Math.min(120, MORPH_MS * 0.35));
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    isOpen,
    windowOpen,
    wantsMorphClose,
    ORB_SIZE,
    openTargetFromBox,
    personalizationEyeSeq,
    lastEyeCursorClient,
    previewEyeButtonRef,
  ]);

  useLayoutEffect(() => {
    if (!wantsMorphClose) return;
    window.clearTimeout(closingTimerRef.current);

    const c = cursorTargetRef.current;
    if (!c) {
      completeMorphRetractToOrb();
      return;
    }

    const centerX = c.x + ORB_CURSOR_OFFSET.x;
    const centerY = c.y + ORB_CURSOR_OFFSET.y;
    const orb = orbTopLeftForAnchor(centerX, centerY, ORB_SIZE);
    setContentOpaque(false);
    setMorphTransition(true);
    setBox({ x: orb.x, y: orb.y, w: ORB_SIZE, h: ORB_SIZE });
    closingTimerRef.current = window.setTimeout(() => {
      completeMorphRetractToOrb();
      closingTimerRef.current = 0;
    }, MORPH_MS + 24);
    return () => {
      window.clearTimeout(closingTimerRef.current);
    };
  }, [wantsMorphClose, completeMorphRetractToOrb, ORB_SIZE]);

  const prevWindowOpenRef = useRef(false);

  // Пока открыта сессия превью, всегда знаем положение курсора (в т.ч. при открытом окне).
  useEffect(() => {
    if (!isOpen || wantsMorphClose) return;
    const onMove = (e: MouseEvent) => {
      cursorTargetRef.current = { x: e.clientX, y: e.clientY };
      if (!orbRawCursorRef.current) orbRawCursorRef.current = { x: e.clientX, y: e.clientY };
      else {
        orbRawCursorRef.current.x = e.clientX;
        orbRawCursorRef.current.y = e.clientY;
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [isOpen, wantsMorphClose]);

  useLayoutEffect(() => {
    if (!isOpen) {
      prevWindowOpenRef.current = false;
      return;
    }
    if (wantsMorphClose) return;
    const wasOpen = prevWindowOpenRef.current;
    prevWindowOpenRef.current = windowOpen;
    if (wasOpen && !windowOpen) {
      const r = orbRawCursorRef.current;
      if (r) orbSmoothCursorRef.current = { x: r.x, y: r.y };
    }
  }, [isOpen, windowOpen, wantsMorphClose]);

  // Орб держится на отступе от курсора, мягко следует за ним и самостоятельно «парит».
  useEffect(() => {
    if (!isOpen || windowOpen || wantsMorphClose) return;

    if (orbFloatStartMsRef.current == null) orbFloatStartMsRef.current = performance.now();

    const rafIdRef = { current: 0 };
    const tick = (now: number) => {
      if (draggingRef.current || isDraggingUi) {
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const raw = orbRawCursorRef.current;
      const smooth = orbSmoothCursorRef.current;
      if (!raw) {
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }
      if (!smooth) {
        orbSmoothCursorRef.current = { x: raw.x, y: raw.y };
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }
      smooth.x += (raw.x - smooth.x) * ORB_FOLLOW_LERP;
      smooth.y += (raw.y - smooth.y) * ORB_FOLLOW_LERP;
      const t0 = orbFloatStartMsRef.current ?? now;
      const f = idleFloatXY((now - t0) / 1000);
      const cx = smooth.x + ORB_CURSOR_OFFSET.x + f.x;
      const cy = smooth.y + ORB_CURSOR_OFFSET.y + f.y;
      const o = orbTopLeftForAnchor(cx, cy, ORB_SIZE);
      setBox({ x: o.x, y: o.y, w: ORB_SIZE, h: ORB_SIZE });
      rafIdRef.current = window.requestAnimationFrame(tick);
    };
    rafIdRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafIdRef.current);
    };
  }, [isOpen, windowOpen, wantsMorphClose, ORB_SIZE, isDraggingUi]);

  useEffect(() => {
    if (!isOpen || !windowOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (t && root.contains(t)) return; // click inside panel
      const eyeBtn = previewEyeButtonRef.current;
      if (t && eyeBtn && eyeBtn.contains(t)) return;

      // Missed the window: revert changes and retract to the orb.
      cancelDraft();
      requestMorphClose();
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [isOpen, windowOpen, cancelDraft, requestMorphClose]);

  useLayoutEffect(() => {
    if (!isOpen || !windowOpen || wantsMorphClose) return;
    setRect((r) => {
      const c = clampPreviewPosition(r.x, r.y, size.w, size.h);
      anchorDocRef.current = { x: c.x + window.scrollX, y: c.y + window.scrollY };
      return c.x !== r.x || c.y !== r.y ? { ...r, ...c } : r;
    });
  }, [isOpen, windowOpen, wantsMorphClose, size.w, size.h]);

  useEffect(() => {
    if (!isOpen || !windowOpen || wantsMorphClose) return;
    const syncFromAnchor = () => {
      if (draggingRef.current) return;
      const nx = anchorDocRef.current.x - window.scrollX;
      const ny = anchorDocRef.current.y - window.scrollY;
      const c = clampPreviewPosition(nx, ny, size.w, size.h);
      setRect((r) => (r.x === c.x && r.y === c.y ? r : { ...r, ...c }));
      setBox((b) => ({ ...b, x: c.x, y: c.y, w: size.w, h: size.h }));
    };
    window.addEventListener("scroll", syncFromAnchor, { passive: true });
    window.addEventListener("resize", syncFromAnchor);
    return () => {
      window.removeEventListener("scroll", syncFromAnchor);
      window.removeEventListener("resize", syncFromAnchor);
    };
  }, [isOpen, windowOpen, wantsMorphClose, size.w, size.h]);

  useEffect(() => {
    if (!isOpen || !windowOpen) return;
    try {
      localStorage.setItem(PREVIEW_POS_KEY, JSON.stringify(rect));
      localStorage.setItem(PREVIEW_SIZE_KEY, JSON.stringify(size));
    } catch {
      // ignore
    }
  }, [isOpen, rect, size]);

  useEffect(() => {
    if (!isOpen || !windowOpen || !draft || wantsMorphClose) {
      setShowActions(false);
      setPhase("idle");
      return;
    }

    let alive = true;

    async function runOneCycle() {
      if (!alive) return;
      setPhase("exit");
      await sleep(200);
      if (!alive) return;
      setPhase("enter");
      await sleep(240);
      if (!alive) return;
      setPhase("hover");
      await sleep(400);
      if (!alive) return;
      setPhase("press");
      await sleep(320);
      if (!alive) return;
      setPhase("idle");
    }

    async function runner() {
      setShowActions(false);
      await runOneCycle();
      if (!alive) return;
      setShowActions(true);
      while (alive) {
        await sleep(2000);
        if (!alive) return;
        await runOneCycle();
      }
    }

    void runner();
    return () => {
      alive = false;
    };
  }, [isOpen, windowOpen, draft, demoNonce, wantsMorphClose]);

  const onMoveStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      setIsDraggingUi(true);
      dragState.current = {
        kind: "move",
        sx: rect.x,
        sy: rect.y,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };
    },
    [rect.x, rect.y, size.w, size.h],
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = true;
      setIsDraggingUi(true);
      dragState.current = {
        kind: "resize",
        sx: rect.x,
        sy: rect.y,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };
    },
    [rect.x, rect.y, size.w, size.h],
  );

  useEffect(() => {
    if (!isOpen || !windowOpen) return;
    const onMove = (e: MouseEvent) => {
      const d = dragState.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.kind === "move") {
        const raw = { x: d.sx + dx, y: d.sy + dy };
        const c = clampPreviewPosition(raw.x, raw.y, size.w, size.h);
        setRect((r) => ({ ...r, ...c }));
        setBox((b) => ({ ...b, x: c.x, y: c.y }));
      } else {
        setSize({
          w: Math.max(300, d.startW + dx),
          h: Math.max(260, d.startH + dy),
        });
        setBox((b) => ({ ...b, w: Math.max(300, d.startW + dx), h: Math.max(260, d.startH + dy) }));
      }
    };
    const onUp = () => {
      if (dragState.current) {
        const w = liveSizeRef.current.w;
        const h = liveSizeRef.current.h;
        setRect((r) => {
          const c = clampPreviewPosition(r.x, r.y, w, h);
          anchorDocRef.current = { x: c.x + window.scrollX, y: c.y + window.scrollY };
          return { ...r, ...c };
        });
        setBox((b) => {
          const c = clampPreviewPosition(b.x, b.y, w, h);
          return { ...b, x: c.x, y: c.y, w, h };
        });
      }
      dragState.current = null;
      draggingRef.current = false;
      setIsDraggingUi(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isOpen, windowOpen, wantsMorphClose, size.w, size.h]);

  if (!isOpen || !baseline || !draft) return null;

  const rounding = box.w < 120 && box.h < 120 ? "9999px" : "1rem";
  const showEyeHeader = box.w < 200 || box.h < 200;
  const orbMode = !windowOpen;

  return (
    <div
      className="pointer-events-auto fixed flex flex-col overflow-hidden border border-slate-300 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
      ref={rootRef}
      style={{
        left: box.x,
        top: box.y,
        width: Math.max(box.w, 44),
        height: Math.max(box.h, 44),
        zIndex: ED_Z_PREVIEW_DECORATION,
        borderRadius: rounding,
        transition:
          morphTransition && !isDraggingUi
            ? `left ${MORPH_MS}ms cubic-bezier(0.22, 1, 0.36, 1), top ${MORPH_MS}ms cubic-bezier(0.22, 1, 0.36, 1), width ${MORPH_MS}ms cubic-bezier(0.22, 1, 0.36, 1), height ${MORPH_MS}ms cubic-bezier(0.22, 1, 0.36, 1), border-radius ${MORPH_MS}ms ease`
            : isDraggingUi
              ? undefined
              : orbMode && !morphTransition
                ? "none"
                : !orbMode
                  ? "top 380ms cubic-bezier(0.22, 1, 0.36, 1), left 380ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : undefined,
        opacity: wantsMorphClose && !contentOpaque ? 0.92 : 1,
      }}
      role="dialog"
      aria-label="Предпросмотр персонализации"
    >
      {windowOpen ? (
        <>
          <div
            className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 active:cursor-grabbing"
            onMouseDown={onMoveStart}
          >
            <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-800">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-base shadow-sm ring-1 ring-slate-200/80"
                style={{
                  transform: showEyeHeader ? "scale(1)" : "scale(0.85)",
                  transition: morphTransition ? `transform ${MORPH_MS}ms cubic-bezier(0.34, 1.2, 0.64, 1)` : undefined,
                }}
                aria-hidden
              >
                👁
              </span>
              <span className="truncate">{showEyeHeader ? "Предпросмотр" : "Предпросмотр настроек"}</span>
            </span>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/80"
              onClick={() => {
                cancelDraft();
                requestMorphClose();
              }}
            >
              Закрыть
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:flex-row"
            style={{
              opacity: contentOpaque ? 1 : 0,
              transition: `opacity ${Math.round(MORPH_MS * 0.45)}ms ease-out`,
              pointerEvents: contentOpaque ? "auto" : "none",
            }}
          >
            <PrefsSandbox
              prefs={baseline}
              title="Текущее оформление"
              subtitle="Так интерфейс выглядит сейчас. Эти настройки не меняются, пока вы не сохраните новые."
            />
            <PersonalizationDraftSample
              draft={draft}
              baseline={baseline}
              phase={phase}
              demoNonce={demoNonce}
              focusField={previewFocusField}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-base shadow-sm ring-1 ring-slate-200/80">
            👁
          </span>
        </div>
      )}
      {showActions && isDirty ? (
        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50/90 px-3 py-3 sm:flex-row sm:items-end sm:justify-end">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                title="Применить новые настройки ко всему интерфейсу."
                onClick={() => void saveDraft().then((ok) => ok && requestMorphClose())}
              >
                Сохранить
              </button>
              <span className="text-center text-[10px] text-slate-500 sm:text-left">
                Применить новые настройки ко всему интерфейсу.
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                title="Вернуться к текущему оформлению без изменений."
                onClick={() => {
                  cancelDraft();
                  requestMorphClose();
                }}
              >
                Отменить
              </button>
              <span className="text-center text-[10px] text-slate-500 sm:text-left">
                Вернуться к текущему оформлению без изменений.
              </span>
            </div>
          </div>
        </div>
      ) : null}
      {windowOpen ? (
        <button
          type="button"
          aria-label="Изменить размер"
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border border-slate-300 bg-slate-100 hover:bg-slate-200"
          onMouseDown={onResizeStart}
        />
      ) : null}
    </div>
  );
}
