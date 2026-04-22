import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ClientUploadRoute, UploadSourceId, UploadTargetRef } from "../lib/documentUploadRoutesUi";
import { DocumentUploadRoutesMapPanel } from "./DocumentUploadRoutesMapPanel";
import { useAuth } from "../state/auth";

type Section = { id: string; name: string };
type Folder = { id: string; name: string; sectionId: string | null; parentFolderId: string | null };
const ROLE_LABELS: Record<string, string> = {
  teacher: "Учитель",
  head_teacher: "Завуч",
  director: "Директор",
  sysadmin: "Админ",
  student: "Ученик",
  parent: "Родитель",
};

export function DocumentUploadRoutesPanel({
  token,
  sections,
  folders,
  className,
}: {
  token: string;
  sections: Section[];
  folders: Folder[];
  className?: string;
}) {
  const auth = useAuth();
  const user = auth.user;
  const [baseRoutes, setBaseRoutes] = useState<ClientUploadRoute[]>([]);
  const [userRoutes, setUserRoutes] = useState<ClientUploadRoute[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fio: string; role: string }>>([]);
  const [selectedRole, setSelectedRole] = useState<string>(user?.primaryRole ?? "teacher");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [canEditBase, setCanEditBase] = useState(false);
  const [isAdminLike, setIsAdminLike] = useState(false);
  const [nestedPick, setNestedPick] = useState<null | { source: UploadSourceId; folderId: string }>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setErr] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.documentsUploadRoutes.get(token, { role: selectedRole, userId: selectedUserId || null });
      setBaseRoutes((r.baseRoutes ?? []) as ClientUploadRoute[]);
      setUserRoutes((r.userRoutes?.[0]?.routes ?? []) as ClientUploadRoute[]);
      setCanEditBase(Boolean(r.canEditBase));
      setIsAdminLike(Boolean(r.isAdminLike));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedRole, selectedUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void api.chatsUsers(token).then((r) => {
      setUsers((r.users ?? []).map((x) => ({ id: x.id, fio: x.fio, role: x.role })));
    });
  }, [token]);

  const editableRoutes = canEditBase ? baseRoutes : userRoutes;
  const readonlyRoutes = canEditBase ? userRoutes : baseRoutes;

  const routeBySource = useMemo(() => {
    const m = new Map<UploadSourceId, ClientUploadRoute>();
    for (const row of editableRoutes) m.set(row.source, row);
    return m;
  }, [editableRoutes]);

  const saveUser = async (next: ClientUploadRoute[]) => {
    setSaving(true);
    setErr(null);
    try {
      await api.documentsUploadRoutes.put(token, {
        scope: "user",
        role: selectedRole,
        userId: selectedUserId || null,
        routes: next,
      });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveBase = async (next: ClientUploadRoute[]) => {
    if (!canEditBase) return;
    setSaving(true);
    setErr(null);
    try {
      await api.documentsUploadRoutes.put(token, { scope: "base", routes: next });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const commitAddEdge = (source: UploadSourceId, target: UploadTargetRef) => {
    const cur = routeBySource.get(source) ?? { source, targets: [] };
    const key = JSON.stringify(target);
    if (cur.targets.some((x) => JSON.stringify(x) === key)) return;
    const others = editableRoutes.filter((r) => r.source !== source);
    if (canEditBase) void saveBase([...others, { ...cur, targets: [...cur.targets, target] }]);
    else void saveUser([...others, { ...cur, targets: [...cur.targets, target] }]);
  };

  const addEdge = (source: UploadSourceId, target: UploadTargetRef) => {
    if (target.type === "folder") {
      const hasChildren = folders.some((f) => f.parentFolderId === target.folderId);
      if (hasChildren) {
        setNestedPick({ source, folderId: target.folderId });
        return;
      }
    }
    commitAddEdge(source, target);
  };

  const removeEdge = (source: UploadSourceId, target: UploadTargetRef) => {
    const cur = routeBySource.get(source);
    if (!cur) return;
    const key = JSON.stringify(target);
    const nextTargets = cur.targets.filter((x) => JSON.stringify(x) !== key);
    const others = editableRoutes.filter((r) => r.source !== source);
    const next = nextTargets.length ? [...others, { ...cur, targets: nextTargets }] : others;
    if (canEditBase) void saveBase(next);
    else void saveUser(next);
  };

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">Загрузка маршрутов…</div>;
  }

  return (
    <section className={["ed-panel ed-panel-hover space-y-4 p-4", className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-2.5 py-2">
          <div className="text-[11px] font-medium text-slate-500">Роль</div>
          <select className="mt-1 w-full bg-transparent text-sm font-medium outline-none" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
            {["teacher", "head_teacher", "director", "sysadmin", "student", "parent"].map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
          <div className="text-[11px] font-medium text-slate-500">Пользователь</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
              {(users.find((u) => u.id === selectedUserId)?.fio ?? "∅").trim().charAt(0).toUpperCase() || "∅"}
            </span>
            <select className="w-full bg-transparent text-sm font-medium outline-none" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">— контекст роли —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fio}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            title="Легенда"
            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50"
            onClick={() => window.alert("Серые связи: базовые/админские (только просмотр)\nЗелёные: пользовательские (можно редактировать)")}
          >
            ℹ️
          </button>
          <button
            type="button"
            title="Очистить карту"
            disabled={saving || clearBusy}
            className="h-9 w-9 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700 disabled:opacity-50"
            onClick={async () => {
              const msg = isAdminLike
                ? "Очистить пользовательские маршруты для выбранного контекста? Базовые останутся."
                : "Очистить только ваши персональные маршруты для выбранного контекста?";
              if (!window.confirm(msg)) return;
              setClearBusy(true);
              try {
                await api.documentsUploadRoutes.clear(token, { role: selectedRole, userId: selectedUserId || null });
                await refresh();
              } finally {
                setClearBusy(false);
              }
            }}
          >
            🧹
          </button>
          <button
            type="button"
            title="Экспорт в PDF"
            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-sm hover:bg-slate-50"
            onClick={() => {
              const print = window.open("", "_blank", "noopener,noreferrer,width=1400,height=960");
              if (!print) return;
              const root = document.querySelector("[data-routes-map-root]") as HTMLElement | null;
              print.document.write(`
                <html><head><title>EDUMED Routes</title>
                <style>
                @page { size: A4 landscape; margin: 10mm; }
                body { font-family: Arial, sans-serif; margin:0; }
                .brand{font-size:11px;color:#667085;padding:8px 10px 0}
                .map{padding:8px 10px 10px}
                </style></head><body><div class="brand">EDUMED</div><div class="map">${root ? root.outerHTML : "<p>No map</p>"}</div></body></html>`);
              print.document.close();
              print.focus();
              print.print();
            }}
          >
            🧾
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Серые — базовые</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Зелёные — пользовательские</span>
      </div>
      <DocumentUploadRoutesMapPanel
        editableRoutes={editableRoutes}
        readonlyRoutes={readonlyRoutes}
        sections={sections}
        folders={folders}
        saving={saving}
        onAddEdge={addEdge}
        onRemoveEdge={removeEdge}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-50"
          onClick={() => void refresh()}
        >
          Обновить
        </button>
      </div>
      {nestedPick ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-slate-900">Папка содержит вложенные</div>
            <p className="mt-1 text-sm text-slate-600">Выберите действие для маршрута:</p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                className="w-full rounded border border-slate-200 px-3 py-2 text-left text-sm"
                onClick={() => {
                  commitAddEdge(nestedPick.source, { type: "folder", folderId: nestedPick.folderId });
                  setNestedPick(null);
                }}
              >
                Остаться в текущей папке
              </button>
              {(folders.filter((f) => f.parentFolderId === nestedPick.folderId)).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="w-full rounded border border-slate-200 px-3 py-2 text-left text-sm"
                  onClick={() => {
                    commitAddEdge(nestedPick.source, { type: "folder", folderId: f.id });
                    setNestedPick(null);
                  }}
                >
                  Перейти во вложенную: {f.name}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" className="rounded border border-slate-200 px-3 py-1.5 text-sm" onClick={() => setNestedPick(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
