"use client";

import { useEffect } from "react";

/**
 * Route-level error UI for the payroll module (embedded under EDUMED).
 * Logs digest to console so the root cause can be fixed, not masked.
 */
export default function PayrollError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[payroll]", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft/80 px-4 py-5 text-sm text-foreground">
      <p className="font-semibold text-danger">Ошибка модуля бухгалтерии</p>
      <p className="mt-2 text-muted-foreground">{error.message}</p>
      {error.digest ? <p className="mt-1 font-mono text-xs text-subtle-foreground">digest: {error.digest}</p> : null}
      <button type="button" className="edu-btn-secondary mt-4" onClick={() => reset()}>
        Повторить
      </button>
    </div>
  );
}
