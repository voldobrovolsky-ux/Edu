import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DocumentUploadRoutesPanel } from "../components/DocumentUploadRoutesPanel";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Section = { id: string; name: string };
type Folder = { id: string; name: string; sectionId: string | null; parentFolderId: string | null };

export function DocumentsRoutesMapScreen() {
  const navigate = useNavigate();
  const auth = useAuth();
  const token = auth.accessToken!;
  const [sections, setSections] = useState<Section[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tree = await api.documentsTree(token);
      setSections((tree.sections ?? []) as Section[]);
      setFolders((tree.folders ?? []) as Folder[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-[calc(100vh-120px)] space-y-4">
      <div className="ed-panel ed-panel-hover p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Маршруты и связи</h2>
          <button
            type="button"
            className="ed-btn ed-btn-secondary ed-interactive px-3 py-1.5 text-xs"
            onClick={() => navigate("/documents")}
          >
            Назад
          </button>
        </div>
      </div>
      <div className="ed-panel ed-panel-hover h-[calc(100vh-220px)] overflow-auto p-4">
        {loading ? <div className="text-sm text-slate-600">Загрузка карты…</div> : null}
        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        {!loading ? (
          <DocumentUploadRoutesPanel token={token} sections={sections} folders={folders} className="border-0 shadow-none" />
        ) : null}
      </div>
    </div>
  );
}
