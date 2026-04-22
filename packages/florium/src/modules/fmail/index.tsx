import { useFlorium } from "../../core/FlöriumProvider";

// TODO: Wire Fmail to real confirmation and notification endpoints exposed by the host backend.

const MOCK_MESSAGES = [
  "Vault access confirmation — pending",
  "Device pairing approval — completed",
  "Private document drop — unread",
] as const;

export function FmailPlaceholder() {
  const { user } = useFlorium();
  const address = `${user.username}@fmail.com`;

  return (
    <section className="ed-panel p-6 max-w-2xl space-y-5">
      <div>
        <h2 className="ed-h2 mb-2">Fmail</h2>
        <p className="ed-caption text-slate-600">
          Lightweight, high-assurance mail channel for confirmations and private drops.
        </p>
      </div>

      <div className="rounded-[var(--ed-radius-md)] border border-slate-200 bg-[var(--ed-surface-muted)] px-4 py-3 space-y-1">
        <p className="ed-caption text-slate-600">Primary address</p>
        <p className="font-mono text-sm font-medium text-slate-900">{address}</p>
        <p className="text-xs text-slate-600 pt-2">
          This address is reserved for high-trust flows inside the Flör Group ecosystem.
        </p>
      </div>

      <ul className="space-y-2 border border-slate-200 rounded-[var(--ed-radius-lg)] divide-y divide-slate-200 overflow-hidden bg-[var(--ed-surface)]">
        {MOCK_MESSAGES.map((line) => (
          <li
            key={line}
            className="px-4 py-3 text-sm text-slate-700 hover:bg-[var(--ed-surface-muted)] transition-colors"
          >
            {line}
          </li>
        ))}
      </ul>

      <p className="text-sm text-slate-600">
        These entries are placeholders. Actual messages and confirmations will be provided by the
        host via secure APIs.
      </p>
    </section>
  );
}
