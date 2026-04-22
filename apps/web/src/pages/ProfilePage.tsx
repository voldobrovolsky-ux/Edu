import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  apiErrorToMessage,
  cropSquareToJpeg,
  formatPhoneRuDigits,
  isValidEmail,
  isValidPhone,
  PROFILE_TIMEZONES,
  roleLabelRu,
} from "../lib/profileForm";
import type { OfficeConfig } from "../types/office";
import type { User, UserProfilePrefs } from "../types/user";
import { useAuth } from "../state/auth";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900">
      <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

function initials(u: User): string {
  const a = u.lastName?.[0] ?? "";
  const b = u.firstName?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

function pickMain(u: User) {
  return { lastName: u.lastName, firstName: u.firstName, patronymic: u.patronymic };
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { accessToken: token, user, refreshUser, setUser } = useAuth();

  const [office, setOffice] = useState<OfficeConfig | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  const [main, setMain] = useState({ lastName: "", firstName: "", patronymic: "" });
  const [contacts, setContacts] = useState({ email: "", phone: "", locale: "ru" as "ru" | "en", timezone: "Europe/Moscow" });
  const [prefs, setPrefs] = useState<UserProfilePrefs | null>(null);
  const [prefsUi, setPrefsUi] = useState<UserProfilePrefs | null>(null);

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  const [mainErr, setMainErr] = useState<string | null>(null);
  const [mainOk, setMainOk] = useState<string | null>(null);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [contactOk, setContactOk] = useState<string | null>(null);
  const [notifErr, setNotifErr] = useState<string | null>(null);
  const [notifOk, setNotifOk] = useState<string | null>(null);
  const [uiErr, setUiErr] = useState<string | null>(null);
  const [uiOk, setUiOk] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdOk, setPwdOk] = useState<string | null>(null);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [avatarOk, setAvatarOk] = useState<string | null>(null);

  const [savingMain, setSavingMain] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [savingUi, setSavingUi] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const locks = office?.profileFieldLocks ?? {};

  const hydrate = useCallback(
    (u: User) => {
      setMain(pickMain(u));
      setContacts({
        email: u.email ?? "",
        phone: u.phone?.trim() ? formatPhoneRuDigits(u.phone) : "",
        locale: u.locale === "en" ? "en" : "ru",
        timezone: PROFILE_TIMEZONES.some((t) => t.value === u.timezone) ? u.timezone : "Europe/Moscow",
      });
      setPrefs({ ...u.profilePrefs });
      setPrefsUi({ ...u.profilePrefs });
    },
    [],
  );

  useEffect(() => {
    void api
      .office()
      .then((r) => setOffice(r.office))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    setRefreshing(true);
    void refreshUser()
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [token, refreshUser]);

  useEffect(() => {
    if (user) hydrate(user);
  }, [user, hydrate]);

  const dirtyMain = user ? JSON.stringify(main) !== JSON.stringify(pickMain(user)) : false;
  const dirtyContacts = useMemo(() => {
    if (!user) return false;
    const uPhone = user.phone?.trim() ? formatPhoneRuDigits(user.phone) : "";
    const cEmail = contacts.email.trim();
    const uEmail = (user.email ?? "").trim();
    const tz = PROFILE_TIMEZONES.some((t) => t.value === user.timezone) ? user.timezone : "Europe/Moscow";
    return (
      cEmail !== uEmail ||
      contacts.phone.trim() !== uPhone ||
      contacts.locale !== user.locale ||
      contacts.timezone !== tz
    );
  }, [user, contacts]);
  const dirtyNotif = user && prefs ? JSON.stringify(prefs) !== JSON.stringify(user.profilePrefs) : false;
  const dirtyUi = user && prefsUi ? JSON.stringify(prefsUi) !== JSON.stringify(user.profilePrefs) : false;

  const dirty = dirtyMain || dirtyContacts || dirtyNotif || dirtyUi;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return Boolean(dirty && currentLocation.pathname !== nextLocation.pathname);
  });

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const ok = window.confirm("Есть несохранённые изменения. Выйти без сохранения?");
    if (ok) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);

  const roleLine = useMemo(() => {
    if (!user) return "";
    const sec = user.secondaryRoles.length ? user.secondaryRoles.map(roleLabelRu).join(", ") : "—";
    return `Основная роль: ${roleLabelRu(user.primaryRole)} · Дополнительные: ${sec}`;
  }, [user]);

  const saveMain = async () => {
    if (!token || !user) return;
    setMainErr(null);
    setMainOk(null);
    if (!main.lastName.trim() || !main.firstName.trim()) {
      setMainErr("Заполните фамилию и имя.");
      return;
    }
    setSavingMain(true);
    try {
      const { user: next } = await api.patchProfile(token, {
        lastName: main.lastName.trim(),
        firstName: main.firstName.trim(),
        patronymic: main.patronymic.trim(),
      });
      setUser(next);
      window.dispatchEvent(new CustomEvent("edumed:chat-users-invalidate", { detail: { userId: next.id } }));
      setMainOk("Изменения сохранены.");
    } catch (e) {
      setMainErr(apiErrorToMessage((e as Error).message));
    } finally {
      setSavingMain(false);
    }
  };

  const saveContacts = async () => {
    if (!token || !user) return;
    setContactErr(null);
    setContactOk(null);
    const em = contacts.email.trim();
    if (em && !isValidEmail(em)) {
      setContactErr("Укажите корректный email или оставьте поле пустым.");
      return;
    }
    if (!isValidPhone(contacts.phone)) {
      setContactErr("Некорректный формат телефона.");
      return;
    }
    setSavingContact(true);
    try {
      const { user: next } = await api.patchProfile(token, {
        email: em || "",
        phone: contacts.phone.trim(),
        locale: contacts.locale,
        timezone: contacts.timezone,
      });
      setUser(next);
      window.dispatchEvent(new CustomEvent("edumed:chat-users-invalidate", { detail: { userId: next.id } }));
      setContactOk("Сохранено.");
    } catch (e) {
      setContactErr(apiErrorToMessage((e as Error).message));
    } finally {
      setSavingContact(false);
    }
  };

  const saveNotif = async () => {
    if (!token || !user || !prefs) return;
    setNotifErr(null);
    setNotifOk(null);
    setSavingNotif(true);
    try {
      const { user: next } = await api.patchProfile(token, {
        profilePrefs: {
          botNotifications: prefs.botNotifications,
          chatNotificationsDefault: prefs.chatNotificationsDefault,
          showOnlineStatus: prefs.showOnlineStatus,
        },
      });
      setUser(next);
      window.dispatchEvent(new CustomEvent("edumed:chat-users-invalidate", { detail: { userId: next.id } }));
      setPrefs({ ...next.profilePrefs });
      setPrefsUi({ ...next.profilePrefs });
      setNotifOk("Сохранено.");
    } catch (e) {
      setNotifErr(apiErrorToMessage((e as Error).message));
    } finally {
      setSavingNotif(false);
    }
  };

  const saveUi = async () => {
    if (!token || !user || !prefsUi) return;
    setUiErr(null);
    setUiOk(null);
    setSavingUi(true);
    try {
      const { user: next } = await api.patchProfile(token, {
        profilePrefs: {
          theme: prefsUi.theme,
          fontSize: prefsUi.fontSize,
          dateTimeFormat: prefsUi.dateTimeFormat,
        },
      });
      setUser(next);
      window.dispatchEvent(new CustomEvent("edumed:chat-users-invalidate", { detail: { userId: next.id } }));
      setPrefsUi({ ...next.profilePrefs });
      setPrefs({ ...next.profilePrefs });
      setUiOk("Сохранено.");
    } catch (e) {
      setUiErr(apiErrorToMessage((e as Error).message));
    } finally {
      setSavingUi(false);
    }
  };

  const savePassword = async () => {
    if (!token) return;
    setPwdErr(null);
    setPwdOk(null);
    if (pwd.next.length < 8) {
      setPwdErr("Новый пароль: минимум 8 символов.");
      return;
    }
    if (pwd.next !== pwd.confirm) {
      setPwdErr("Новый пароль и подтверждение не совпадают.");
      return;
    }
    setSavingPwd(true);
    try {
      await api.changePassword(token, { currentPassword: pwd.current, newPassword: pwd.next });
      setPwd({ current: "", next: "", confirm: "" });
      setPwdOk("Пароль изменён.");
    } catch (e) {
      setPwdErr(apiErrorToMessage((e as Error).message));
    } finally {
      setSavingPwd(false);
    }
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !token) return;
    if (!/^image\/(jpeg|png)$/i.test(f.type)) {
      setAvatarErr("Выберите JPG или PNG.");
      return;
    }
    setAvatarErr(null);
    setAvatarOk(null);
    setUploadingAvatar(true);
    try {
      const blob = await cropSquareToJpeg(f);
      const { user: next } = await api.uploadProfileAvatar(token, blob, "avatar.jpg");
      setUser(next);
      window.dispatchEvent(new CustomEvent("edumed:chat-users-invalidate", { detail: { userId: next.id } }));
      setAvatarOk("Фото обновлено.");
    } catch (err) {
      setAvatarErr(apiErrorToMessage((err as Error).message));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const detectTimezone = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (PROFILE_TIMEZONES.some((t) => t.value === tz)) {
        setContacts((c) => ({ ...c, timezone: tz }));
      }
    } catch {
      // ignore
    }
  };

  if (!user || refreshing) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-600 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-300">Загрузка профиля…</p>
      </div>
    );
  }

  const avatarSrc = user.avatarUrl ? user.avatarUrl : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Профиль</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{roleLine}</p>
        </div>
      </div>

      <Card title="Основная информация">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-600 dark:text-slate-300">
                {initials(user)}
              </div>
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={onPickAvatar} />
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {uploadingAvatar ? "Загрузка…" : "Изменить фото"}
            </button>
            <p className="mt-1 text-xs text-slate-500">JPG или PNG, фото обрезается до квадрата.</p>
            {avatarErr ? <p className="mt-1 text-sm text-rose-600">{avatarErr}</p> : null}
            {avatarOk ? <p className="mt-1 text-sm text-emerald-700">{avatarOk}</p> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Фамилия">
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={main.lastName}
              disabled={Boolean(locks.lastName)}
              onChange={(e) => setMain((m) => ({ ...m, lastName: e.target.value }))}
            />
          </Field>
          <Field label="Имя">
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={main.firstName}
              disabled={Boolean(locks.firstName)}
              onChange={(e) => setMain((m) => ({ ...m, firstName: e.target.value }))}
            />
          </Field>
          <Field label="Отчество">
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={main.patronymic}
              disabled={Boolean(locks.patronymic)}
              onChange={(e) => setMain((m) => ({ ...m, patronymic: e.target.value }))}
            />
          </Field>
        </div>

        <Field label="Юзернейм" hint="Используется в чатах и для упоминаний. Меняется только администратором.">
          <input
            className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
            readOnly
            value={user.username}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Основная роль">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {roleLabelRu(user.primaryRole)}
            </div>
          </Field>
          <Field label="Дополнительные роли">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {user.secondaryRoles.length ? user.secondaryRoles.map(roleLabelRu).join(", ") : "—"}
            </div>
          </Field>
        </div>

        {mainErr ? <p className="text-sm text-rose-600">{mainErr}</p> : null}
        {mainOk ? <p className="text-sm text-emerald-700">{mainOk}</p> : null}
        <div>
          <button
            type="button"
            disabled={savingMain || !dirtyMain}
            onClick={() => void saveMain()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {savingMain ? "Сохранение…" : "Сохранить изменения"}
          </button>
        </div>
      </Card>

      <Card title="Контакты и язык">
        <Field
          label="Email"
          hint="Используется для важных уведомлений и восстановления доступа в будущем. Можно оставить пустым."
        >
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={contacts.email}
            onChange={(e) => setContacts((c) => ({ ...c, email: e.target.value }))}
            autoComplete="email"
          />
        </Field>
        <Field label="Телефон" hint="Хранится в профиле; может использоваться ботом и администрацией.">
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={contacts.phone}
            onChange={(e) => setContacts((c) => ({ ...c, phone: formatPhoneRuDigits(e.target.value) }))}
            placeholder="+7 (___) ___-__-__"
            autoComplete="tel"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Язык интерфейса">
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={contacts.locale}
              onChange={(e) => setContacts((c) => ({ ...c, locale: e.target.value as "ru" | "en" }))}
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Часовой пояс">
            <div className="flex flex-wrap gap-2">
              <select
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={contacts.timezone}
                onChange={(e) => setContacts((c) => ({ ...c, timezone: e.target.value }))}
              >
                {PROFILE_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={detectTimezone}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Авто
              </button>
            </div>
          </Field>
        </div>
        {contactErr ? <p className="text-sm text-rose-600">{contactErr}</p> : null}
        {contactOk ? <p className="text-sm text-emerald-700">{contactOk}</p> : null}
        <button
          type="button"
          disabled={savingContact || !dirtyContacts}
          onClick={() => void saveContacts()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {savingContact ? "Сохранение…" : "Сохранить"}
        </button>
      </Card>

      <Card title="Пароль и безопасность">
        <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200">Смена пароля</h4>
        <Field label="Текущий пароль">
          <input
            type="password"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={pwd.current}
            onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Новый пароль">
          <input
            type="password"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={pwd.next}
            onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Подтверждение нового пароля">
          <input
            type="password"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={pwd.confirm}
            onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
            autoComplete="new-password"
          />
        </Field>
        {pwdErr ? <p className="text-sm text-rose-600">{pwdErr}</p> : null}
        {pwdOk ? <p className="text-sm text-emerald-700">{pwdOk}</p> : null}
        <button
          type="button"
          disabled={savingPwd}
          onClick={() => void savePassword()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {savingPwd ? "Смена…" : "Сменить пароль"}
        </button>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          При входе с нового устройства система может запросить дополнительное подтверждение. Подробности — у администратора.
        </div>
      </Card>

      <Card title="Уведомления">
        {prefs ? (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={prefs.botNotifications}
                onChange={(e) => setPrefs((p) => (p ? { ...p, botNotifications: e.target.checked } : p))}
              />
              <span>
                <span className="font-medium text-slate-900 dark:text-slate-100">Уведомления от бота-ассистента</span>
                <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                  Получать сообщения от бота-ассистента о ревизиях, напоминаниях и системных событиях.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={prefs.chatNotificationsDefault}
                onChange={(e) => setPrefs((p) => (p ? { ...p, chatNotificationsDefault: e.target.checked } : p))}
              />
              <span>
                <span className="font-medium text-slate-900 dark:text-slate-100">Уведомления по чатам</span>
                <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                  Включить звуковые и визуальные уведомления для новых сообщений в чатах (по умолчанию). Поверх этого можно
                  настроить каждый чат отдельно.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={prefs.showOnlineStatus}
                onChange={(e) => setPrefs((p) => (p ? { ...p, showOnlineStatus: e.target.checked } : p))}
              />
              <span>
                <span className="font-medium text-slate-900 dark:text-slate-100">Показывать статус «в сети»</span>
                <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                  Показывать другим пользователям, когда вы в сети и время последней активности. Если отключить — для других
                  будет более общий статус.
                </span>
              </span>
            </label>
          </>
        ) : null}
        {notifErr ? <p className="text-sm text-rose-600">{notifErr}</p> : null}
        {notifOk ? <p className="text-sm text-emerald-700">{notifOk}</p> : null}
        <button
          type="button"
          disabled={savingNotif || !dirtyNotif}
          onClick={() => void saveNotif()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {savingNotif ? "Сохранение…" : "Сохранить"}
        </button>
      </Card>

      <Card title="Личные предпочтения (UI)">
        {prefsUi ? (
          <>
            <Field label="Тема интерфейса">
              <div className="flex flex-wrap gap-2">
                {(["light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPrefsUi((p) => (p ? { ...p, theme: t } : p))}
                    className={[
                      "rounded-xl border px-3 py-2 text-sm",
                      prefsUi.theme === t
                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                    ].join(" ")}
                  >
                    {t === "light" ? "Светлая" : "Тёмная"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Размер шрифта" hint="Крупный шрифт облегчает чтение текстов и подписей.">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["normal", "Обычный"],
                    ["large", "Крупный"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPrefsUi((p) => (p ? { ...p, fontSize: v } : p))}
                    className={[
                      "rounded-xl border px-3 py-2 text-sm",
                      prefsUi.fontSize === v
                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Формат даты и времени">
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={prefsUi.dateTimeFormat}
                onChange={(e) =>
                  setPrefsUi((p) =>
                    p
                      ? {
                          ...p,
                          dateTimeFormat: e.target.value as UserProfilePrefs["dateTimeFormat"],
                        }
                      : p,
                  )
                }
              >
                <option value="ru_ddmmyyyy_24">ДД.ММ.ГГГГ, 24 часа</option>
                <option value="intl_ddmmyyyy_24">DD/MM/YYYY, 24h</option>
              </select>
            </Field>
          </>
        ) : null}
        {uiErr ? <p className="text-sm text-rose-600">{uiErr}</p> : null}
        {uiOk ? <p className="text-sm text-emerald-700">{uiOk}</p> : null}
        <button
          type="button"
          disabled={savingUi || !dirtyUi}
          onClick={() => void saveUi()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {savingUi ? "Сохранение…" : "Сохранить"}
        </button>
      </Card>
    </div>
  );
}
