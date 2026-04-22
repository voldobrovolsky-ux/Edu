import { useCallback, useEffect, useMemo, useState } from "react";
import { dedusEntryForTarget } from "../lib/dedusKnowledgeBase";
import { ED_Z_DEDUS_ASSISTANT, ED_Z_DEDUS_SPIRIT } from "../lib/zLayers";
import { useDedus } from "../state/dedusContext";

const PANEL_W = 288;

export function DedusEyeBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-slate-200/80 " +
        className
      }
      aria-hidden
    >
      👁
    </span>
  );
}

function DedusSpiritLayer({
  ex,
  ey,
}: {
  ex: number;
  ey: number;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: ED_Z_DEDUS_SPIRIT }}
      aria-hidden
    >
      <div
        className="absolute flex items-center justify-center opacity-[0.82]"
        style={{
          left: ex - 18,
          top: ey - 18,
          width: 36,
          height: 36,
        }}
      >
        <DedusEyeBadge className="shadow-[0_2px_12px_rgba(15,23,42,0.12)]" />
      </div>
    </div>
  );
}

export function DedusAssistantOverlay() {
  const dedus = useDedus();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pickedFaq, setPickedFaq] = useState<Array<{ question: string; answer: string }>>([]);
  const [voiceDraft, setVoiceDraft] = useState("");

  const entry = useMemo(() => dedusEntryForTarget(dedus.pinnedTargetId), [dedus.pinnedTargetId]);

  const ex = dedus.eyeViewport?.x ?? 0;
  const ey = dedus.eyeViewport?.y ?? 0;

  useEffect(() => {
    if (!dedus.active) setOpenFaq(null);
  }, [dedus.active, dedus.pinnedTargetId]);

  useEffect(() => {
    if (!dedus.active || !dedus.pinnedTargetId || !entry) {
      setPickedFaq([]);
      setOpenFaq(null);
      return;
    }
    const pool = entry.faq ?? [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setPickedFaq(shuffled.slice(0, 4));
    setOpenFaq(null);
  }, [dedus.active, dedus.pinnedTargetId, entry]);

  useEffect(() => {
    if (dedus.mode === "voice") setVoiceDraft("");
  }, [dedus.mode]);

  const onSubmitVoice = useCallback(() => {
    dedus.finishVoiceQuestion(voiceDraft);
  }, [dedus, voiceDraft]);

  if (!dedus.eyeViewport) return null;

  const panelLeft = Math.max(12, Math.min(ex + 40, typeof window !== "undefined" ? window.innerWidth - PANEL_W - 12 : ex + 40));
  const panelTop = Math.max(12, ey - 28);

  const showFaqBlock = dedus.active && dedus.pinnedTargetId && entry;
  const showPinnedStub = dedus.active && dedus.pinnedTargetId && !entry;
  const micReady = dedus.active && dedus.mode === "explaining" && dedus.pinnedTargetId;
  const showRoamingHint = dedus.active && !dedus.pinnedTargetId && dedus.mode === "awaitingAction";

  return (
    <>
      {!dedus.active ? <DedusSpiritLayer ex={ex} ey={ey} /> : null}

      {dedus.active ? (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: ED_Z_DEDUS_ASSISTANT }}
          aria-live="polite"
        >
          <div className="pointer-events-none absolute inset-0 bg-slate-900/48" />

          <div
            className="pointer-events-none absolute flex items-center justify-center"
            style={{
              left: ex - 18,
              top: ey - 18,
              width: 36,
              height: 36,
              transition: "left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div style={{ animation: "ed-dedus-eye-help 380ms cubic-bezier(0.22, 1, 0.36, 1) both" }}>
              <DedusEyeBadge />
            </div>
          </div>

          <div
            className="pointer-events-auto absolute flex max-h-[min(72vh,560px)] w-[288px] flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)]"
            style={{ left: panelLeft, top: panelTop }}
            role="dialog"
            aria-label="Помощник Дедус"
            data-dedus-help-overlay-root
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <div className="min-w-0 text-sm font-semibold text-slate-900">Спросить Дедуса</div>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={() => dedus.closeAssistant()}
              >
                Закрыть
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
              {dedus.mode === "voice" ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-sky-800">Слушаю…</p>
                  <p className="text-[11px] text-slate-500">Распознавание речи пока не подключено — введите вопрос ниже.</p>
                  <textarea
                    value={voiceDraft}
                    onChange={(e) => setVoiceDraft(e.target.value)}
                    placeholder="Напишите вопрос…"
                    rows={3}
                    className="ed-input w-full resize-y px-2 py-2 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        onSubmitVoice();
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="ed-btn ed-btn-primary ed-interactive px-3 py-1.5 text-xs" onClick={onSubmitVoice}>
                      Отправить
                    </button>
                    <button
                      type="button"
                      className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs"
                      onClick={() => dedus.finishVoiceQuestion("")}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      className={[
                        "flex h-14 w-14 items-center justify-center rounded-full border-2 border-sky-200 bg-gradient-to-b from-sky-50 to-white text-2xl text-sky-800 shadow-md",
                        micReady ? "animate-[ed-dedus-mic-pulse_1.6s_ease-in-out_infinite] ring-4 ring-sky-200/70" : "opacity-60",
                      ].join(" ")}
                      title="Голосовой вопрос"
                      aria-label="Голосовой вопрос"
                      disabled={!dedus.pinnedTargetId}
                      onClick={() => dedus.startVoiceQuestion()}
                    >
                      🎤
                    </button>
                    <p className="text-center text-[11px] leading-snug text-slate-500">
                      {dedus.pinnedTargetId
                        ? "Микрофон активен для этого блока. Можно сменить блок — кликните по другому подсвеченному элементу."
                        : "Наведите курсор на блок — Дедус подлетит. Клик по блоку закрепляет справку и FAQ."}
                    </p>
                  </div>

                  {dedus.voiceReplyStub ? (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-2 py-2 text-xs text-sky-950">
                      {dedus.voiceReplyStub}
                      {dedus.lastQuestion ? (
                        <div className="mt-1 text-[10px] text-sky-900/80">Ваш вопрос: {dedus.lastQuestion}</div>
                      ) : null}
                    </div>
                  ) : null}

                  {showFaqBlock ? (
                    <div className="space-y-2 border-t border-slate-100 pt-2">
                      <div className="text-xs font-semibold text-slate-800">{entry!.title}</div>
                      <p className="text-[11px] leading-snug text-slate-600">{entry!.description}</p>
                      {pickedFaq.length > 0 ? (
                        <ul className="space-y-1">
                          {pickedFaq.map((item, i) => (
                            <li key={i} className="rounded-lg border border-slate-100 bg-slate-50/80">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] font-medium text-slate-800"
                                onClick={() => setOpenFaq((v) => (v === i ? null : i))}
                              >
                                <span className="min-w-0">{item.question}</span>
                                <span className="shrink-0 text-slate-400">{openFaq === i ? "▾" : "▸"}</span>
                              </button>
                              {openFaq === i ? (
                                <div className="border-t border-slate-100 px-2 py-1.5 text-[11px] leading-snug text-slate-600">
                                  {item.answer}
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : showPinnedStub ? (
                    <p className="text-[11px] leading-snug text-slate-500">
                      Для «{dedus.pinnedTargetId}» пока нет статьи в базе подсказок.
                    </p>
                  ) : showRoamingHint ? (
                    <p className="text-[11px] leading-snug text-slate-500">
                      Белым светятся все подсказочные блоки. Наведите курсор — Дедус подлетит; клик закрепит рассказ и вопросы ниже.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <style>{`
            @keyframes ed-dedus-eye-help {
              from { opacity: 0.5; transform: scale(0.75) rotate(-8deg); }
              to { opacity: 1; transform: scale(1) rotate(0deg); }
            }
            @keyframes ed-dedus-mic-pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.08); }
            }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
