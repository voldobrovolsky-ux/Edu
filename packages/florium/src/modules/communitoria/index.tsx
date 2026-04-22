import { useFlorium } from "../../core/FlöriumProvider";

const MOCK_CHATS = [
  "Focus room — low-noise, long-form discussions",
  "Quick sync — short status updates and decisions",
  "Devices lane — handoff between phone, desktop, and wearables",
] as const;

export function CommunitoriaPlaceholder() {
  const { user } = useFlorium();

  return (
    <section className="ed-panel p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="ed-h2 mb-2">Communitoria</h2>
        <p className="ed-caption text-slate-600">
          Real-time messaging hub for deep, device-aware conversations.
        </p>
      </div>

      <p className="text-sm text-slate-600">
        This view shows a mock conversation list. Actual chats will be loaded from the host
        application and linked to your user ID.
      </p>

      <p className="text-sm font-medium text-slate-800">
        Current user: {user.username} (ID: {user.id})
      </p>

      <ul className="space-y-2 border border-slate-200 rounded-[var(--ed-radius-lg)] divide-y divide-slate-200 overflow-hidden bg-[var(--ed-surface)]">
        {MOCK_CHATS.map((title) => (
          <li
            key={title}
            className="px-4 py-3 text-sm text-slate-700 hover:bg-[var(--ed-surface-muted)] transition-colors"
          >
            {title}
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-500">
        TODO: Replace this mock list with real conversations resolved by user ID from the host.
      </p>
    </section>
  );
}
