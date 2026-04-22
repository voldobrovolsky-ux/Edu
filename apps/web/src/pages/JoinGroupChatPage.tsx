import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { playServiceSound } from "../audio/systemSounds";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

export function JoinGroupChatPage() {
  const { token: inviteToken } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const t = auth.accessToken;
    if (!t || !inviteToken) return;
    void (async () => {
      try {
        setJoining(true);
        setErr(null);
        const r = await api.chats.joinGroup(t, inviteToken, { password: "" });
        navigate(`/florium?g=${encodeURIComponent(r.groupId)}`, { replace: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "JOIN_FAILED";
        if (msg === "INVITE_PASSWORD_REQUIRED") {
          setNeedsPassword(true);
          setErr(null);
        } else {
          playServiceSound("error");
          setErr(msg);
        }
      } finally {
        setJoining(false);
      }
    })();
  }, [auth.accessToken, inviteToken, navigate]);

  if (!auth.accessToken) return <div className="p-6 text-slate-600">Требуется вход.</div>;
  if (err) return <div className="p-6 text-rose-600">{err}</div>;

  return needsPassword ? (
    <div className="p-6">
      <div className="text-sm font-semibold text-slate-800">Введите пароль для вступления в группу</div>
      <div className="mt-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Пароль…"
          autoFocus
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => navigate("/florium", { replace: true })}
          disabled={joining}
        >
          Отмена
        </button>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={joining || !password.trim()}
          onClick={() => {
            const t = auth.accessToken;
            if (!t || !inviteToken) return;
            void (async () => {
              try {
                setJoining(true);
                setErr(null);
                const r = await api.chats.joinGroup(t, inviteToken, { password });
                navigate(`/florium?g=${encodeURIComponent(r.groupId)}`, { replace: true });
              } catch (e) {
                playServiceSound("error");
                setErr(e instanceof Error ? e.message : "JOIN_FAILED");
              } finally {
                setJoining(false);
              }
            })();
          }}
        >
          {joining ? "Подключение…" : "Вступить"}
        </button>
      </div>
    </div>
  ) : (
    <div className="p-6 text-slate-600">{joining ? "Подключение к группе…" : "Подключение к группе…"}</div>
  );
}
