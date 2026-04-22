import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { communitoriaColorClassForKey, communitoriaInitials } from "./communitoriaGroupVisuals";
import { CommunitoriaMemberPicker, type PickerUserRow } from "./CommunitoriaMemberPicker";
import { DROPDOWN_OFFSET, VIEWPORT_GUTTER, scrollDownToFullyReveal } from "./popoverViewport";

const PRESET_AVATARS: Array<{ emoji: string; label: string }> = [
  { emoji: "💬", label: "Чат" },
  { emoji: "👥", label: "Команда" },
  { emoji: "📚", label: "Учёба" },
  { emoji: "🎓", label: "Класс" },
  { emoji: "🛡️", label: "Безопасность" },
  { emoji: "🌿", label: "Клуб" },
];

type Step = 1 | 2 | 3 | "restrict";

export function CreateGroupWizard({ onClose }: { onClose: () => void }) {
  const { accessToken: token, user: me } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [avatarEmoji, setAvatarEmoji] = useState("💬");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);
  const avatarPopoverRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userById, setUserById] = useState<Record<string, PickerUserRow>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<PickerUserRow[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const titleTrim = title.trim();
  const titleValid = titleTrim.length > 0;

  const onToggleUser = useCallback((userId: string, row: PickerUserRow) => {
    setUserById((m) => ({ ...m, [userId]: row }));
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const allowedIds = useMemo(() => {
    const out: string[] = [];
    for (const id of selected) {
      const u = userById[id];
      if (u && u.allowDirectGroupAdd !== false) out.push(id);
    }
    return out;
  }, [selected, userById]);

  const blockedFromSelection = useMemo(() => {
    const out: PickerUserRow[] = [];
    for (const id of selected) {
      const u = userById[id];
      if (u && u.allowDirectGroupAdd === false) out.push(u);
    }
    return out;
  }, [selected, userById]);

  const goCreate = useCallback(async () => {
    if (!token || !titleValid) return;
    setSubmitErr(null);
    setSubmitting(true);
    try {
      const r = await api.chats.createGroup(token, {
        title: titleTrim,
        description: null,
        avatarEmoji,
        avatarImageUrl: null,
        memberUserIds: allowedIds,
      });
      const gid = String((r.group as { id?: string }).id ?? "");
      if (!gid) throw new Error("GROUP_ID_MISSING");
      window.dispatchEvent(
        new CustomEvent("edumed:communitoria-open-group", {
          detail: { groupId: gid, title: titleTrim },
        }),
      );
      if (blockedFromSelection.length > 0) {
        setBlockedUsers(blockedFromSelection);
        try {
          const inv = await api.chats.groupInvite(token, gid);
          setInviteUrl(inv.url ?? "");
        } catch {
          setInviteUrl(`${window.location.origin}/section/chats/join/…`);
        }
        setStep("restrict");
        return;
      }
      onClose();
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Не удалось создать группу");
    } finally {
      setSubmitting(false);
    }
  }, [token, titleValid, titleTrim, avatarEmoji, allowedIds, blockedFromSelection, onClose]);

  const finishRestrict = useCallback(() => {
    onClose();
  }, [onClose]);

  const copyInvite = useCallback(() => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).catch(() => window.alert(inviteUrl));
  }, [inviteUrl]);

  const excludeIds = useMemo(() => (me?.id ? [me.id] : []), [me?.id]);

  useLayoutEffect(() => {
    if (!avatarOpen) return;
    const id = requestAnimationFrame(() => {
      const rect = avatarPopoverRef.current?.getBoundingClientRect();
      if (!rect) return;
      scrollDownToFullyReveal(rect, avatarBtnRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [avatarOpen]);

  return (
    <div className="flex min-h-[320px] flex-col gap-4">
      {step === 1 ? (
        <>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-medium text-slate-600">
                Имя группы
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например, Проект Альфа"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/20 focus:border-sky-400 focus:ring-2"
                />
              </label>
              <p className="mt-1.5 text-xs text-slate-500">Название увидят все участники группы.</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Аватар</span>
              <button
                ref={avatarBtnRef}
                type="button"
                onClick={() => setAvatarOpen((v) => !v)}
                className={[
                  "flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white shadow-md ring-2 ring-white transition-transform hover:scale-[1.02]",
                  communitoriaColorClassForKey(titleTrim || "group"),
                ].join(" ")}
                aria-haspopup="dialog"
                aria-expanded={avatarOpen}
              >
                {avatarEmoji || communitoriaInitials(titleTrim || "G")}
              </button>
            </div>
          </div>
          {avatarOpen
            ? createPortal(
                <div className="fixed inset-0 z-[10060] pointer-events-none" role="presentation" aria-hidden>
                  <div
                    ref={avatarPopoverRef}
                    className="pointer-events-auto absolute z-[10061] w-[min(92vw,280px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                    style={{
                      top: avatarBtnRef.current
                        ? avatarBtnRef.current.getBoundingClientRect().bottom + DROPDOWN_OFFSET
                        : 120,
                      left: avatarBtnRef.current
                        ? Math.min(
                            Math.max(VIEWPORT_GUTTER, avatarBtnRef.current.getBoundingClientRect().left),
                            window.innerWidth - 300 - VIEWPORT_GUTTER,
                          )
                        : 24,
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-600">Предустановки</span>
                      <button
                        type="button"
                        className="rounded px-1.5 text-sm text-slate-500 hover:bg-slate-100"
                        onClick={() => setAvatarOpen(false)}
                        aria-label="Закрыть"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESET_AVATARS.map((p) => (
                        <button
                          key={p.emoji}
                          type="button"
                          title={p.label}
                          onClick={() => {
                            setAvatarEmoji(p.emoji);
                            setAvatarOpen(false);
                          }}
                          className={[
                            "flex h-12 items-center justify-center rounded-xl border text-xl transition-colors",
                            avatarEmoji === p.emoji
                              ? "border-sky-500 bg-sky-50"
                              : "border-slate-100 bg-slate-50 hover:bg-slate-100",
                          ].join(" ")}
                        >
                          {p.emoji}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 rounded-lg bg-slate-50 px-2 py-2 text-center text-[11px] text-slate-500">
                      Загрузка файла появится позже.
                    </p>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </>
      ) : null}

      {step === 2 ? (
        <CommunitoriaMemberPicker
          selectedIds={selected}
          onToggle={onToggleUser}
          excludeUserIds={excludeIds}
        />
      ) : null}

      {step === 3 ? (
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-medium">Группа:</span> {titleTrim}
          </p>
          <p>
            <span className="font-medium">Участников (включая вас):</span> {selected.size + 1}
          </p>
          <p className="text-xs text-slate-500">
            После создания откроется чат группы. Пользователи с запретом на прямое добавление получат приглашение по ссылке (если
            такие есть).
          </p>
          {submitErr ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{submitErr}</p>
          ) : null}
        </div>
      ) : null}

      {step === "restrict" ? (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Некоторые пользователи запретили добавлять себя в группы. Вы можете отправить им пригласительную ссылку.
          </p>
          <ul className="list-inside list-disc text-slate-600">
            {blockedUsers.map((u) => (
              <li key={u.id}>{u.fio}</li>
            ))}
          </ul>
          <button
            type="button"
            className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm"
            onClick={copyInvite}
          >
            Скопировать ссылку приглашения
          </button>
          <button
            type="button"
            className="ml-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => window.alert("Скоро: отправка ссылки в личный чат.")}
          >
            Отправить ссылку в чат…
          </button>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {step === 1 ? (
          <>
            <button
              type="button"
              disabled={!titleValid}
              onClick={() => setStep(2)}
              className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Далее
            </button>
            <button type="button" onClick={onClose} className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm">
              Отмена
            </button>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm"
            >
              Назад
            </button>
            <button type="button" onClick={() => setStep(3)} className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm">
              Далее
            </button>
            <button type="button" onClick={onClose} className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm">
              Отмена
            </button>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm"
            >
              Назад
            </button>
            <button
              type="button"
              disabled={submitting || !titleValid}
              onClick={() => void goCreate()}
              className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Создание…" : "Создать группу"}
            </button>
            <button type="button" onClick={onClose} className="ed-btn ed-btn-secondary ed-interactive rounded-xl px-4 py-2 text-sm">
              Отмена
            </button>
          </>
        ) : null}
        {step === "restrict" ? (
          <button type="button" onClick={finishRestrict} className="ed-btn ed-btn-primary ed-interactive rounded-xl px-4 py-2 text-sm">
            Готово
          </button>
        ) : null}
      </div>
    </div>
  );
}
