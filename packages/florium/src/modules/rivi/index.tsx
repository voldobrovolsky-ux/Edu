// TODO: Connect Rivi to real workspace, calendar, and presence data owned by the host application.

import { useFlorium } from "../../core/FlöriumProvider";

const MOCK_SCENES = [
  "Deep focus — no-notification lane for long stretches of work",
  "Planning board — timelines, milestones, and backlog in one place",
  "Team presence — who is online, in a call, or in a focus block",
] as const;

export function RiviPlaceholder() {
  const { user } = useFlorium();

  return (
    <section className="ed-panel p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="ed-h2 mb-2">Rivi</h2>
        <p className="ed-caption text-slate-600">
          Configurable work scenes for focus, planning, and team presence.
        </p>
      </div>

      <p className="text-sm text-slate-700">
        Scenes below will be tailored to {user.username} (ID: {user.id}) once workspace data is
        connected.
      </p>

      <ul className="space-y-2 border border-slate-200 rounded-[var(--ed-radius-lg)] divide-y divide-slate-200 overflow-hidden bg-[var(--ed-surface)]">
        {MOCK_SCENES.map((line) => (
          <li
            key={line}
            className="px-4 py-3 text-sm text-slate-700 hover:bg-[var(--ed-surface-muted)] transition-colors"
          >
            {line}
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-600">
        All scenes are currently mock descriptors. Real layouts and data will come from the host&apos;s
        workspace and scheduling systems.
      </p>
    </section>
  );
}
