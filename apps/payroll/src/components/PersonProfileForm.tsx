"use client";

import { updatePerson } from "@/app/actions/person-actions";
import { useState } from "react";

type Props = {
  personId: string;
  children: React.ReactNode;
};

export function PersonProfileForm({ personId, children }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <>
      <form
        className="space-y-3"
        action={async (formData) => {
          const r = await updatePerson(personId, formData);
          if (r.ok && r.orderDraft) setDraft(r.orderDraft);
        }}
      >
        {children}
        <div className="flex flex-wrap gap-2 pt-2">
          <button type="submit" className="edu-btn-primary">
            Сохранить изменения
          </button>
        </div>
      </form>

      {draft && (
        <dialog open className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="edu-card max-h-[85vh] w-full max-w-2xl overflow-auto p-6">
            <h3 className="text-lg font-semibold text-foreground">Изменение коэффициента (черновик)</h3>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-elevated p-4 text-sm text-foreground">{draft}</pre>
            <button type="button" className="edu-btn-secondary mt-4" onClick={() => setDraft(null)}>
              Закрыть
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
