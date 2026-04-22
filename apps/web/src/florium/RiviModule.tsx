import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useFlorium } from "@edumed/florium";
import { useNavigate } from "react-router-dom";
import { dispatchFloriumRiviBadgeCount } from "../lib/floriumSidebarBadgeEvents";
import { HostFloriumPanel } from "./ui/HostFloriumPanel";
import { CommunitoriaMessagePane } from "./CommunitoriaMessagePane";
import { RiviBoardModule } from "./RiviBoardModule";
import {
  RIVI_EXIT_WORKSPACE_EVENT,
  RIVI_UPDATED_EVENT,
  addClusterToRiviSpace,
  addShapeObjectToRiviSpace,
  addTextObjectToRiviSpace,
  createConnector,
  createRiviSpace,
  deleteRiviSpace,
  emitRiviFocusMode,
  loadRiviState,
  patchRiviSpace,
  setLastOpenedRiviSpace,
  upsertRiviSpace,
  updateRiviConnectors,
  updateRiviObjects,
  updateRiviViewport,
  type RiviChatLinkObject,
  type RiviDocumentObject,
  type RiviObject,
  type RiviBoardState,
} from "./riviStorage";

type DragState =
  | { type: "object"; id: string; dx: number; dy: number }
  | { type: "pan"; startX: number; startY: number; baseX: number; baseY: number }
  | null;

const CARD_GRADIENTS = [
  "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 45%, #93c5fd 100%)",
  "linear-gradient(135deg, #fef3c7 0%, #fde68a 45%, #fca5a5 100%)",
  "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 45%, #a7f3d0 100%)",
  "linear-gradient(135deg, #f5d0fe 0%, #e9d5ff 45%, #c4b5fd 100%)",
  "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 45%, #86efac 100%)",
  "linear-gradient(135deg, #ffe4e6 0%, #fecdd3 45%, #fbcfe8 100%)",
];

function formatUpdatedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function clampZoom(value: number) {
  return Math.min(1.6, Math.max(0.6, value));
}

function objectCenter(item: RiviObject) {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

function gradientForKey(key: string) {
  const hash = key.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length]!;
}

function iconForSpace(title: string) {
  const first = title.trim().charAt(0).toUpperCase();
  return first || "•";
}

