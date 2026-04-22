import { FlöriumProvider } from "@edumed/florium";
import { useAuth } from "../state/auth";
import { SmartFloriumLayout } from "./SmartFloriumLayout";
import { toFlorusSession } from "./toFlorusSession";

/**
 * Host bridge: `FlorusSession` from `useAuth().user`; module data from `SmartFloriumLayout` + hooks
 * under `florium/data`. Package `@edumed/florium` stays UI-only.
 */
export function FloriumShell() {
  const { user } = useAuth();
  if (!user) {
    return null;
  }
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden text-slate-800">
      <FlöriumProvider florusSession={toFlorusSession(user)}>
        <SmartFloriumLayout className="h-full min-h-0 flex-1" />
      </FlöriumProvider>
    </div>
  );
}
