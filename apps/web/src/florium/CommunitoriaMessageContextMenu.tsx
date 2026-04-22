import { useEffect, useRef } from "react";
import { VIEWPORT_GUTTER, scrollDownToFullyReveal } from "./popoverViewport";

export type ContextMenuItem = {
  id: string;
  icon: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function CommunitoriaMessageContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const t = e.target;
      if (t instanceof Node && el.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - VIEWPORT_GUTTER) {
      left = window.innerWidth - rect.width - VIEWPORT_GUTTER;
    }
    if (left < VIEWPORT_GUTTER) left = VIEWPORT_GUTTER;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    requestAnimationFrame(() => {
      const nextRect = el.getBoundingClientRect();
      scrollDownToFullyReveal(nextRect, document.elementFromPoint(x, y) as HTMLElement | null);
    });
  }, [x, y, items]);

  return (
    <div
      ref={rootRef}
      className="fixed z-[320] min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
      style={{ left: x, top: y }}
      role="menu"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            if (it.disabled) return;
            it.onSelect();
            onClose();
          }}
          className={[
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
            it.disabled
              ? "cursor-not-allowed text-slate-400"
              : it.danger
                ? "text-rose-700 hover:bg-rose-50"
                : "text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          <span className="w-5 shrink-0 text-center text-base" aria-hidden>
            {it.icon}
          </span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** TODO(backend): подтвердить формат deep-link на сообщение в группе/канале. */
export function buildCommunitoriaMessageLink(groupId: string, messageId: string): string {
  const u = new URL(window.location.href);
  u.searchParams.set("g", groupId);
  u.searchParams.set("m", messageId);
  return u.toString();
}
