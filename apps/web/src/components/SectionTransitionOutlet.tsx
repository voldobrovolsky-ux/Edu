import { useLocation, useOutlet } from "react-router-dom";
import { UiTransitionSwap } from "./UiTransitionSwap";

export function SectionTransitionOutlet() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  if (!outlet) return null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <UiTransitionSwap transitionKey={pathname}>{outlet}</UiTransitionSwap>
    </div>
  );
}
