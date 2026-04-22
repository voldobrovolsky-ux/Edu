import { useState } from "react";
import { CommunitoriaCommunitiesPanel } from "./CommunitoriaCommunitiesPanel";
import { CommunitoriaToolGrid } from "./CommunitoriaToolGrid";
import { useCommunitoriaHub } from "./CommunitoriaHubContext";

export function CommunitoriaToolPanel() {
  const { open } = useCommunitoriaHub();
  const [communitiesOpen, setCommunitiesOpen] = useState(false);

  return (
    <div className="ed-panel flex h-full min-h-0 flex-col gap-4 border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Инструменты</h2>
        <p className="text-xs text-slate-500">Communitoria</p>
      </div>
      <button
        type="button"
        onClick={() => open("newChat")}
        className="flex w-full max-w-[220px] items-center justify-center gap-2 self-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:border-sky-300 hover:bg-sky-50/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
        title="Новый чат"
      >
        <span className="text-base leading-none" aria-hidden>
          💬
        </span>
        <span>Новый чат</span>
      </button>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start">
        <CommunitoriaToolGrid
          onCreateGroup={() => open("createGroup")}
          onOpenCommunities={() => setCommunitiesOpen(true)}
          onCreateConference={() => open("createConference")}
          onOpenAssistant={() => open("assistant")}
        />
      </div>
      <CommunitoriaCommunitiesPanel
        open={communitiesOpen}
        onClose={() => setCommunitiesOpen(false)}
        onSelectCommunity={(id) => {
          setCommunitiesOpen(false);
          window.dispatchEvent(new CustomEvent("edumed:communitoria-open-community", { detail: { communityId: id } }));
        }}
        onCreateCommunity={() => {
          setCommunitiesOpen(false);
          open("createCommunity");
        }}
      />
    </div>
  );
}
