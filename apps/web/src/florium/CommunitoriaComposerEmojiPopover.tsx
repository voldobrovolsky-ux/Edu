import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DROPDOWN_OFFSET, VIEWPORT_GUTTER, scrollDownToFullyReveal } from "./popoverViewport";

type TabId = "emoji" | "stickers" | "gif";

export function CommunitoriaComposerEmojiPopover({
  open,
  anchorRef,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>("emoji");
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const place = () => {
      const r = anchor.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - VIEWPORT_GUTTER * 2);
      const left = Math.min(
        Math.max(VIEWPORT_GUTTER, r.left),
        window.innerWidth - width - VIEWPORT_GUTTER,
      );
      const top = r.bottom + DROPDOWN_OFFSET;
      setStyle({
        position: "fixed",
        left,
        top,
        width,
        zIndex: 10060,
      });
    };

    let frameId = requestAnimationFrame(() => requestAnimationFrame(place));
    const onViewportChange = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(place);
    };

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, { passive: true });

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange);
    };
  }, [open, anchorRef, tab]);

  useLayoutEffect(() => {
    if (!open) return;

    let frameId = requestAnimationFrame(() => {
      const rect = popRef.current?.getBoundingClientRect();
      if (!rect) return;
      scrollDownToFullyReveal(rect, anchorRef.current);
    });

    return () => cancelAnimationFrame(frameId);
  }, [open, style.top, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPtr = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPtr);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPtr);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const tabBtn = (id: TabId, label: string, icon: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={[
        "flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
        tab === id ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200" : "text-slate-600 hover:bg-slate-50",
      ].join(" ")}
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return createPortal(
    <div
      ref={popRef}
      className="communitoria-emoji-popover-mount max-h-[min(50vh,280px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex gap-1 border-b border-slate-100 p-1.5" role="tablist">
        {tabBtn("emoji", "Эмодзи", "😊")}
        {tabBtn("stickers", "Стикеры", "🎨")}
        {tabBtn("gif", "GIF", "🎬")}
      </div>
      <div className="min-h-[120px] overflow-y-auto p-4 text-center text-sm text-slate-500" role="tabpanel">
        {tab === "emoji" ? <p>Эмодзи — скоро здесь будет сетка символов.</p> : null}
        {tab === "stickers" ? <p>Стикеры — заглушка.</p> : null}
        {tab === "gif" ? <p>GIF — заглушка.</p> : null}
      </div>
    </div>,
    document.body,
  );
}
