import { useEffect, useState } from "react";
import { systemSounds } from "../audio/systemSounds";

/** Полная длительность заставки (мс): свечение на 3 с, затем fade, выход ровно к 5 с. */
const SPLASH_TOTAL_MS = 5000;
const GLOW_AT_MS = 3000;
/** Надпись EDUMED начинает гаснуть с этой отметки. */
const LETTERS_FADE_START_MS = 3200;
const LETTERS_FADE_DURATION_MS = 900;
const FADE_START_MS = 4200;
const FADE_DURATION_MS = 800;

const LETTERS = ["E", "D", "U", "M", "E", "D"] as const;

/** Смещение старта каждой буквы (сек); последняя заканчивает анимацию до 3 с. */
const STAGGER_S = [0, 0.06, 0.12, 0.18, 0.24, 0.3] as const;
const LETTER_ANIM_S = 2.55;

const SPLASH_STYLES = `
@keyframes edumed-splash-letter-odd {
  0% {
    transform: translateY(-130%) scale(1);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.22, 0.94, 0.36, 1);
  }
  6% {
    opacity: 1;
    animation-timing-function: cubic-bezier(0.22, 0.94, 0.36, 1);
  }
  82% {
    transform: translateY(0) scale(0.96);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.34, 1.45, 0.55, 1);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
@keyframes edumed-splash-letter-even {
  0% {
    transform: translateY(130%) scale(1);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.22, 0.94, 0.36, 1);
  }
  6% {
    opacity: 1;
    animation-timing-function: cubic-bezier(0.22, 0.94, 0.36, 1);
  }
  82% {
    transform: translateY(0) scale(0.96);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.34, 1.45, 0.55, 1);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
.edumed-splash-letter {
  display: inline-block;
  color: #64748b;
  will-change: transform, opacity;
  transition: color 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), text-shadow 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94),
    filter 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.edumed-splash-letter--lit {
  color: #020617;
  text-shadow:
    0 0 1px rgba(255, 255, 255, 0.95),
    0 0 12px rgba(167, 139, 250, 0.55),
    0 0 26px rgba(99, 102, 241, 0.4),
    0 0 42px rgba(59, 130, 246, 0.22);
  filter: drop-shadow(0 0 6px rgba(129, 140, 248, 0.45)) drop-shadow(0 0 14px rgba(99, 102, 241, 0.25));
}
.edumed-splash-letter--odd {
  animation-name: edumed-splash-letter-odd;
  animation-duration: ${LETTER_ANIM_S}s;
  animation-timing-function: linear;
  animation-fill-mode: both;
}
.edumed-splash-letter--even {
  animation-name: edumed-splash-letter-even;
  animation-duration: ${LETTER_ANIM_S}s;
  animation-timing-function: linear;
  animation-fill-mode: both;
}
`;

type Phase = "run" | "fade" | "done";

export function PostLoginSplash({ onComplete }: { onComplete: () => void }) {
  const [glow, setGlow] = useState(false);
  const [lettersOpaque, setLettersOpaque] = useState(true);
  const [phase, setPhase] = useState<Phase>("run");

  useEffect(() => {
    const introUrl = systemSounds.url("intro");
    // eslint-disable-next-line no-console -- отладка intro URL / загрузка
    console.log("INTRO_URL", introUrl);
    // eslint-disable-next-line no-console -- отладка вызова play intro
    console.log("INTRO_PLAY_CALLED");
    systemSounds.preload(["intro"]);
    systemSounds.play("intro");
  }, []);

  useEffect(() => {
    const glowAt = window.setTimeout(() => setGlow(true), GLOW_AT_MS);
    const lettersFadeAt = window.setTimeout(() => setLettersOpaque(false), LETTERS_FADE_START_MS);
    const fadeAt = window.setTimeout(() => setPhase("fade"), FADE_START_MS);
    const doneAt = window.setTimeout(() => {
      setPhase("done");
      onComplete();
    }, SPLASH_TOTAL_MS);
    return () => {
      window.clearTimeout(glowAt);
      window.clearTimeout(lettersFadeAt);
      window.clearTimeout(fadeAt);
      window.clearTimeout(doneAt);
    };
  }, [onComplete]);

  if (phase === "done") return null;

  const fading = phase === "fade";

  return (
    <div
      className="fixed inset-0 z-[60000] flex items-center justify-center bg-gradient-to-b from-white via-slate-50 to-white ease-out"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <style>{SPLASH_STYLES}</style>
      <div
        className="flex select-none items-center justify-center px-4 font-sans text-[clamp(2.25rem,10vw,3.75rem)] font-bold tracking-[0.12em]"
        style={{
          opacity: lettersOpaque ? 1 : 0,
          transition: `opacity ${LETTERS_FADE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      >
        {LETTERS.map((ch, i) => {
          const fromTop = i % 2 === 0;
          return (
            <span
              key={`${ch}-${i}`}
              className={
                "edumed-splash-letter " +
                (fromTop ? "edumed-splash-letter--odd" : "edumed-splash-letter--even") +
                (glow ? " edumed-splash-letter--lit" : "")
              }
              style={{ animationDelay: `${STAGGER_S[i] ?? 0}s` }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
}
