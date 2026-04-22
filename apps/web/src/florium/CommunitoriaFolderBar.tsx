import type { CommunitoriaFolderId } from "./communitoriaFolders";

const FOLDERS: { id: CommunitoriaFolderId; icon: string; label: string }[] = [
  { id: "all", icon: "📥", label: "Все" },
  { id: "classes", icon: "🎓", label: "Классы" },
  { id: "parents", icon: "👪", label: "Родители" },
  { id: "teams", icon: "🧑‍🤝‍🧑", label: "Команды" },
  { id: "channels", icon: "📣", label: "Каналы" },
];

export function CommunitoriaFolderBar({
  activeFolder,
  onFolderChange,
}: {
  activeFolder: CommunitoriaFolderId;
  onFolderChange: (id: CommunitoriaFolderId) => void;
}) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-1.5 py-1.5">
      <div className="flex flex-wrap items-stretch justify-center gap-1">
        {FOLDERS.map((f) => {
          const active = f.id === activeFolder;
          return (
            <button
              key={f.id}
              type="button"
              title={f.label}
              onClick={() => onFolderChange(f.id)}
              className={[
                "flex min-w-[2.75rem] flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[9px] font-medium leading-tight transition-colors sm:min-w-[3rem] sm:px-1.5 sm:py-1.5 sm:text-[10px]",
                active
                  ? "bg-sky-100 text-sky-900 ring-1 ring-sky-300/80"
                  : "text-slate-600 hover:bg-slate-100",
              ].join(" ")}
            >
              <span className="text-base leading-none sm:text-lg">{f.icon}</span>
              <span className="max-w-[4rem] truncate">{f.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          title="Новая папка"
          className="flex min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-1 py-1 text-[9px] font-medium text-slate-500 transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 sm:min-w-[3rem] sm:py-1.5 sm:text-[10px]"
          onClick={() => {
            window.alert("TODO: создать папку чатов (персонализация + backend).");
          }}
        >
          <span className="text-base leading-none sm:text-lg">+</span>
          <span className="max-w-[4rem] truncate">Новая</span>
        </button>
      </div>
    </div>
  );
}