export function RiviModule() {
  const { user } = useFlorium();
  const navigate = useNavigate();
  const [storageState, setStorageState] = useState(() => loadRiviState());
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [spaceQuery, setSpaceQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newSpaceTitle, setNewSpaceTitle] = useState("");
  const [newSpaceDescription, setNewSpaceDescription] = useState("");
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [linkStartId, setLinkStartId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const prevBoardSizeRef = useRef<{ w: number; h: number } | null>(null);
  const dragRef = useRef<DragState>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 24, y: 20 });
  const toolbarDragRef = useRef<null | { dx: number; dy: number }>(null);
  const [openChatLinkId, setOpenChatLinkId] = useState<string | null>(null);
  const [linkStyle, setLinkStyle] = useState<"solid" | "dashed" | "arrow">("solid");
  const [toolbarConfigOpen, setToolbarConfigOpen] = useState(false);
  const [visibleTools, setVisibleTools] = useState<Record<string, boolean>>({
    text: true,
    rect: true,
    ellipse: true,
    link: true,
    cluster: true,
  });
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardDraft, setBoardDraft] = useState<RiviBoardState | null>(null);

  /** См. FmailModule: не поднимать бейдж из моков при монтировании; сброс при входе. */
  useEffect(() => {
    dispatchFloriumRiviBadgeCount(0);
  }, []);

  useEffect(() => {
    const sync = () => setStorageState(loadRiviState());
    window.addEventListener(RIVI_UPDATED_EVENT, sync);
    return () => window.removeEventListener(RIVI_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    const onExit = () => {
      setBoardOpen(false);
      setBoardDraft(null);
      setCurrentSpaceId(null);
      setSelectedObjectIds([]);
      setLinkStartId(null);
      setOpenChatLinkId(null);
    };
    window.addEventListener(RIVI_EXIT_WORKSPACE_EVENT, onExit);
    return () => window.removeEventListener(RIVI_EXIT_WORKSPACE_EVENT, onExit);
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.userSelect = "";
    };
  }, []);

  const spaces = storageState.spaces;
  const activeSpace = spaces.find((space) => space.id === currentSpaceId) ?? null;
  const workspaceMode = activeSpace != null;

  useEffect(() => {
    emitRiviFocusMode(workspaceMode);
    return () => emitRiviFocusMode(false);
  }, [workspaceMode]);

  useEffect(() => {
    if (!workspaceMode || boardOpen || !activeSpace) return;
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const current = { w: Math.round(rect.width), h: Math.round(rect.height) };
      const prev = prevBoardSizeRef.current;
      prevBoardSizeRef.current = current;
      if (!prev) return;
      const dw = current.w - prev.w;
      const dh = current.h - prev.h;
      if (Math.abs(dw) < 1 && Math.abs(dh) < 1) return;
      updateRiviViewport(activeSpace.id, {
        ...activeSpace.viewport,
        panX: activeSpace.viewport.panX + dw / 2,
        panY: activeSpace.viewport.panY + dh / 2,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [workspaceMode, boardOpen, activeSpace?.id, activeSpace?.viewport.panX, activeSpace?.viewport.panY, activeSpace?.viewport.zoom]);

  const filteredSpaces = useMemo(() => {
    return spaces.filter((space) => {
      if (statusFilter !== "all" && space.status !== statusFilter) return false;
      if (!spaceQuery.trim()) return true;
      const query = spaceQuery.toLowerCase();
      return (
        space.title.toLowerCase().includes(query) ||
        space.description.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query)
      );
    });
  }, [spaces, statusFilter, spaceQuery, user.username]);

  const onBoardMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (toolbarDragRef.current) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      setToolbarPos({
        x: Math.max(12, Math.min(rect.width - 220, e.clientX - rect.left - toolbarDragRef.current.dx)),
        y: Math.max(12, Math.min(rect.height - 80, e.clientY - rect.top - toolbarDragRef.current.dy)),
      });
      return;
    }
    const drag = dragRef.current;
    const board = boardRef.current;
    const space = activeSpace;
    if (!drag || !board || !space) return;
    const rect = board.getBoundingClientRect();
    if (drag.type === "object") {
      const nextX = (e.clientX - rect.left - drag.dx - space.viewport.panX) / space.viewport.zoom;
      const nextY = (e.clientY - rect.top - drag.dy - space.viewport.panY) / space.viewport.zoom;
      updateRiviObjects(
        space.id,
        space.objects.map((it) =>
          it.id === drag.id ? { ...it, x: Math.max(-2400, nextX), y: Math.max(-2400, nextY), updatedAt: new Date().toISOString() } : it,
        ),
      );
      return;
    }
    updateRiviViewport(space.id, {
      ...space.viewport,
      panX: drag.baseX + (e.clientX - drag.startX),
      panY: drag.baseY + (e.clientY - drag.startY),
    });
  };

  const stopDrag = () => {
    toolbarDragRef.current = null;
    if (dragRef.current?.type === "pan") {
      setIsPanning(false);
      document.body.style.userSelect = "";
    }
    dragRef.current = null;
  };

  const openSpace = (spaceId: string) => {
    setBoardOpen(false);
    setBoardDraft(null);
    setCurrentSpaceId(spaceId);
    setLastOpenedRiviSpace(spaceId);
    setSelectedObjectIds([]);
    setLinkStartId(null);
    setOpenChatLinkId(null);
  };

  const closeWorkspace = () => {
    setBoardOpen(false);
    setBoardDraft(null);
    setCurrentSpaceId(null);
    setSelectedObjectIds([]);
    setLinkStartId(null);
    setOpenChatLinkId(null);
  };

  const createBlankSpace = () => {
    const next = createRiviSpace({
      title: newSpaceTitle || "Новое пространство",
      description: newSpaceDescription,
      ownerUserId: user.id,
    });
    upsertRiviSpace(next, { select: true });
    setCurrentSpaceId(next.id);
    setLastOpenedRiviSpace(next.id);
    setNewSpaceTitle("");
    setNewSpaceDescription("");
    setNewSpaceOpen(false);
  };

  const openBoard = () => {
    if (!activeSpace) return;
    if (activeSpace.board) {
      setBoardDraft(null);
      setBoardOpen(true);
      return;
    }
    const now = new Date().toISOString();
    const nextBoard: RiviBoardState = {
      id: `board-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Новая доска",
      width: 1920,
      height: 1080,
      backgroundKind: "pixels",
      viewport: { panX: 0, panY: 0, zoom: 1 },
      elements: [],
      updatedAt: now,
    };
    patchRiviSpace(activeSpace.id, { board: nextBoard });
    setBoardDraft(nextBoard);
    setBoardOpen(true);
  };

  useEffect(() => {
    if (!workspaceMode || !activeSpace || boardOpen) return;
    openBoard();
  }, [workspaceMode, activeSpace?.id, boardOpen]);

  const removeObject = (id: string) => {
    if (!activeSpace) return;
    updateRiviObjects(
      activeSpace.id,
      activeSpace.objects.filter((it) => it.id !== id),
    );
    updateRiviConnectors(
      activeSpace.id,
      activeSpace.connectors.filter((it) => it.fromId !== id && it.toId !== id),
    );
    if (selectedObjectIds.includes(id)) setSelectedObjectIds((prev) => prev.filter((item) => item !== id));
    if (linkStartId === id) setLinkStartId(null);
    if (openChatLinkId === id) setOpenChatLinkId(null);
  };

  const addTextObject = () => {
    if (!activeSpace) return;
    addTextObjectToRiviSpace(activeSpace.id, {
      title: "Новый блок",
      description: "Опишите следующий шаг или заметку.",
    });
  };

  const updateZoom = (delta: number) => {
    if (!activeSpace) return;
    updateRiviViewport(activeSpace.id, {
      ...activeSpace.viewport,
      zoom: clampZoom(activeSpace.viewport.zoom + delta),
    });
  };

  const createLinkWithSelected = () => {
    const targetId = selectedObjectIds[0] ?? null;
    if (!activeSpace || !targetId || !linkStartId || targetId === linkStartId) return;
    if (activeSpace.connectors.some((it) => it.fromId === linkStartId && it.toId === targetId)) return;
    updateRiviConnectors(activeSpace.id, [
      ...activeSpace.connectors,
      createConnector({ fromId: linkStartId, toId: targetId, style: linkStyle }),
    ]);
    setLinkStartId(null);
  };

  const addShapeObject = (shapeKind: "rect" | "ellipse") => {
    if (!activeSpace) return;
    addShapeObjectToRiviSpace(activeSpace.id, {
      shapeKind,
      title: shapeKind === "ellipse" ? "Круг" : "Прямоугольник",
    });
  };

  const activeSelectedObject = activeSpace?.objects.find((item) => item.id === (selectedObjectIds[0] ?? "")) ?? null;
  const selectedObjects = activeSpace?.objects.filter((item) => selectedObjectIds.includes(item.id)) ?? [];
  const openChatObject = activeSpace?.objects.find((item) => item.id === openChatLinkId && item.type === "chatLink") as RiviChatLinkObject | null;
  const boardDocuments = (activeSpace?.objects.filter((item): item is RiviDocumentObject => item.type === "document") ?? []);
  const boardChats = (activeSpace?.objects.filter((item): item is RiviChatLinkObject => item.type === "chatLink") ?? []);

  const createCluster = () => {
    if (!activeSpace || selectedObjects.length < 2) return;
    const left = Math.min(...selectedObjects.map((item) => item.x));
    const top = Math.min(...selectedObjects.map((item) => item.y));
    const right = Math.max(...selectedObjects.map((item) => item.x + item.w));
    const bottom = Math.max(...selectedObjects.map((item) => item.y + item.h));
    addClusterToRiviSpace(activeSpace.id, {
      title: `Кластер ${activeSpace.objects.filter((item) => item.type === "cluster").length + 1}`,
      childIds: selectedObjects.map((item) => item.id),
      x: left - 28,
      y: top - 36,
      w: right - left + 56,
      h: bottom - top + 72,
    });
  };

  const toggleClusterCollapsed = (clusterId: string) => {
    if (!activeSpace) return;
    updateRiviObjects(
      activeSpace.id,
      activeSpace.objects.map((item) =>
        item.type === "cluster" && item.id === clusterId ? { ...item, collapsed: !item.collapsed, updatedAt: new Date().toISOString() } : item,
      ),
    );
  };

  useEffect(() => {
    if (!boardOpen) return;
    if (!activeSpace?.board || !boardDraft) return;
    if (activeSpace.board.id === boardDraft.id) setBoardDraft(null);
  }, [boardOpen, activeSpace?.board?.id, boardDraft]);

  if (!workspaceMode) {
    return (
      <HostFloriumPanel
        title="Rivi"
        subtitle="Галерея пространств для проектных карт, документов, смысловых блоков и маршрутов."
        className="h-full min-h-0"
      >
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-slate-200 bg-white/75 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={spaceQuery}
              onChange={(e) => setSpaceQuery(e.target.value)}
              placeholder="Поиск по названию, описанию или владельцу"
              className="min-w-[240px] flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-0"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "archived")}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">Все статусы</option>
              <option value="active">В работе</option>
              <option value="archived">Архив</option>
            </select>
          </div>

          <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => setNewSpaceOpen(true)}
              className="flex min-h-[220px] flex-col items-start justify-between rounded-3xl border border-dashed border-slate-300 bg-slate-100/90 p-5 text-left text-slate-600 transition-colors hover:bg-slate-200/80"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Новое</div>
                <div className="mt-3 text-xl font-semibold text-slate-800">Создать пространство</div>
                <p className="mt-2 text-sm text-slate-500">
                  Пустой холст для проекта, сценария, продукта или карты маршрутов.
                </p>
              </div>
              <div className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                Открыть форму
              </div>
            </button>

            {filteredSpaces.map((space) => (
              <article
                key={space.id}
                className="group ed-card ed-card-interactive ed-interactive flex aspect-square min-h-[220px] flex-col rounded-[1.6rem] border border-slate-200/90 bg-white/95 p-3 text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
              >
                <div
                  className="relative flex-[1.15] overflow-hidden rounded-[1.35rem] border border-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
                  style={{
                    background: gradientForKey(space.id),
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 18px 36px rgba(148,163,184,0.18)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.5),transparent_60%)]" />
                  <div className="absolute inset-0 z-[3] flex translate-y-2 items-end justify-center gap-2 bg-gradient-to-t from-white/78 via-white/32 to-transparent p-3 opacity-0 transition-all duration-200 pointer-events-none group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                    <button
                      type="button"
                      className="ed-doc-btn-ghost flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-800 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSpace(space.id);
                      }}
                    >
                      Открыть
                    </button>
                    <button
                      type="button"
                      className="ed-doc-btn-ghost flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-rose-700 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRiviSpace(space.id);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur-sm",
                          space.status === "archived" ? "bg-white/72 text-slate-700" : "bg-white/72 text-emerald-700",
                        ].join(" ")}
                      >
                        {space.status === "archived" ? "Архив" : "В работе"}
                      </span>
                      <div className="rounded-2xl bg-white/58 px-4 py-2 text-2xl font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
                        {iconForSpace(space.title)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="line-clamp-2 text-xl font-semibold leading-tight text-slate-900">{space.title}</div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-700">
                        <span className="rounded-full bg-white/72 px-2.5 py-1 backdrop-blur-sm">{space.objects.length} объектов</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Участники: 1</span>
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-700">{formatUpdatedAt(space.updatedAt)}</span>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <div className="mt-1">Участники: @{user.username}</div>
                    <div className="mt-1 line-clamp-2">{space.description || "Описание пока не добавлено."}</div>
                  </div>
                </div>
              </article>
            ))}

            {filteredSpaces.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-2">
                Пока нет подходящих пространств. Создайте первое пространство через серую карточку.
              </div>
            ) : null}
          </div>
        </div>

        {newSpaceOpen ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4">
            <div className="w-full max-w-lg rounded-[28px] border border-white/50 bg-white/90 p-5 shadow-2xl backdrop-blur">
              <div className="text-lg font-semibold text-slate-900">Новое пространство Rivi</div>
              <p className="mt-1 text-sm text-slate-600">Создайте рабочее поле и сразу откройте его в режиме холста.</p>
              <input
                value={newSpaceTitle}
                onChange={(e) => setNewSpaceTitle(e.target.value)}
                placeholder="Название пространства"
                className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <textarea
                value={newSpaceDescription}
                onChange={(e) => setNewSpaceDescription(e.target.value)}
                placeholder="Короткое описание"
                rows={4}
                className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewSpaceOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={createBlankSpace}
                  className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Создать
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </HostFloriumPanel>
    );
  }

  const boardToShow = activeSpace?.board ?? boardDraft;
  if (boardOpen && boardToShow) {
    return (
      <RiviBoardModule
        board={boardToShow}
        onChange={(nextBoard) => {
          if (!activeSpace) return;
          setBoardDraft(nextBoard);
          patchRiviSpace(activeSpace.id, { board: nextBoard });
        }}
        onExit={closeWorkspace}
        documents={boardDocuments}
        chats={boardChats}
        onOpenChat={(chatObjectId) => setOpenChatLinkId(chatObjectId)}
        openChat={openChatObject}
      />
    );
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden rounded-[32px] border border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.9))] shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.38)_1px,transparent_1px)] [background-size:24px_24px]" />
      {!boardOpen ? (
        <aside className="relative z-[2] m-4 flex w-[296px] shrink-0 flex-col rounded-[28px] border border-white/60 bg-white/70 p-4 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">{activeSpace.title}</div>
            <div className="mt-1 text-xs text-slate-500">{activeSpace.description || "Опишите цель пространства и главные маршруты."}</div>
          </div>
          <button
            type="button"
            onClick={closeWorkspace}
            className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-600"
          >
            Галерея
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <button type="button" onClick={addTextObject} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            Добавить блок
          </button>
          <button
            type="button"
            onClick={openBoard}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Доска (Canvas)
          </button>
          <button
            type="button"
            onClick={() => updateZoom(0.1)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Приблизить
          </button>
          <button
            type="button"
            onClick={() => updateZoom(-0.1)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Отдалить
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeSpace) return;
              updateRiviViewport(activeSpace.id, { panX: 0, panY: 0, zoom: 1 });
            }}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Сбросить вид
          </button>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Связи</div>
          <p className="mt-1 text-xs text-slate-600">
            {linkStartId ? "Выбран первый объект. Теперь выделите второй и нажмите кнопку ниже." : "Выберите объект и начните связь."}
          </p>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              disabled={!activeSelectedObject}
              onClick={() => setLinkStartId(activeSelectedObject?.id ?? null)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Начать связь от выбранного
            </button>
            <button
              type="button"
              disabled={!activeSelectedObject || !linkStartId || activeSelectedObject.id === linkStartId}
              onClick={createLinkWithSelected}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Создать связь с выбранным
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Состояние</div>
          <div className="mt-2 space-y-2 text-xs text-slate-600">
            <div>Владелец: @{user.username}</div>
            <div>Зум: {Math.round(activeSpace.viewport.zoom * 100)}%</div>
            <div>Объекты: {activeSpace.objects.length}</div>
            <div>Связи: {activeSpace.connectors.length}</div>
            <div>Обновлено: {formatUpdatedAt(activeSpace.updatedAt)}</div>
          </div>
        </div>

        {activeSelectedObject ? (
          <div className="mt-4 rounded-3xl border border-slate-200 bg-white/80 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Выбран объект</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{activeSelectedObject.title}</div>
              </div>
              <button
                type="button"
                onClick={() => removeObject(activeSelectedObject.id)}
                className="rounded-full px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                Удалить
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {activeSelectedObject.type === "text"
                ? activeSelectedObject.description
                : activeSelectedObject.type === "document"
                  ? `${activeSelectedObject.folderLabel} • ${activeSelectedObject.createdLabel}`
                  : activeSelectedObject.type === "chatLink"
                    ? activeSelectedObject.subtitle || activeSelectedObject.communityName || "Группа Communitoria"
                    : "Базовая фигура на холсте"}
            </p>
            {activeSelectedObject.type === "document" ? (
              <button
                type="button"
                onClick={() => window.open(activeSelectedObject.href, "_blank", "noopener,noreferrer")}
                className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Открыть документ
              </button>
            ) : null}
            {activeSelectedObject.type === "chatLink" ? (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("edumed:florium-navigate-module", { detail: "communitoria" }));
                  navigate("/florium?m=communitoria");
                }}
                className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Перейти в Communitoria
              </button>
            ) : null}
          </div>
        ) : null}
        </aside>
      ) : null}

      <section className="relative z-[1] flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <div
          data-rivi-no-pan="1"
          className="absolute z-[6] rounded-[22px] border border-white/70 bg-white/78 p-2 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur"
          style={{ left: toolbarPos.x, top: toolbarPos.y }}
        >
          <div
            className="mb-2 cursor-move rounded-2xl bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
            onMouseDown={(e) => {
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              if (!rect) return;
              toolbarDragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
            }}
          >
            Инструменты
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleTools.text ? <button type="button" onClick={addTextObject} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Текст</button> : null}
            {visibleTools.rect ? <button type="button" onClick={() => addShapeObject("rect")} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Прямоугольник</button> : null}
            {visibleTools.ellipse ? <button type="button" onClick={() => addShapeObject("ellipse")} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Круг</button> : null}
            {visibleTools.link ? (
              <button
                type="button"
                disabled={!activeSelectedObject}
                onClick={() => setLinkStartId(activeSelectedObject?.id ?? null)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                {linkStyle === "arrow" ? "Стрелка" : "Связь"}
              </button>
            ) : null}
            {visibleTools.cluster ? (
              <button
                type="button"
                disabled={selectedObjects.length < 2}
                onClick={createCluster}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
              >
                Кластер
              </button>
            ) : null}
            <button type="button" onClick={() => setToolbarConfigOpen(true)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              Настроить
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setLinkStyle("solid")} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${linkStyle === "solid" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>Линия</button>
            <button type="button" onClick={() => setLinkStyle("dashed")} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${linkStyle === "dashed" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>Пунктир</button>
            <button type="button" onClick={() => setLinkStyle("arrow")} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${linkStyle === "arrow" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>Стрелка</button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Бесконечное поле</div>
            <div className="mt-1 text-sm text-slate-600">Тяните пустое место для перемещения. Колёсико с Ctrl меняет масштаб.</div>
          </div>
          <div className="rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs text-slate-500 backdrop-blur">
            Пользователь: {user.username}
          </div>
        </div>

        <div
          ref={boardRef}
          className={[
            "relative min-h-0 min-w-0 w-full flex-1 overflow-hidden",
            isPanning ? "select-none [&_*]:cursor-move" : "[&_*]:cursor-move",
            openChatObject ? "grid grid-cols-[minmax(280px,20%)_1fr] gap-3" : "",
          ].join(" ")}
          style={{ cursor: "move" }}
          onMouseMove={onBoardMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            updateZoom(e.deltaY < 0 ? 0.06 : -0.06);
          }}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest("[data-rivi-no-pan='1']")) return;
            if (target?.closest("article")) return;
            dragRef.current = {
              type: "pan",
              startX: e.clientX,
              startY: e.clientY,
              baseX: activeSpace.viewport.panX,
              baseY: activeSpace.viewport.panY,
            };
            setIsPanning(true);
            document.body.style.userSelect = "none";
            setSelectedObjectIds([]);
          }}
        >
          {openChatObject ? (
            <div data-rivi-no-pan="1" className="relative z-[7] m-3 min-h-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white/92 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{openChatObject.title}</div>
                  <div className="truncate text-xs text-slate-500">Чат из пространства Rivi</div>
                </div>
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  onClick={() => setOpenChatLinkId(null)}
                >
                  Закрыть
                </button>
              </div>
              <div className="h-[calc(100%-3.25rem)] min-h-0">
                <CommunitoriaMessagePane
                  chat={{
                    id: openChatObject.chatId,
                    kind: openChatObject.kind === "direct" ? "direct" : "group",
                    title: openChatObject.title,
                    lastMessagePreview: openChatObject.subtitle || "",
                    lastMessageAt: null,
                    unreadCount: 0,
                    communityName: openChatObject.communityName || null,
                  }}
                />
              </div>
            </div>
          ) : null}
          <div
            className={["absolute top-0 h-full min-h-full min-w-full origin-top-left", openChatObject ? "left-[calc(20%+0.75rem)] w-[calc(80%-0.75rem)]" : "left-0 w-full"].join(" ")}
            style={{
              transform: `translate(${activeSpace.viewport.panX}px, ${activeSpace.viewport.panY}px) scale(${activeSpace.viewport.zoom})`,
              cursor: "move",
            }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              {activeSpace.connectors.map((connector) => {
                const from = activeSpace.objects.find((item) => item.id === connector.fromId);
                const to = activeSpace.objects.find((item) => item.id === connector.toId);
                if (!from || !to) return null;
                const a = objectCenter(from);
                const b = objectCenter(to);
                const midX = (a.x + b.x) / 2;
                const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
                return (
                  <g key={connector.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={connector.color}
                      strokeWidth="2"
                      strokeDasharray={connector.style === "dashed" ? "8 6" : undefined}
                      opacity="0.85"
                      markerEnd={connector.style === "arrow" ? "url(#rivi-arrowhead)" : undefined}
                    />
                    {connector.label ? (
                      <text x={midX} y={(a.y + b.y) / 2 - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                        {connector.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <defs>
                <marker id="rivi-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                </marker>
              </defs>
            </svg>

            {activeSpace.objects.length === 0 ? (
              <div className="pointer-events-none absolute left-[20%] top-[24%] rounded-[28px] border border-dashed border-slate-300 bg-white/70 px-8 py-6 text-center text-sm text-slate-500 backdrop-blur">
                Добавьте первый блок, документ или ссылку на чат.
              </div>
            ) : null}

            {activeSpace.objects.map((item) => {
              const hiddenByCollapsedCluster =
                item.type !== "cluster" &&
                activeSpace.objects.some(
                  (candidate) => candidate.type === "cluster" && candidate.collapsed && candidate.childIds.includes(item.id),
                );
              if (hiddenByCollapsedCluster) return null;
              return (
              <article
                key={item.id}
                className={[
                  "absolute rounded-[24px] border shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur transition-shadow",
                  selectedObjectIds.includes(item.id) ? "border-sky-400 ring-2 ring-sky-300/50" : "border-white/70",
                  item.type === "document"
                    ? "bg-amber-50/90"
                    : item.type === "chatLink"
                      ? "bg-emerald-50/90"
                      : item.type === "shape"
                        ? "bg-transparent"
                        : item.type === "cluster"
                          ? "bg-sky-100/15"
                        : "bg-white/92",
                ].join(" ")}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  minHeight: item.h,
                  backgroundColor: item.type === "text" ? item.fill : undefined,
                  borderColor: item.type === "shape" ? item.stroke : undefined,
                  borderRadius: item.type === "shape" && item.shapeKind === "ellipse" ? "9999px" : undefined,
                  outline: item.type === "cluster" ? "1px dashed rgba(56,189,248,0.65)" : undefined,
                  zIndex: item.type === "cluster" ? 0 : 1,
                }}
                onMouseDown={(e) => {
                  const card = e.currentTarget;
                  const rect = card.getBoundingClientRect();
                  dragRef.current = { type: "object", id: item.id, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
                  setSelectedObjectIds((prev) => {
                    if (e.ctrlKey || e.metaKey) {
                      return prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id];
                    }
                    return [item.id];
                  });
                }}
                onDoubleClick={() => {
                  if (item.type === "document") window.open(item.href, "_blank", "noopener,noreferrer");
                  if (item.type === "chatLink") setOpenChatLinkId(item.id);
                }}
              >
                <header
                  className={[
                    "flex cursor-move items-start justify-between gap-2 px-4 py-3",
                    item.type === "shape" || item.type === "cluster"
                      ? "border-b-0 bg-transparent"
                      : "rounded-t-[24px] border-b border-black/5 bg-white/50",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                      {item.type === "text"
                        ? "Текстовый блок"
                        : item.type === "document"
                          ? "Документ EDUMED"
                          : item.type === "cluster"
                            ? "Кластер"
                          : item.type === "shape"
                            ? "Фигура"
                            : "Группа / чат"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-white hover:text-rose-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeObject(item.id);
                    }}
                  >
                    ✕
                  </button>
                  {item.type === "cluster" ? (
                    <button
                      type="button"
                      className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleClusterCollapsed(item.id);
                      }}
                    >
                      {item.collapsed ? "Развернуть" : "Свернуть"}
                    </button>
                  ) : null}
                </header>
                <div
                  className="space-y-3 p-4 text-sm text-slate-700"
                  style={
                    item.type === "shape"
                      ? { backgroundColor: item.fill, borderRadius: item.shapeKind === "ellipse" ? "9999px" : "20px" }
                      : item.type === "cluster"
                        ? { backgroundColor: item.color, borderRadius: "20px" }
                        : undefined
                  }
                >
                  {item.type === "text" ? <p>{item.description}</p> : null}
                  {item.type === "document" ? (
                    <>
                      <p className="text-sm text-slate-700">Папка: {item.folderLabel}</p>
                      <p className="text-xs text-slate-500">
                        {item.mimeType} • {item.createdLabel}
                      </p>
                    </>
                  ) : null}
                  {item.type === "chatLink" ? (
                    <>
                      <p>{item.subtitle || "Связанная группа Communitoria для обсуждения этого пространства."}</p>
                      <p className="text-xs text-slate-500">{item.communityName || "Communitoria"}</p>
                    </>
                  ) : null}
                  {item.type === "shape" ? <p className="text-sm text-slate-700">Базовая фигура на холсте. Можно перемещать и связывать с другими объектами.</p> : null}
                  {item.type === "cluster" ? <p className="text-sm text-slate-700">Смысловая группа из {item.childIds.length} объектов. Состояние: {item.collapsed ? "свернуто" : "развернуто"}.</p> : null}
                </div>
              </article>
            )})}
          </div>
        </div>
      </section>

      {toolbarConfigOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/50 bg-white/92 p-5 shadow-2xl backdrop-blur">
            <div className="text-lg font-semibold text-slate-900">Настройка панели инструментов</div>
            <p className="mt-1 text-sm text-slate-600">Выберите, какие инструменты должны отображаться в плавающей панели.</p>
            <div className="mt-4 space-y-2">
              {[
                ["text", "Текст"],
                ["rect", "Прямоугольник"],
                ["ellipse", "Круг"],
                ["link", "Связи и стрелки"],
                ["cluster", "Кластеры"],
              ].map(([id, label]) => (
                <label key={id} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={visibleTools[id]}
                    onChange={(e) => setVisibleTools((prev) => ({ ...prev, [id]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setToolbarConfigOpen(false)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
