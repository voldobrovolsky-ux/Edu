import type { ReactNode } from "react";

/**
 * Квадратные «парящие» карточки инструментов Communitoria (сетка 2×2 / адаптив).
 */
/** Одинаковые transition / lift / тень для всех плиток; вариант только задаёт базовые цвета. */
const TILE =
  "flex h-[96px] w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[var(--ed-radius-md,16px)] border px-2 py-2 text-center shadow-[var(--ed-shadow-card,0_8px_24px_rgba(15,23,42,0.06))] transition-all duration-200 ease-out hover:-translate-y-[2px] hover:border-sky-400/85 hover:shadow-[0_20px_48px_rgba(15,23,42,0.17)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 active:translate-y-0 sm:h-[104px] sm:w-[104px]";

export function CommunitoriaToolTile({
  icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        TILE,
        variant === "accent"
          ? "border-sky-200/95 bg-sky-50/90 text-sky-950"
          : "border-slate-200/90 bg-white text-slate-800",
      ].join(" ")}
    >
      <span className="text-2xl leading-none sm:text-[26px]" aria-hidden>
        {icon}
      </span>
      <span className="line-clamp-2 text-[10px] font-medium leading-tight sm:text-[11px]">{label}</span>
    </button>
  );
}

export function CommunitoriaToolGrid({
  onCreateGroup,
  onOpenCommunities,
  onCreateConference,
  onOpenAssistant,
}: {
  onCreateGroup: () => void;
  onOpenCommunities: () => void;
  onCreateConference: () => void;
  onOpenAssistant: () => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 justify-items-center gap-3 sm:gap-3.5">
      <CommunitoriaToolTile icon="👥" label="Создать группу" onClick={onCreateGroup} />
      <CommunitoriaToolTile icon="🏛️" label="Сообщества" onClick={onOpenCommunities} />
      <CommunitoriaToolTile icon="📹" label="Создать конференцию" onClick={onCreateConference} />
      <CommunitoriaToolTile icon="✨" label="Ассистент" onClick={onOpenAssistant} variant="accent" />
    </div>
  );
}
