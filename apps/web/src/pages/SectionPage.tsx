import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../state/auth";

export function SectionPage() {
  const { sectionId } = useParams();
  const auth = useAuth();

  const title = useMemo(() => {
    return sectionId || "section";
  }, [sectionId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">Слой 0 • Раздел</div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 text-sm text-slate-700">
        Пользователь: <span className="font-medium">@{auth.user?.username}</span>
      </div>
      <div className="mt-1 text-sm text-slate-700">
        Дальше здесь появится функциональность раздела согласно документации (пока не реализуем).
      </div>
    </div>
  );
}

