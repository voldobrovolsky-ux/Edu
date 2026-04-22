import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useUiPreferences, sectionTransitionMs } from "../state/uiPreferences";

/**
 * Cross-fades or slides between `children` when `transitionKey` changes.
 * Keeps the previous subtree mounted until the exit animation window ends.
 */
export function UiTransitionSwap({
  transitionKey,
  children,
}: {
  transitionKey: string;
  children: ReactNode;
}) {
  const prefs = useUiPreferences();
  const duration = sectionTransitionMs(prefs);
  const instant = prefs.sectionTransition === "instant" || duration === 0;
  const isPersonalizationRoute = (key: string) => key === "/settings/personalization";

  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  const [, bump] = useState(0);
  const snapRef = useRef<{ key: string; node: ReactNode }>({ key: transitionKey, node: children });
  const timeoutRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const s = snapRef.current;

    if (transitionKey === s.key) {
      if (s.node !== children) {
        snapRef.current = { key: s.key, node: children };
        bump((x) => x + 1);
      }
      return;
    }

    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (instant || isPersonalizationRoute(s.key) || isPersonalizationRoute(transitionKey)) {
      snapRef.current = { key: transitionKey, node: children };
      setLeaving(null);
      bump((x) => x + 1);
      return;
    }

    setLeaving({ key: s.key, node: s.node });
    snapRef.current = { key: transitionKey, node: children };
    bump((x) => x + 1);

    timeoutRef.current = window.setTimeout(() => {
      setLeaving(null);
      timeoutRef.current = null;
      bump((x) => x + 1);
    }, duration);

    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [transitionKey, children, duration, instant]);

  const mode = prefs.sectionTransition === "slide_fade" ? "slide" : "fade";
  const displayed = snapRef.current;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {leaving ? (
        <div
          className={[
            "absolute inset-0 z-[1] min-h-0 min-w-0 overflow-auto",
            mode === "slide" ? "ed-route-exit-slide" : "ed-route-exit-fade",
          ].join(" ")}
          aria-hidden
        >
          {leaving.node}
        </div>
      ) : null}
      <div
        className={[
          "relative z-[2] flex h-full min-h-0 min-w-0 flex-1 flex-col",
          leaving ? (mode === "slide" ? "ed-route-enter-slide" : "ed-route-enter-fade") : "",
          leaving && prefs.blockEnter === "fade_shift" ? "ed-route-enter-block-shift" : "",
          leaving && prefs.blockEnter === "none" ? "ed-route-enter-none" : "",
        ].join(" ")}
      >
        {displayed.node}
      </div>
    </div>
  );
}
