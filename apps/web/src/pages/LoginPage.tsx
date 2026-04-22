import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  playServiceSound,
  primeIntroFromUserGesture,
  primeServiceAudioFromUserGestureAsync,
} from "../audio/systemSounds";
import { markPostLoginSplashPending } from "../session/postLoginSplashSession";
import { useAuth } from "../state/auth";
import { useUiPreferences } from "../state/uiPreferences";

/**
 * Заглушка: будущий вход через Flörus (OIDC / redirect / popup — уточнится при интеграции).
 *
 * Целевой сценарий (высокий уровень):
 *
 * 1) Определение устройства
 *    — Не опираться на IP (VPN и т.п.).
 *    — В проде характеристики устройства / fingerprint / hardware-id / secure storage обрабатывает
 *      сторона Flörus; фронт EDUMED только открывает flow (redirect, окно, SDK) и не дублирует эту логику.
 *
 * 2) Ввод логина во Flörus
 *    — Пользователь вводит только username.
 *    — Если устройство уже привязано к этому аккаунту Flörus — пароль не нужен (одобрение по устройству).
 *    — Если устройство новое — Flörus запрашивает пароль или другой второй фактор после username.
 *
 * 3) Проверка регистрации во Flörus
 *    — Нет username в базе Flörus → перенаправление на регистрацию / создание аккаунта во Flörus (их UI).
 *    — Username есть в экосистеме Flör Group, но нет полноценной Flörus-учётки → вход через Flörus
 *      невозможен, пока пользователь не оформит Flör-аккаунт (экраны Flörus, не EDUMED).
 *    — Есть полноценный Flörus-аккаунт и устройство подтверждено → вход успешен.
 *
 * Важно:
 *    — Вход в EDUMED через Flörus возможен только если участник экосистемы зарегистрирован во Flörus.
 *    — Пользователь может быть в EDUMED/других продуктах Flör Group без Flörus-аккаунта — тогда
 *      кнопка Flörus не завершит вход, пока аккаунт во Flörus не создан.
 *    — Цель: любой пользователь продуктов Flör Group сможет оформить аккаунт через Flörus; Flörus
 *      станет единым identity-провайдером.
 *
 * 4) Возврат в EDUMED
 *    — После успеха Flörus отдаёт в EDUMED токен/сессию и публичные поля пользователя, достаточные
 *      для заполнения `User` и установки сессии в `AuthProvider` (`state/auth`) и при необходимости
 *      `FlorusSession` для Flörium (детали на стыке бэкендов).
 *
 * Сейчас: без реальных запросов к Flörus; существующий `api.login` / `api.me` не меняются.
 */
function handleFlorusSignInStub(): void {
  // eslint-disable-next-line no-console -- явная заглушка до появления Flörus API
  console.warn("[Flörus] sign-in flow not implemented; see LoginPage.tsx TODO block.");
  alert("Flörus sign-in flow: TODO");
}

export function LoginPage() {
  const auth = useAuth();
  const ui = useUiPreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { message?: string; logoutReveal?: boolean } | null;
  const notice =
    typeof locState?.message === "string" ? locState.message : null;
  const logoutReveal = Boolean(locState?.logoutReveal);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginRevealed, setLoginRevealed] = useState(!logoutReveal);

  const canSubmit = useMemo(
    () => username.trim().length >= 1 && password.length >= 1 && !busy,
    [username, password, busy],
  );

  useEffect(() => {
    if (auth.isAuthenticated()) navigate("/", { replace: true });
  }, [auth, navigate]);

  useEffect(() => {
    if (!logoutReveal) return;
    const id = window.requestAnimationFrame(() => setLoginRevealed(true));
    return () => window.cancelAnimationFrame(id);
  }, [logoutReveal]);

  return (
    <div
      className={
        "min-h-screen bg-slate-50 font-sans text-slate-800 transition-opacity duration-500 ease-out " +
        (loginRevealed ? "opacity-100" : "opacity-0")
      }
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">EDUMED</h1>
          <p className="mt-1 text-sm text-slate-600">Вход в систему</p>

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {notice}
            </div>
          ) : null}

          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setBusy(true);
              try {
                await primeIntroFromUserGesture();
                await primeServiceAudioFromUserGestureAsync();
                await auth.login(username.trim(), password);
                if (ui.showLoginSplash && ui.audioGuidanceMode === "full") markPostLoginSplashPending();
                navigate("/", { replace: true });
              } catch (err) {
                playServiceSound("error");
                setError(err instanceof Error ? err.message : "LOGIN_FAILED");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              <div className="text-sm font-medium text-slate-700">Логин</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                autoComplete="username"
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-slate-700">Пароль</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                autoComplete="current-password"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Входим..." : "Войти"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-t-4 border-t-slate-400 border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Войти с помощью Flörus</h2>
          <p className="mt-1 text-sm text-slate-600">
            Альтернативный вход через единый идентификатор Flör Group (подключится, когда бэкенд Flörus
            будет доступен).
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={handleFlorusSignInStub}
          >
            Войти с помощью Flörus
          </button>
          <div
            className="mt-4 flex h-16 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500"
            aria-hidden
          >
            Flörus logo
          </div>
        </div>

        <p className="text-center text-xs text-slate-500">
          Слой 0: пользователь, роли, кабинеты, навигация.
        </p>
      </div>
    </div>
  );
}
