import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";
import { DROPDOWN_OFFSET, VIEWPORT_GUTTER, scrollDownToFullyReveal } from "./popoverViewport";

const PRESET_AVATARS = ["🏛️", "🎓", "📚", "👨‍👩‍👧", "🔬", "🚀"];

type MetaType = "school" | "class" | "subject" | "project" | "other";

export function CommunitoriaCreateCommunityWizard({ onClose }: { onClose: () => void }) {
  const { accessToken: token } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("🏛️");
  const [metaType, setMetaType] = useState<MetaType>("other");
  const [description, setDescription] = useState("");
  const [linkedClassId, setLinkedClassId] = useState("");
  const [linkedSubjectId, setLinkedSubjectId] = useState("");
  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [myGroupIds, setMyGroupIds] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avOpen, setAvOpen] = useState(false);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);
  const avatarPopoverRef = useRef<HTMLDivElement>(null);

  const nameOk = name.trim().length > 0;

  useEffect(() => {
    if (!token || step !== 3) return;
    let c = false;
    void api.chats
      .inbox(token)
      .then((r) => {
        if (c) return;
        const rows = (r.items ?? [])
          .filter((it): it is Extract<(typeof r.items)[number], { kind: "group" }> => it.kind === "group")
          .map((it) => ({ id: it.groupId, title: it.title }));
        setMyGroupIds(rows);
      })
      .catch(() => {
        if (!c) setMyGroupIds([]);
      });
    return () => {
      c = true;
    };
  }, [token, step]);

  const toggleGroup = useCallback((id: string) => {
    setSelectedGroupIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!token || !nameOk) return;
    setErr(null);
    setSubmitting(true);
    try {
      const r = await api.chats.createCommunity(token, {
        name: name.trim(),
        description: description.trim() || null,
        avatarEmoji,
        metaType,
        existingGroupIds: [...selectedGroupIds],
        linkedClassId: linkedClassId.trim() || null,
        linkedSubjectId: linkedSubjectId.trim() || null,
        linkedProjectId: linkedProjectId.trim() || null,
      });
      const comm = r.community as { id?: string };
      const cid = String(comm.id ?? "");
      if (cid) {
        window.dispatchEvent(new CustomEvent("edumed:communitoria-open-community", { detail: { communityId: cid } }));
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать сообщество");
    } finally {
      setSubmitting(false);
    }
  }, [token, nameOk, name, description, avatarEmoji, metaType, selectedGroupIds, linkedClassId, linkedSubjectId, linkedProjectId, onClose]);

  useLayoutEffect(() => {
    if (!avOpen) return;
    const id = requestAnimationFrame(() => {
      const rect = avatarPopoverRef.current?.getBoundingClientRect();
      if (!rect) return;
      scrollDownToFullyReveal(rect, avatarBtnRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [avOpen]);

  return (
    <div className="flex min-h-[360px] flex-col gap-4">
      {step === 1 ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block text-xs font-medium text-slate-600">
              Название сообщества
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-2"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Тип
              <select
                value={metaType}
                onChange={(e) => setMetaType(e.target.value as MetaType)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="school">Школа</option>
                <option value="class">Класс</option>
                <option value="subject">Предмет</option>
                <option value="project">Проект</option>
                <option value="other">Другое</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium uppercase text-slate-500">Аватар</span>
            <button
              ref={avatarBtnRef}
              type="button"
              onClick={() => setAvOpen(true)}
              className={[
                "flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white shadow-md",
                communitoriaColorClassForKey(name.trim() || "c"),
              ].join(" ")}
            >
              {avatarEmoji || communitoriaInitials(name)}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3 text-sm">
          <label className="block text-xs font-medium text-slate-600">
            Описание
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs font-medium text-slate-500">Связи с EDUMED (заглушки — ID для будущей интеграции)</p>
          <input
            value={linkedClassId}
            onChange={(e) => setLinkedClassId(e.target.value)}
            placeholder="ID класса"
            className="w-full rounded-lg border px-2 py-1.5 text-sm"
          />
          <input
            value={linkedSubjectId}
            onChange={(e) => setLinkedSubjectId(e.target.value)}
            placeholder="ID предмета"
            className="w-full rounded-lg border px-2 py-1.5 text-sm"
          />
          <input
            value={linkedProjectId}
            onChange={(e) => setLinkedProjectId(e.target.value)}
            placeholder="ID проекта"
            className="w-full rounded-lg border px-2 py-1.5 text-sm"
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="min-h-0 flex-1">
          <p className="mb-2 text-xs text-slate-600">
            Будет создан анонс‑чат (только админы пишут). Отметьте существующие группы, чтобы сразу включить их в сообщество.
          </p>
          <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
            {myGroupIds.length === 0 ? (
              <li className="px-2 py-4 text-center text-sm text-slate-500">Нет доступных групп в inbox</li>
            ) : (
              myGroupIds.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <input type="checkbox" checked={selectedGroupIds.has(g.id)} onChange={() => toggleGroup(g.id)} />
                    <span className="text-sm">{g.title}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
          {err ? <p className="mt-2 text-sm text-rose-700">{err}</p> : null}
        </div>
      ) : null}

      {avOpen
        ? createPortal(
            <div className="fixed inset-0 z-[10060] pointer-events-none">
              <div
                ref={avatarPopoverRef}
                className="pointer-events-auto absolute z-[10061] w-[min(92vw,260px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                style={{
                  top: avatarBtnRef.current ? avatarBtnRef.current.getBoundingClientRect().bottom + DROPDOWN_OFFSET : 100,
                  left: avatarBtnRef.current
                    ? Math.min(
                        Math.max(VIEWPORT_GUTTER, avatarBtnRef.current.getBoundingClientRect().left),
                        window.innerWidth - 260 - VIEWPORT_GUTTER,
                      )
                    : 24,
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Иконка</span>
                  <button type="button" className="rounded px-1 text-slate-500 hover:bg-slate-100" onClick={() => setAvOpen(false)} aria-label="Закрыть">
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_AVATARS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="text-2xl hover:bg-slate-50"
                      onClick={() => {
                        setAvatarEmoji(e);
                        setAvOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {step > 1 ? (
          <button type="button" className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm" onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}>
            Назад
          </button>
        ) : null}
        {step < 3 ? (
          <button
            type="button"
            disabled={step === 1 && !nameOk}
            onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
            className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            Далее
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !nameOk}
            onClick={() => void submit()}
            className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? "Создание…" : "Создать сообщество"}
          </button>
        )}
        <button type="button" className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
