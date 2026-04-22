import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  RiviBoardBackgroundKind,
  RiviBoardChatBlockElement,
  RiviBoardConnectorElement,
  RiviBoardDocumentCardElement,
  RiviBoardElement,
  RiviBoardFreeLineElement,
  RiviBoardShapeElement,
  RiviBoardShapeKind,
  RiviBoardState,
  RiviBoardStrokeElement,
  RiviBoardTextElement,
  RiviChatLinkObject,
  RiviDocumentObject,
} from "./riviStorage";
import { CommunitoriaMessagePane } from "./CommunitoriaMessagePane";

type ToolId =
  | "select"
  | "pencil"
  | "marker"
  | "airbrush"
  | "eraser"
  | "pipette"
  | "text"
  | "shape"
  | "connector"
  | "document"
  | "chat"
  | "cluster";

type ToolbarTool = {
  id: ToolId;
  label: string;
};

type Snapshot = { elements: RiviBoardElement[]; width: number; height: number };
type PendingDocument = { file: File; title: string; href: string; mimeType: string; icon: string };

type SelectionBox = { x: number; y: number; w: number; h: number } | null;

type Interaction =
  | { type: "idle" }
  | { type: "pan"; startX: number; startY: number; basePanX: number; basePanY: number }
  | { type: "move"; ids: string[]; startX: number; startY: number; base: Map<string, RiviBoardElement> }
  | { type: "resize"; id: string; startX: number; startY: number; base: RiviBoardShapeElement | RiviBoardTextElement | RiviBoardDocumentCardElement | RiviBoardChatBlockElement }
  | { type: "movePoint"; id: string; pointIndex: number; base: RiviBoardFreeLineElement }
  | { type: "selectBox"; startX: number; startY: number; currentX: number; currentY: number }
  | { type: "drawShape"; startX: number; startY: number }
  | { type: "drawStroke"; points: Array<{ x: number; y: number }> }
  | { type: "drawFreeLine"; points: Array<{ x: number; y: number }> };

const TOOLBAR_KEY = "edumed.rivi.toolbar.v2";
const DEFAULT_TOOLS: ToolbarTool[] = [
  { id: "select", label: "Указатель" },
  { id: "pencil", label: "Карандаш" },
  { id: "marker", label: "Маркер" },
  { id: "airbrush", label: "Аэрограф" },
  { id: "eraser", label: "Ластик" },
  { id: "pipette", label: "Пипетка" },
  { id: "text", label: "Текст" },
  { id: "shape", label: "Фигура" },
  { id: "connector", label: "Связь" },
  { id: "document", label: "Документ" },
  { id: "chat", label: "Чат" },
  { id: "cluster", label: "Кластер" },
];
const PALETTE_COLORS = ["#111827", "#2563eb", "#3b82f6", "#06b6d4", "#22c55e", "#84cc16", "#facc15", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#e2e8f0"];
const ORB_SIZE = 44;
const SHAPE_OPTIONS: Array<{ kind: RiviBoardShapeKind; label: string; icon: string }> = [
  { kind: "rect", label: "Прямоугольник", icon: "▭" },
  { kind: "roundRect", label: "Скруглённый", icon: "▢" },
  { kind: "ellipse", label: "Эллипс", icon: "◯" },
  { kind: "diamond", label: "Ромб", icon: "◇" },
  { kind: "cloud", label: "Облако", icon: "☁" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return { x: left, y: top, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

function getCssRect(el: HTMLElement | null) {
  return el?.getBoundingClientRect() ?? null;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function zoomViewport(viewport: RiviBoardState["viewport"], delta: number) {
  return { ...viewport, zoom: clamp(viewport.zoom + delta, 0.4, 1.8) };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function documentIcon(mimeType: string, fileName: string) {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) return "PDF";
  if (lowerMime.includes("image/")) return "IMG";
  if (lowerMime.includes("sheet") || lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) return "XLS";
  if (lowerMime.includes("presentation") || lowerName.endsWith(".ppt") || lowerName.endsWith(".pptx")) return "PPT";
  return "DOC";
}

function loadToolbarState() {
  try {
    const raw = localStorage.getItem(TOOLBAR_KEY);
    if (!raw) return DEFAULT_TOOLS;
    const parsed = JSON.parse(raw) as Array<{ id: ToolId; label: string; visible?: boolean }>;
    const byId = new Map(DEFAULT_TOOLS.map((tool) => [tool.id, tool]));
    const ordered = parsed
      .map((item) => byId.get(item.id))
      .filter((item): item is ToolbarTool => item != null);
    const rest = DEFAULT_TOOLS.filter((item) => !ordered.some((candidate) => candidate.id === item.id));
    return [...ordered, ...rest];
  } catch {
    return DEFAULT_TOOLS;
  }
}

function saveToolbarState(tools: ToolbarTool[], visibleTools: Record<ToolId, boolean>) {
  try {
    localStorage.setItem(TOOLBAR_KEY, JSON.stringify(tools.map((tool) => ({ ...tool, visible: visibleTools[tool.id] }))));
  } catch {
    // ignore
  }
}

function getElementBounds(el: RiviBoardElement) {
  if (el.kind === "shape" || el.kind === "textBlock" || el.kind === "documentCard" || el.kind === "chatBlock") return { x: el.x, y: el.y, w: el.w, h: el.h };
  if (el.kind === "freeLine" || el.kind === "stroke") {
    const xs = el.points.map((point) => point.x);
    const ys = el.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

function boundsCenter(bounds: { x: number; y: number; w: number; h: number }) {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

function pointInBounds(wx: number, wy: number, bounds: { x: number; y: number; w: number; h: number }) {
  return wx >= bounds.x && wx <= bounds.x + bounds.w && wy >= bounds.y && wy <= bounds.y + bounds.h;
}

function rectIntersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function updateElementPosition(el: RiviBoardElement, dx: number, dy: number): RiviBoardElement {
  if (el.kind === "shape" || el.kind === "textBlock" || el.kind === "documentCard" || el.kind === "chatBlock") return { ...el, x: el.x + dx, y: el.y + dy };
  if (el.kind === "freeLine" || el.kind === "stroke") return { ...el, points: el.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  return el;
}

function nearestFreeLinePoint(el: RiviBoardFreeLineElement, wx: number, wy: number, tolerance = 10) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < el.points.length; index += 1) {
    const point = el.points[index]!;
    const distance = Math.hypot(point.x - wx, point.y - wy);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestDistance <= tolerance ? nearestIndex : -1;
}

function anchorPoint(bounds: { x: number; y: number; w: number; h: number }, target: { x: number; y: number }) {
  const center = boundsCenter(bounds);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      x: dx >= 0 ? bounds.x + bounds.w : bounds.x,
      y: clamp(target.y, bounds.y + 10, bounds.y + bounds.h - 10),
    };
  }
  return {
    x: clamp(target.x, bounds.x + 10, bounds.x + bounds.w - 10),
    y: dy >= 0 ? bounds.y + bounds.h : bounds.y,
  };
}

function nearestColorFromElement(el: RiviBoardElement) {
  if (el.kind === "shape") return { primary: el.stroke, secondary: el.fill };
  if (el.kind === "textBlock") return { primary: el.color, secondary: el.fill };
  if (el.kind === "documentCard") return { primary: el.stroke, secondary: el.fill };
  if (el.kind === "chatBlock") return { primary: el.stroke, secondary: el.fill };
  if (el.kind === "freeLine" || el.kind === "stroke") return { primary: el.color, secondary: null };
  if (el.kind === "connector") return { primary: el.stroke, secondary: null };
  return { primary: "#1d4ed8", secondary: null };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(w, h) / 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y + h * 0.65);
  ctx.bezierCurveTo(x, y + h * 0.65, x, y + h * 0.3, x + w * 0.2, y + h * 0.3);
  ctx.bezierCurveTo(x + w * 0.22, y + h * 0.08, x + w * 0.45, y + h * 0.08, x + w * 0.52, y + h * 0.28);
  ctx.bezierCurveTo(x + w * 0.63, y + h * 0.1, x + w * 0.9, y + h * 0.2, x + w * 0.88, y + h * 0.46);
  ctx.bezierCurveTo(x + w, y + h * 0.48, x + w, y + h * 0.76, x + w * 0.82, y + h * 0.78);
  ctx.lineTo(x + w * 0.18, y + h * 0.78);
  ctx.bezierCurveTo(x + w * 0.08, y + h * 0.78, x + w * 0.04, y + h * 0.74, x + r, y + h * 0.65);
  ctx.closePath();
}

function drawShapePath(ctx: CanvasRenderingContext2D, el: RiviBoardShapeElement) {
  if (el.shapeKind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (el.shapeKind === "roundRect") {
    drawRoundedRect(ctx, el.x, el.y, el.w, el.h, 18);
    return;
  }
  if (el.shapeKind === "diamond") {
    drawDiamond(ctx, el.x, el.y, el.w, el.h);
    return;
  }
  if (el.shapeKind === "cloud") {
    drawCloud(ctx, el.x, el.y, el.w, el.h);
    return;
  }
  ctx.beginPath();
  ctx.rect(el.x, el.y, el.w, el.h);
  ctx.closePath();
}

function toolCursor(tool: ToolId) {
  if (tool === "pipette") return "copy";
  if (tool === "select") return "default";
  return "crosshair";
}

export function RiviBoardModule({
  board,
  onChange,
  onExit,
  documents: _documents,
  chats,
  onOpenChat,
  openChat,
}: {
  board: RiviBoardState;
  onChange: (next: RiviBoardState) => void;
  onExit: () => void;
  documents: RiviDocumentObject[];
  chats: RiviChatLinkObject[];
  onOpenChat: (chatId: string) => void;
  openChat: RiviChatLinkObject | null;
}) {
  const [draft, setDraft] = useState(board);
  const draftRef = useRef(draft);
  const [tool, setTool] = useState<ToolId>("select");
  const [shapeKind, setShapeKind] = useState<RiviBoardShapeKind>("rect");
  const [shapeDash, setShapeDash] = useState<"solid" | "dashed">("solid");
  const [bgKind, setBgKind] = useState<RiviBoardBackgroundKind>(board.backgroundKind);
  const [color1, setColor1] = useState("#2563eb");
  const [color2, setColor2] = useState("rgba(219,234,254,0.65)");
  const [thickness, setThickness] = useState(4);
  const [opacity, setOpacity] = useState(0.9);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox>(null);
  const [connectorStartId, setConnectorStartId] = useState<string | null>(null);
  const [toolbarTools, setToolbarTools] = useState<ToolbarTool[]>(() => loadToolbarState());
  const [visibleTools, setVisibleTools] = useState<Record<ToolId, boolean>>({
    select: true,
    pencil: true,
    marker: true,
    airbrush: true,
    eraser: true,
    pipette: true,
    text: true,
    shape: true,
    connector: true,
    document: true,
    chat: true,
    cluster: true,
  });
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 20, y: 22 });
  const [toolbarDragging, setToolbarDragging] = useState(false);
  const toolbarDragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [canvasCssSize, setCanvasCssSize] = useState({ w: 800, h: 600 });
  const [clusterCollapsedIds, setClusterCollapsedIds] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [paletteAnchorPos, setPaletteAnchorPos] = useState({ x: 120, y: 120 });
  const interactionRef = useRef<Interaction>({ type: "idle" });
  const previewRef = useRef<RiviBoardElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orbRef = useRef<HTMLButtonElement | null>(null);
  const pointerPreviewRef = useRef<HTMLDivElement | null>(null);
  const liveViewportRef = useRef(board.viewport);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const orbRawCursorRef = useRef<{ x: number; y: number } | null>(null);
  const orbSmoothCursorRef = useRef<{ x: number; y: number } | null>(null);
  const orbPosRef = useRef({ x: 120, y: 120 });
  const orbFloatStartRef = useRef<number | null>(null);

  useEffect(() => {
    draftRef.current = draft;
    liveViewportRef.current = draft.viewport;
  }, [draft]);

  useEffect(() => {
    setDraft(board);
    setBgKind(board.backgroundKind);
  }, [board.id, board.updatedAt]);

  useEffect(() => {
    saveToolbarState(toolbarTools, visibleTools);
  }, [toolbarTools, visibleTools]);

  useEffect(() => {
    if (!openChat && chats.length) onOpenChat(chats[0]!.id);
  }, [openChat, chats, onOpenChat]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setIsSpaceDown(true);
      }
      const mod = navigator.platform.toLowerCase().includes("mac") ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const last = undoRef.current.pop();
        if (!last) return;
        redoRef.current.push({ elements: draftRef.current.elements, width: draftRef.current.width, height: draftRef.current.height });
        const next = { ...draftRef.current, elements: last.elements, width: last.width, height: last.height, updatedAt: new Date().toISOString() };
        setDraft(next);
        persist(next);
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        const last = redoRef.current.pop();
        if (!last) return;
        undoRef.current.push({ elements: draftRef.current.elements, width: draftRef.current.width, height: draftRef.current.height });
        const next = { ...draftRef.current, elements: last.elements, width: last.width, height: last.height, updatedAt: new Date().toISOString() };
        setDraft(next);
        persist(next);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedIds.length) return;
        const nextElements = draftRef.current.elements.filter((item) => !selectedIds.includes(item.id) && !(item.kind === "connector" && (selectedIds.includes(item.fromId) || selectedIds.includes(item.toId))));
        commit({ ...draftRef.current, elements: nextElements, updatedAt: new Date().toISOString() });
        setSelectedIds([]);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setIsSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [selectedIds]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setCanvasCssSize({ w: Math.max(1, Math.floor(rect.width)), h: Math.max(1, Math.floor(rect.height)) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || paletteOpen) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      orbRawCursorRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [paletteOpen]);

  useEffect(() => {
    if (paletteOpen) return;
    let raf = 0;
    const tick = (now: number) => {
      if (orbFloatStartRef.current == null) orbFloatStartRef.current = now;
      const raw = orbRawCursorRef.current;
      const smooth = orbSmoothCursorRef.current;
      if (raw && smooth) {
        smooth.x += (raw.x - smooth.x) * 0.08;
        smooth.y += (raw.y - smooth.y) * 0.08;
      } else if (raw) {
        orbSmoothCursorRef.current = { ...raw };
      }
      const current = orbSmoothCursorRef.current;
      if (current) {
        const t = (now - (orbFloatStartRef.current ?? now)) / 1000;
        const fx = Math.sin(t * 1.2) * 10;
        const fy = Math.cos(t * 1.7) * 8;
        const rect = getCssRect(wrapperRef.current);
        if (rect) {
          setOrbVisualPosition(
            clamp(current.x + 28 + fx, 18, rect.width - ORB_SIZE - 18),
            clamp(current.y + 20 + fy, 18, rect.height - ORB_SIZE - 18),
          );
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [paletteOpen]);

  useEffect(() => {
    if (canvasCssSize.w <= 1 || canvasCssSize.h <= 1) return;
    const id = window.setTimeout(() => fitToScreen(), 0);
    return () => window.clearTimeout(id);
  }, [board.id, canvasCssSize.w, canvasCssSize.h, openChat?.id]);

  function persist(next: RiviBoardState) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => onChange(next), 250);
  }

  function commit(next: RiviBoardState, snapshot?: Snapshot) {
    undoRef.current.push(snapshot ?? { elements: draftRef.current.elements, width: draftRef.current.width, height: draftRef.current.height });
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
    previewRef.current = null;
    setDraft(next);
    persist(next);
  }

  function fitToScreen() {
    const cur = draftRef.current;
    const z = clamp(Math.min(canvasCssSize.w / cur.width, canvasCssSize.h / cur.height), 0.25, 1.6);
    const panX = Math.round((canvasCssSize.w - cur.width * z) / 2);
    const panY = Math.round((canvasCssSize.h - cur.height * z) / 2);
    const next = { ...cur, viewport: { ...cur.viewport, panX, panY, zoom: z }, updatedAt: new Date().toISOString() };
    liveViewportRef.current = next.viewport;
    setDraft(next);
    persist(next);
  }

  function worldToScreen(wx: number, wy: number) {
    const viewport = liveViewportRef.current;
    return { sx: viewport.panX + wx * viewport.zoom, sy: viewport.panY + wy * viewport.zoom };
  }

  function screenToWorld(sx: number, sy: number) {
    const viewport = liveViewportRef.current;
    return { wx: (sx - viewport.panX) / viewport.zoom, wy: (sy - viewport.panY) / viewport.zoom };
  }

  function getPointerLocal(e: { clientX: number; clientY: number }) {
    const rect = getCssRect(wrapperRef.current);
    if (!rect) return { sx: 0, sy: 0 };
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  const selectedElements = useMemo(() => draft.elements.filter((item) => selectedIds.includes(item.id)), [draft.elements, selectedIds]);
  const activeSelectedElement = useMemo(() => draft.elements.find((item) => item.id === selectedIds[0]) ?? null, [draft.elements, selectedIds]);

  function togglePalette() {
    setPaletteAnchorPos(orbPosRef.current);
    setPaletteOpen((prev) => !prev);
  }

  function addShapeAtCenter(nextShapeKind: RiviBoardShapeKind) {
    const center = screenToWorld(canvasCssSize.w / 2, canvasCssSize.h / 2);
    setShapeKind(nextShapeKind);
    const element = createShapeElement(center.wx - 80, center.wy - 52, 160, 104);
    element.shapeKind = nextShapeKind;
    commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
    setSelectedIds([element.id]);
    setTool("select");
    setShapePickerOpen(false);
  }

  function addDocumentCard(input: { title: string; href: string; mimeType: string; icon: string }) {
    const center = screenToWorld(canvasCssSize.w / 2, canvasCssSize.h / 2);
    const element: RiviBoardDocumentCardElement = {
      id: makeId("doc"),
      kind: "documentCard",
      x: center.wx - 140,
      y: center.wy - 64,
      w: 280,
      h: 128,
      title: input.title,
      subtitle: `Локальный файл • ${input.mimeType || "application/octet-stream"}`,
      documentId: makeId("local-doc"),
      href: input.href,
      icon: input.icon,
      fill: "rgba(255,248,220,0.96)",
      stroke: "#f59e0b",
    };
    commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
    setSelectedIds([element.id]);
    setTool("select");
  }

  function setOrbVisualPosition(x: number, y: number) {
    orbPosRef.current = { x, y };
    const orb = orbRef.current;
    if (!orb) return;
    orb.style.left = `${x}px`;
    orb.style.top = `${y}px`;
  }

  function updatePointerPreviewVisual(sx: number, sy: number) {
    const el = pointerPreviewRef.current;
    if (!el) return;
    if (tool !== "marker" && tool !== "airbrush" && tool !== "eraser") {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.left = `${sx - thickness / 2}px`;
    el.style.top = `${sy - thickness / 2}px`;
    el.style.width = `${thickness}px`;
    el.style.height = `${thickness}px`;
    el.style.border = `2px solid ${tool === "eraser" ? "#475569" : color1}`;
    el.style.background = tool === "airbrush" ? `${color1}22` : tool === "eraser" ? "#ffffff" : "transparent";
  }

  function hitTestElement(wx: number, wy: number) {
    for (let index = draft.elements.length - 1; index >= 0; index -= 1) {
      const el = draft.elements[index]!;
      if (el.kind === "connector") continue;
      const bounds = getElementBounds(el);
      if (pointInBounds(wx, wy, bounds)) return el.id;
    }
    return null;
  }

  function hitResizeHandle(wx: number, wy: number) {
    if (selectedIds.length !== 1) return null;
    const selected = draft.elements.find((item) => item.id === selectedIds[0]);
    if (!selected || (selected.kind !== "shape" && selected.kind !== "textBlock" && selected.kind !== "documentCard" && selected.kind !== "chatBlock")) return null;
    const handle = { x: selected.x + selected.w, y: selected.y + selected.h };
    return Math.hypot(handle.x - wx, handle.y - wy) <= 12 ? selected : null;
  }

  function createShapeElement(x: number, y: number, w: number, h: number): RiviBoardShapeElement {
    return {
      id: makeId("el"),
      kind: "shape",
      shapeKind,
      x,
      y,
      w: Math.max(24, w),
      h: Math.max(24, h),
      title: "Фигура",
      description: "",
      fill: color2,
      stroke: color1,
      strokeWidth: thickness,
      dash: shapeDash === "dashed" ? [10, 6] : undefined,
      shadow: true,
    };
  }

  function createTextElement(x: number, y: number): RiviBoardTextElement {
    return {
      id: makeId("text"),
      kind: "textBlock",
      x,
      y,
      w: 240,
      h: 130,
      title: "Текст",
      text: "Новый текстовый блок",
      color: color1,
      fontSize: 18,
      fontFamily: "system-ui",
      fontWeight: "regular",
      fontStyle: "normal",
      align: "left",
      fill: color2,
    };
  }

  function createChatBlock(x: number, y: number): RiviBoardChatBlockElement {
    const chat = chats[0];
    return {
      id: makeId("chat"),
      kind: "chatBlock",
      x,
      y,
      w: 280,
      h: 128,
      title: chat?.title ?? "Чат проекта",
      subtitle: chat?.subtitle ?? "Связанный чат Communitoria",
      chatId: chat?.chatId ?? "unbound-chat",
      communityName: chat?.communityName ?? "Communitoria",
      fill: "rgba(236,253,245,0.96)",
      stroke: "#10b981",
    };
  }

  function createStroke(kind: "marker" | "airbrush", points: Array<{ x: number; y: number }>, erase = false): RiviBoardStrokeElement {
    return {
      id: makeId("stroke"),
      kind: "stroke",
      erase,
      brushKind: kind,
      layerId: "drawing",
      points,
      color: color1,
      width: thickness,
      opacity,
    };
  }

  function createFreeLine(points: Array<{ x: number; y: number }>): RiviBoardFreeLineElement {
    return {
      id: makeId("line"),
      kind: "freeLine",
      points,
      color: color1,
      width: thickness,
      opacity,
      dash: shapeDash === "dashed" ? [10, 6] : undefined,
    };
  }

  function connectorGeometry(el: RiviBoardConnectorElement) {
    const from = draft.elements.find((item) => item.id === el.fromId);
    const to = draft.elements.find((item) => item.id === el.toId);
    if (!from || !to) return null;
    const fromBounds = getElementBounds(from);
    const toBounds = getElementBounds(to);
    const a = anchorPoint(fromBounds, boundsCenter(toBounds));
    const b = anchorPoint(toBounds, boundsCenter(fromBounds));
    const midX = (a.x + b.x) / 2;
    if (el.lineKind === "orthogonal") {
      return { points: [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b] };
    }
    return { points: [a, b] };
  }

  function drawElements(ctx: CanvasRenderingContext2D, els: RiviBoardElement[]) {
    const viewport = liveViewportRef.current;
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    const collapsedChildren = new Set(
      els
        .filter((item): item is RiviBoardShapeElement => item.kind === "shape" && item.description.startsWith("cluster:"))
        .filter((item) => clusterCollapsedIds.includes(item.id))
        .flatMap((item) => item.description.replace("cluster:", "").split(",").filter(Boolean)),
    );
    for (const el of els) {
      if (collapsedChildren.has(el.id)) continue;
      if (el.kind === "connector") {
        if (collapsedChildren.has(el.fromId) || collapsedChildren.has(el.toId)) continue;
        const geometry = connectorGeometry(el);
        if (!geometry) continue;
        ctx.save();
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.setLineDash(el.dash ?? []);
        ctx.beginPath();
        geometry.points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
        const mid = geometry.points[Math.floor(geometry.points.length / 2)]!;
        if (el.label) {
          ctx.fillStyle = "#334155";
          ctx.font = "12px system-ui";
          ctx.fillText(el.label, mid.x + 4, mid.y - 6);
        }
        if (el.arrow !== "none") {
          const last = geometry.points[geometry.points.length - 1]!;
          const prev = geometry.points[geometry.points.length - 2]!;
          const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
          ctx.save();
          ctx.translate(last.x, last.y);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-10, -5);
          ctx.lineTo(-10, 5);
          ctx.closePath();
          ctx.fillStyle = el.stroke;
          ctx.fill();
          ctx.restore();
        }
        if (el.arrow === "both") {
          const first = geometry.points[0]!;
          const second = geometry.points[1]!;
          const angle = Math.atan2(first.y - second.y, first.x - second.x);
          ctx.save();
          ctx.translate(first.x, first.y);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-10, -5);
          ctx.lineTo(-10, 5);
          ctx.closePath();
          ctx.fillStyle = el.stroke;
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        continue;
      }

      if (el.kind === "stroke") {
        ctx.save();
        ctx.globalCompositeOperation = el.erase ? "destination-out" : "source-over";
        ctx.globalAlpha = el.opacity;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        if (el.brushKind === "airbrush") {
          ctx.fillStyle = el.color;
          for (const point of el.points) {
            for (let i = 0; i < 8; i += 1) {
              const angle = (Math.PI * 2 * i) / 8;
              const radius = el.width * 0.55;
              ctx.globalAlpha = el.opacity * 0.12;
              ctx.beginPath();
              ctx.arc(point.x + Math.cos(angle) * radius * Math.random(), point.y + Math.sin(angle) * radius * Math.random(), Math.max(1, el.width * 0.18), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0]!.x, el.points[0]!.y);
          for (let i = 1; i < el.points.length; i += 1) ctx.lineTo(el.points[i]!.x, el.points[i]!.y);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      if (el.kind === "freeLine") {
        if (el.points.length < 2) continue;
        ctx.save();
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.globalAlpha = el.opacity;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash(el.dash ?? []);
        ctx.beginPath();
        ctx.moveTo(el.points[0]!.x, el.points[0]!.y);
        for (let i = 1; i < el.points.length; i += 1) {
          const prev = el.points[i - 1]!;
          const current = el.points[i]!;
          const midX = (prev.x + current.x) / 2;
          const midY = (prev.y + current.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        const last = el.points[el.points.length - 1]!;
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (el.kind === "shape") {
        ctx.save();
        if (el.shadow) {
          ctx.shadowColor = "rgba(15,23,42,0.14)";
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 6;
        }
        drawShapePath(ctx, el);
        ctx.fillStyle = el.fill;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.strokeWidth;
        ctx.setLineDash(el.dash ?? []);
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 14px system-ui";
        ctx.fillText(el.title, el.x + 14, el.y + 14);
        if (el.description) {
          ctx.font = "12px system-ui";
          ctx.fillStyle = "#475569";
          ctx.fillText(el.description, el.x + 14, el.y + 36);
        }
        ctx.restore();
        continue;
      }

      if (el.kind === "textBlock") {
        ctx.save();
        drawRoundedRect(ctx, el.x, el.y, el.w, el.h, 18);
        ctx.fillStyle = el.fill;
        ctx.fill();
        ctx.strokeStyle = "rgba(148,163,184,0.35)";
        ctx.stroke();
        ctx.fillStyle = el.color;
        ctx.font = `${el.fontStyle === "italic" ? "italic " : ""}${el.fontWeight === "bold" ? "700 " : "500 "}${el.fontSize}px ${el.fontFamily}`;
        ctx.textBaseline = "top";
        ctx.fillText(el.title, el.x + 14, el.y + 12);
        ctx.font = `400 ${Math.max(12, el.fontSize - 2)}px ${el.fontFamily}`;
        ctx.fillText(el.text, el.x + 14, el.y + 40, el.w - 28);
        ctx.restore();
        continue;
      }

      if (el.kind === "chatBlock") {
        ctx.save();
        drawRoundedRect(ctx, el.x, el.y, el.w, el.h, 20);
        ctx.fillStyle = el.fill;
        ctx.fill();
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#047857";
        ctx.font = "700 14px system-ui";
        ctx.fillText("CHAT", el.x + 16, el.y + 18);
        ctx.fillStyle = "#0f172a";
        ctx.fillText(el.title, el.x + 16, el.y + 44);
        ctx.font = "12px system-ui";
        ctx.fillStyle = "#475569";
        ctx.fillText(el.communityName, el.x + 16, el.y + 68);
        ctx.fillText(el.subtitle, el.x + 16, el.y + 88, el.w - 32);
        ctx.restore();
        continue;
      }

      ctx.save();
      drawRoundedRect(ctx, el.x, el.y, el.w, el.h, 20);
      ctx.fillStyle = el.fill;
      ctx.fill();
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.font = "700 14px system-ui";
      ctx.fillText(el.icon, el.x + 16, el.y + 18);
      ctx.fillText(el.title, el.x + 16, el.y + 44);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#475569";
      ctx.fillText(el.subtitle, el.x + 16, el.y + 68, el.w - 32);
      ctx.restore();
    }
    ctx.restore();
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(canvasCssSize.w * dpr) || canvas.height !== Math.floor(canvasCssSize.h * dpr)) {
      canvas.width = Math.floor(canvasCssSize.w * dpr);
      canvas.height = Math.floor(canvasCssSize.h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasCssSize.w, canvasCssSize.h);

    const viewport = liveViewportRef.current;
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    const worldLeft = (-viewport.panX) / viewport.zoom;
    const worldTop = (-viewport.panY) / viewport.zoom;
    const worldRight = (canvasCssSize.w - viewport.panX) / viewport.zoom;
    const worldBottom = (canvasCssSize.h - viewport.panY) / viewport.zoom;
    if (bgKind === "pixels") {
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      const startX = Math.floor(worldLeft / 8) * 8 - 16;
      const endX = Math.ceil(worldRight / 8) * 8 + 16;
      const startY = Math.floor(worldTop / 8) * 8 - 16;
      const endY = Math.ceil(worldBottom / 8) * 8 + 16;
      for (let x = startX; x <= endX; x += 8) for (let y = startY; y <= endY; y += 8) ctx.fillRect(x, y, 1, 1);
    } else if (bgKind === "grid") {
      ctx.strokeStyle = "rgba(148,163,184,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = Math.floor(worldLeft / 32) * 32 - 32;
      const endX = Math.ceil(worldRight / 32) * 32 + 32;
      const startY = Math.floor(worldTop / 32) * 32 - 32;
      const endY = Math.ceil(worldBottom / 32) * 32 + 32;
      for (let x = startX; x <= endX; x += 32) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = startY; y <= endY; y += 32) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(148,163,184,0.25)";
      const startX = Math.floor(worldLeft / 20) * 20 - 20;
      const endX = Math.ceil(worldRight / 20) * 20 + 20;
      const startY = Math.floor(worldTop / 20) * 20 - 20;
      const endY = Math.ceil(worldBottom / 20) * 20 + 20;
      for (let x = startX; x <= endX; x += 20) for (let y = startY; y <= endY; y += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    drawElements(ctx, draft.elements);
    if (previewRef.current) drawElements(ctx, [previewRef.current]);

    for (const id of selectedIds) {
      const el = draft.elements.find((item) => item.id === id);
      if (!el || el.kind === "connector") continue;
      const bounds = getElementBounds(el);
      const a = worldToScreen(bounds.x, bounds.y);
      const b = worldToScreen(bounds.x + bounds.w, bounds.y + bounds.h);
      ctx.save();
      ctx.strokeStyle = "rgba(37,99,235,0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      if (el.kind === "freeLine") {
        el.points.forEach((point) => {
          const p = worldToScreen(point.x, point.y);
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#2563eb";
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      if (el.kind === "shape" || el.kind === "textBlock" || el.kind === "documentCard" || el.kind === "chatBlock") {
        const handle = worldToScreen(bounds.x + bounds.w, bounds.y + bounds.h);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#2563eb";
        ctx.setLineDash([]);
        ctx.fillRect(handle.sx - 5, handle.sy - 5, 10, 10);
        ctx.strokeRect(handle.sx - 5, handle.sy - 5, 10, 10);
      }
      ctx.restore();
    }

    if (selectionBox) {
      const a = worldToScreen(selectionBox.x, selectionBox.y);
      const b = worldToScreen(selectionBox.x + selectionBox.w, selectionBox.y + selectionBox.h);
      ctx.save();
      ctx.fillStyle = "rgba(37,99,235,0.08)";
      ctx.strokeStyle = "rgba(37,99,235,0.75)";
      ctx.setLineDash([6, 4]);
      ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      ctx.restore();
    }
  }

  useEffect(() => {
    draw();
  }, [draft, bgKind, selectedIds, selectionBox, canvasCssSize.w, canvasCssSize.h]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (toolbarDragging) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const { sx, sy } = getPointerLocal(e);
    const { wx, wy } = screenToWorld(sx, sy);
    const hitId = hitTestElement(wx, wy);
    const resizeTarget = hitResizeHandle(wx, wy);

    if (isSpaceDown || e.button === 1) {
      interactionRef.current = { type: "pan", startX: sx, startY: sy, basePanX: draft.viewport.panX, basePanY: draft.viewport.panY };
      return;
    }

    if (tool === "pipette") {
      if (!hitId) return;
      const hit = draft.elements.find((item) => item.id === hitId);
      if (!hit) return;
      const colors = nearestColorFromElement(hit);
      setColor1(colors.primary);
      if (colors.secondary) setColor2(colors.secondary);
      setTool("select");
      return;
    }

    if (tool === "document") return;

    if (tool === "chat") {
      const element = createChatBlock(wx, wy);
      commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
      setSelectedIds([element.id]);
      setTool("select");
      return;
    }

    if (tool === "text") {
      const element = createTextElement(wx, wy);
      commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
      setSelectedIds([element.id]);
      setTool("select");
      return;
    }

    if (tool === "connector") {
      if (!hitId) return;
      if (!connectorStartId) {
        setConnectorStartId(hitId);
        setSelectedIds([hitId]);
        return;
      }
      if (connectorStartId !== hitId) {
        const connector: RiviBoardConnectorElement = {
          id: makeId("connector"),
          kind: "connector",
          fromId: connectorStartId,
          toId: hitId,
          lineKind: "straight",
          arrow: "end",
          stroke: color1,
          strokeWidth: thickness,
          dash: shapeDash === "dashed" ? [10, 6] : undefined,
          label: "",
        };
        commit({ ...draftRef.current, elements: [...draftRef.current.elements, connector], updatedAt: new Date().toISOString() });
      }
      setConnectorStartId(null);
      setTool("select");
      return;
    }

    if (tool === "cluster") {
      if (selectedElements.length < 2) return;
      const xs = selectedElements.map((item) => getElementBounds(item).x);
      const ys = selectedElements.map((item) => getElementBounds(item).y);
      const rights = selectedElements.map((item) => {
        const bounds = getElementBounds(item);
        return bounds.x + bounds.w;
      });
      const bottoms = selectedElements.map((item) => {
        const bounds = getElementBounds(item);
        return bounds.y + bounds.h;
      });
      const cluster = createShapeElement(Math.min(...xs) - 30, Math.min(...ys) - 34, Math.max(...rights) - Math.min(...xs) + 60, Math.max(...bottoms) - Math.min(...ys) + 68);
      cluster.shapeKind = "roundRect";
      cluster.title = "Кластер";
      cluster.fill = "rgba(125,211,252,0.16)";
      cluster.description = `cluster:${selectedElements.map((item) => item.id).join(",")}`;
      commit({ ...draftRef.current, elements: [cluster, ...draftRef.current.elements], updatedAt: new Date().toISOString() });
      setTool("select");
      return;
    }

    if (tool === "shape") {
      interactionRef.current = { type: "drawShape", startX: wx, startY: wy };
      return;
    }

    if (tool === "marker" || tool === "airbrush" || tool === "eraser") {
      interactionRef.current = { type: "drawStroke", points: [{ x: wx, y: wy }] };
      return;
    }

    if (tool === "pencil") {
      interactionRef.current = { type: "drawFreeLine", points: [{ x: wx, y: wy }] };
      return;
    }

    if (tool === "select") {
      if (resizeTarget) {
        interactionRef.current = { type: "resize", id: resizeTarget.id, startX: wx, startY: wy, base: resizeTarget };
        setSelectedIds([resizeTarget.id]);
        return;
      }

      if (hitId) {
        const freeLine = draft.elements.find((item) => item.id === hitId);
        if (freeLine?.kind === "freeLine") {
          const pointIndex = nearestFreeLinePoint(freeLine, wx, wy);
          if (pointIndex >= 0) {
            interactionRef.current = { type: "movePoint", id: freeLine.id, pointIndex, base: freeLine };
            setSelectedIds([freeLine.id]);
            return;
          }
        }
      }

      if (hitId) {
        const nextSelection = e.shiftKey || e.ctrlKey || e.metaKey ? (selectedIds.includes(hitId) ? selectedIds.filter((id) => id !== hitId) : [...selectedIds, hitId]) : [hitId];
        setSelectedIds(nextSelection);
        const base = new Map<string, RiviBoardElement>();
        for (const id of nextSelection) {
          const item = draft.elements.find((candidate) => candidate.id === id);
          if (item) base.set(id, item);
        }
        interactionRef.current = { type: "move", ids: nextSelection, startX: wx, startY: wy, base };
        return;
      }

      if (!e.shiftKey) {
        setSelectedIds([]);
        interactionRef.current = { type: "pan", startX: sx, startY: sy, basePanX: liveViewportRef.current.panX, basePanY: liveViewportRef.current.panY };
        return;
      }

      setSelectedIds([]);
      setSelectionBox({ x: wx, y: wy, w: 0, h: 0 });
      interactionRef.current = { type: "selectBox", startX: wx, startY: wy, currentX: wx, currentY: wy };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const { sx, sy } = getPointerLocal(e);
    updatePointerPreviewVisual(sx, sy);
    const { wx, wy } = screenToWorld(sx, sy);
    const current = interactionRef.current;

    if (current.type === "pan") {
      liveViewportRef.current = { ...liveViewportRef.current, panX: current.basePanX + (sx - current.startX), panY: current.basePanY + (sy - current.startY) };
      draw();
      return;
    }

    if (current.type === "move") {
      const dx = wx - current.startX;
      const dy = wy - current.startY;
      setDraft((prev) => ({
        ...prev,
        elements: prev.elements.map((item) => {
          const base = current.base.get(item.id);
          if (!base) return item;
          return updateElementPosition(base, dx, dy);
        }),
      }));
      return;
    }

    if (current.type === "resize") {
      const dx = wx - current.startX;
      const dy = wy - current.startY;
      setDraft((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === current.id
            ? {
                ...current.base,
                w: Math.max(48, current.base.w + dx),
                h: Math.max(48, current.base.h + dy),
              }
            : item,
        ),
      }));
      return;
    }

    if (current.type === "movePoint") {
      setDraft((prev) => ({
        ...prev,
        elements: prev.elements.map((item) =>
          item.id === current.id && item.kind === "freeLine"
            ? {
                ...item,
                points: item.points.map((point, index) => (index === current.pointIndex ? { x: wx, y: wy } : point)),
              }
            : item,
        ),
      }));
      return;
    }

    if (current.type === "selectBox") {
      const box = normalizeRect(current.startX, current.startY, wx, wy);
      setSelectionBox(box);
      setSelectedIds(draft.elements.filter((item) => item.kind !== "connector" && rectIntersects(box, getElementBounds(item))).map((item) => item.id));
      interactionRef.current = { ...current, currentX: wx, currentY: wy };
      return;
    }

    if (current.type === "drawShape") {
      const box = normalizeRect(current.startX, current.startY, wx, wy);
      previewRef.current = createShapeElement(box.x, box.y, box.w, box.h);
      draw();
      return;
    }

    if (current.type === "drawStroke") {
      const points = [...current.points, { x: wx, y: wy }];
      interactionRef.current = { ...current, points };
      previewRef.current = createStroke(tool === "airbrush" ? "airbrush" : "marker", points, tool === "eraser");
      draw();
      return;
    }

    if (current.type === "drawFreeLine") {
      const points = [...current.points, { x: wx, y: wy }];
      interactionRef.current = { ...current, points };
      previewRef.current = createFreeLine(points);
      draw();
    }
  }

  function onPointerUp() {
    const current = interactionRef.current;
    const previewElement = previewRef.current;
    interactionRef.current = { type: "idle" };
    previewRef.current = null;

    if (current.type === "pan") {
      const next = { ...draftRef.current, viewport: liveViewportRef.current };
      setDraft(next);
      return;
    }

    if (current.type === "move") {
      const nextElements = draftRef.current.elements;
      const prevElements = draftRef.current.elements.map((item) => current.base.get(item.id) ?? item);
      commit({ ...draftRef.current, elements: nextElements, updatedAt: new Date().toISOString() }, { elements: prevElements, width: draftRef.current.width, height: draftRef.current.height });
      return;
    }

    if (current.type === "resize") {
      const prevElements = draftRef.current.elements.map((item) => (item.id === current.id ? current.base : item));
      commit({ ...draftRef.current, elements: draftRef.current.elements, updatedAt: new Date().toISOString() }, { elements: prevElements, width: draftRef.current.width, height: draftRef.current.height });
      return;
    }

    if (current.type === "movePoint") {
      const prevElements = draftRef.current.elements.map((item) => (item.id === current.id ? current.base : item));
      commit({ ...draftRef.current, elements: draftRef.current.elements, updatedAt: new Date().toISOString() }, { elements: prevElements, width: draftRef.current.width, height: draftRef.current.height });
      return;
    }

    if (current.type === "selectBox") {
      setSelectionBox(null);
      return;
    }

    if (current.type === "drawShape" && previewElement && previewElement.kind === "shape") {
      const element = previewElement;
      commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
      setSelectedIds([element.id]);
      setTool("select");
      return;
    }

    if (current.type === "drawStroke" && current.points.length > 1) {
      if (tool === "eraser") {
        const eraseBounds = getElementBounds(createStroke("marker", current.points, true));
        const filtered = draftRef.current.elements.filter((item) => {
          if (item.kind === "stroke") return !rectIntersects(eraseBounds, getElementBounds(item));
          if (item.kind === "freeLine") return !rectIntersects(eraseBounds, getElementBounds(item));
          return true;
        });
        commit({ ...draftRef.current, elements: filtered, updatedAt: new Date().toISOString() });
      } else {
        const element = createStroke(tool === "airbrush" ? "airbrush" : "marker", current.points);
        commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
        setSelectedIds([element.id]);
      }
      return;
    }

    if (current.type === "drawFreeLine" && current.points.length > 1) {
      const element = createFreeLine(current.points);
      commit({ ...draftRef.current, elements: [...draftRef.current.elements, element], updatedAt: new Date().toISOString() });
      setSelectedIds([element.id]);
      return;
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const { sx, sy } = getPointerLocal(e);
    const cur = draftRef.current.viewport;
    const nextZoom = clamp(cur.zoom + (e.deltaY < 0 ? 0.06 : -0.06), 0.35, 1.8);
    const wx = (sx - cur.panX) / cur.zoom;
    const wy = (sy - cur.panY) / cur.zoom;
    const nextViewport = { ...cur, panX: sx - wx * nextZoom, panY: sy - wy * nextZoom, zoom: nextZoom };
    liveViewportRef.current = nextViewport;
    setDraft((prev) => ({ ...prev, viewport: nextViewport }));
  }

  function snapToolbar() {
    const rect = getCssRect(wrapperRef.current);
    if (!rect) return;
    setToolbarPos((prev) => {
      const gap = 12;
      const x = prev.x < rect.width / 2 ? gap : rect.width - 236;
      const y = clamp(prev.y, gap, rect.height - 320);
      return { x, y };
    });
  }

  const compactTools = toolbarTools.filter((item) => visibleTools[item.id]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden rounded-[28px] border border-slate-200 bg-[#edf3ff]">
      <div className="flex min-h-0 min-w-0 flex-1">
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.65),rgba(237,243,255,0.98))]">
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
            <button type="button" className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white" onClick={onExit}>
              Выход
            </button>
            <div className="rounded-2xl border border-white/60 bg-white/80 px-4 py-2.5 text-xs text-slate-600 shadow-sm backdrop-blur">`Drag` панорама, `Shift+drag` выделение, `Ctrl+wheel` масштаб, `Shift+Tab` палитра.</div>
          </div>

          <div
            className="absolute z-20 w-[164px] rounded-[24px] border border-white/70 bg-white/92 p-3 shadow-[0_14px_40px_rgba(15,23,42,0.14)] backdrop-blur"
            style={{ left: toolbarPos.x, top: toolbarPos.y }}
          >
            <div
              className="mb-3 cursor-move rounded-2xl bg-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"
              onPointerDown={(e) => {
                const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                if (!rect) return;
                toolbarDragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
                setToolbarDragging(true);
              }}
              onPointerUp={() => {
                toolbarDragRef.current = null;
                setToolbarDragging(false);
                snapToolbar();
              }}
              onPointerMove={(e) => {
                if (!toolbarDragRef.current) return;
                const rect = getCssRect(wrapperRef.current);
                if (!rect) return;
                setToolbarPos({
                  x: clamp(e.clientX - rect.left - toolbarDragRef.current.dx, 12, rect.width - 236),
                  y: clamp(e.clientY - rect.top - toolbarDragRef.current.dy, 12, rect.height - 340),
                });
              }}
            >
              Инструменты Rivi
            </div>
            <div className="grid grid-cols-2 gap-2">
              {compactTools.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === "document") {
                      setDocumentModalOpen(true);
                      setPendingDocument(null);
                      return;
                    }
                    setTool(item.id);
                  }}
                  className={[
                    "ed-btn rounded-xl border px-2 py-2 text-[11px] font-medium transition-colors",
                    tool === item.id ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setDraft((prev) => ({ ...prev, viewport: zoomViewport(prev.viewport, -0.1) }))} className="ed-btn rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700">
                -
              </button>
              <button type="button" onClick={() => setDraft((prev) => ({ ...prev, viewport: zoomViewport(prev.viewport, 0.1) }))} className="ed-btn rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700">
                +
              </button>
              <button type="button" onClick={() => setToolbarOpen(true)} className="ed-btn rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700">
                ...
              </button>
            </div>
          </div>

          <div ref={wrapperRef} className="relative flex min-h-0 flex-1 items-stretch overflow-hidden">
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              style={{ cursor: toolCursor(tool) }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                if (pointerPreviewRef.current) pointerPreviewRef.current.style.opacity = "0";
              }}
              onWheel={onWheel}
            />
            <div ref={pointerPreviewRef} className="pointer-events-none absolute rounded-full opacity-0 transition-opacity" />

            <button
              ref={orbRef}
              type="button"
              onClick={togglePalette}
              className="absolute z-20 flex items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-lg shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur transition-transform hover:scale-[1.03]"
              style={{
                left: orbPosRef.current.x,
                top: orbPosRef.current.y,
                width: ORB_SIZE,
                height: ORB_SIZE,
                boxShadow: `0 10px 26px rgba(15,23,42,0.16), 0 0 0 6px ${color1}22`,
              }}
              aria-label="Открыть палитру Rivi"
            >
              <span
                className="h-5 w-5 rounded-full border border-white/70"
                style={{ background: `linear-gradient(135deg, ${color1}, ${typeof color2 === "string" ? color2 : "#dbeafe"})` }}
              />
            </button>

            {paletteOpen ? (
              <div
                className="absolute z-30 w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
                style={{
                  left: clamp(paletteAnchorPos.x + ORB_SIZE + 10, 12, Math.max(12, canvasCssSize.w - 292)),
                  top: clamp(paletteAnchorPos.y - 14, 12, Math.max(12, canvasCssSize.h - 260)),
                }}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Палитра Rivi</div>
                    <div className="text-[11px] text-slate-500">Выбранный цвет применяется к активному инструменту.</div>
                  </div>
                  <button
                    type="button"
                    className="ed-btn rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    onClick={() => setPaletteOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-6 gap-2">
                    {PALETTE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="h-8 w-8 rounded-full border border-slate-200 transition-transform hover:scale-105"
                        style={{ backgroundColor: color, boxShadow: color1 === color ? "0 0 0 3px rgba(59,130,246,0.2)" : undefined }}
                        onClick={() => setColor1(color)}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">Основной</span>
                      <input type="color" value={color1} onChange={(e) => setColor1(e.target.value)} className="h-9 w-10 rounded border border-slate-200" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">Фон</span>
                      <input
                        type="color"
                        value={typeof color2 === "string" && color2.startsWith("#") ? color2 : "#dbeafe"}
                        onChange={(e) => setColor2(e.target.value)}
                        className="h-9 w-10 rounded border border-slate-200"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>Толщина</span>
                      <input aria-label="Thickness" type="range" min={1} max={24} value={thickness} onChange={(e) => setThickness(Number(e.target.value))} className="w-24" />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>Прозрачность</span>
                      <input aria-label="Opacity" type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(clamp(Number(e.target.value) / 100, 0.1, 1))} className="w-24" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShapePickerOpen((prev) => !prev)}
                  className="ed-btn flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <span className="text-sm leading-none">{SHAPE_OPTIONS.find((item) => item.kind === shapeKind)?.icon ?? "▭"}</span>
                  <span>{SHAPE_OPTIONS.find((item) => item.kind === shapeKind)?.label ?? "Фигура"}</span>
                </button>
                {shapePickerOpen ? (
                  <div className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-[220px] overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)] backdrop-blur">
                    <div className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Фигуры</div>
                    <div className="space-y-1">
                      {SHAPE_OPTIONS.map((item) => (
                        <button
                          key={item.kind}
                          type="button"
                          onClick={() => addShapeAtCenter(item.kind)}
                          className={[
                            "ed-btn flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                            shapeKind === item.kind ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-slate-700">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <select value={bgKind} onChange={(e) => { const next = e.target.value as RiviBoardBackgroundKind; setBgKind(next); setDraft((prev) => ({ ...prev, backgroundKind: next })); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700">
                <option value="pixels">Пиксели</option>
                <option value="grid">Сетка</option>
                <option value="dots">Точки</option>
              </select>
              <button type="button" onClick={() => setShapeDash("solid")} className={`ed-btn rounded-xl border px-3 py-2 text-xs ${shapeDash === "solid" ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700"}`}>Сплошная</button>
              <button type="button" onClick={() => setShapeDash("dashed")} className={`ed-btn rounded-xl border px-3 py-2 text-xs ${shapeDash === "dashed" ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-700"}`}>Пунктир</button>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Толщ.</span>
                <input aria-label="Thickness" type="range" min={1} max={24} value={thickness} onChange={(e) => setThickness(Number(e.target.value))} className="w-20" />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Прозр.</span>
                <input aria-label="Opacity" type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(clamp(Number(e.target.value) / 100, 0.1, 1))} className="w-20" />
              </div>
              <button type="button" onClick={fitToScreen} className="ed-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">По размеру</button>
              <button type="button" onClick={() => {
                const last = undoRef.current.pop();
                if (!last) return;
                redoRef.current.push({ elements: draftRef.current.elements, width: draftRef.current.width, height: draftRef.current.height });
                const next = { ...draftRef.current, elements: last.elements, width: last.width, height: last.height, updatedAt: new Date().toISOString() };
                setDraft(next);
                persist(next);
              }} className="ed-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">Отменить</button>
              <button type="button" onClick={() => {
                const last = redoRef.current.pop();
                if (!last) return;
                undoRef.current.push({ elements: draftRef.current.elements, width: draftRef.current.width, height: draftRef.current.height });
                const next = { ...draftRef.current, elements: last.elements, width: last.width, height: last.height, updatedAt: new Date().toISOString() };
                setDraft(next);
                persist(next);
              }} className="ed-btn rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">Вернуть</button>
              <button type="button" onClick={() => { commit({ ...draftRef.current, elements: [], updatedAt: new Date().toISOString() }); setSelectedIds([]); }} className="ed-btn rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">Очистить</button>
              <div className="ml-auto text-xs text-slate-500">
                `{tool}` • {selectedIds.length} выбрано • {Math.round(draft.viewport.zoom * 100)}%
              </div>
            </div>

            {activeSelectedElement ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Свойства</div>
                <div className="flex flex-wrap items-center gap-2">
                  {"title" in activeSelectedElement ? (
                    <input
                      value={activeSelectedElement.title}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          elements: prev.elements.map((item) =>
                            item.id === activeSelectedElement.id && "title" in item ? { ...item, title: e.target.value } : item,
                          ),
                        }))
                      }
                      className="min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-xs"
                    />
                  ) : null}
                  {"stroke" in activeSelectedElement ? (
                    <input
                      type="color"
                      value={activeSelectedElement.stroke.startsWith("#") ? activeSelectedElement.stroke : "#2563eb"}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          elements: prev.elements.map((item) =>
                            item.id === activeSelectedElement.id && "stroke" in item ? { ...item, stroke: e.target.value } : item,
                          ),
                        }))
                      }
                      className="h-9 w-10 rounded border border-slate-200"
                    />
                  ) : null}
                  {"fill" in activeSelectedElement ? (
                    <input
                      type="color"
                      value={activeSelectedElement.fill.startsWith("#") ? activeSelectedElement.fill : "#dbeafe"}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          elements: prev.elements.map((item) =>
                            item.id === activeSelectedElement.id && "fill" in item ? { ...item, fill: e.target.value } : item,
                          ),
                        }))
                      }
                      className="h-9 w-10 rounded border border-slate-200"
                    />
                  ) : null}
                  {activeSelectedElement.kind === "connector" ? (
                    <>
                      <select
                        value={activeSelectedElement.lineKind}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            elements: prev.elements.map((item) =>
                              item.id === activeSelectedElement.id && item.kind === "connector"
                                ? { ...item, lineKind: e.target.value as "straight" | "orthogonal" }
                                : item,
                            ),
                          }))
                        }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      >
                        <option value="straight">Прямая</option>
                        <option value="orthogonal">Ортогональная</option>
                      </select>
                      <select
                        value={activeSelectedElement.arrow}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            elements: prev.elements.map((item) =>
                              item.id === activeSelectedElement.id && item.kind === "connector"
                                ? { ...item, arrow: e.target.value as "none" | "end" | "both" }
                                : item,
                            ),
                          }))
                        }
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      >
                        <option value="none">Без стрелки</option>
                        <option value="end">В одну сторону</option>
                        <option value="both">В обе стороны</option>
                      </select>
                      <input
                        value={activeSelectedElement.label}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            elements: prev.elements.map((item) =>
                              item.id === activeSelectedElement.id && item.kind === "connector" ? { ...item, label: e.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="Подпись связи"
                        className="min-w-[160px] rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      />
                    </>
                  ) : null}
                  {activeSelectedElement.kind === "shape" && activeSelectedElement.description.startsWith("cluster:") ? (
                    <button
                      type="button"
                      onClick={() =>
                        setClusterCollapsedIds((prev) =>
                          prev.includes(activeSelectedElement.id) ? prev.filter((id) => id !== activeSelectedElement.id) : [...prev, activeSelectedElement.id],
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      {clusterCollapsedIds.includes(activeSelectedElement.id) ? "Развернуть кластер" : "Свернуть кластер"}
                    </button>
                  ) : null}
                  {activeSelectedElement.kind === "chatBlock" ? (
                    <button
                      type="button"
                      onClick={() => {
                        const linkedChat = chats.find((chat) => chat.chatId === activeSelectedElement.chatId);
                        if (linkedChat) onOpenChat(linkedChat.id);
                      }}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
                    >
                      Открыть чат
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </main>

        <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="min-h-0 flex-1">
            {openChat ? (
              <div className="h-full">
                <CommunitoriaMessagePane
                  chat={{
                    id: openChat.chatId,
                    kind: openChat.kind === "direct" ? "direct" : "group",
                    title: openChat.title,
                    lastMessagePreview: openChat.subtitle || "",
                    lastMessageAt: null,
                    unreadCount: 0,
                    communityName: openChat.communityName || null,
                  }}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">Прикрепите чат из `Communitoria`, чтобы он всегда был открыт справа.</div>
            )}
          </div>
        </aside>
      </div>

      {toolbarOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-lg rounded-[28px] border border-white/50 bg-white/92 p-5 shadow-2xl backdrop-blur">
            <div className="text-lg font-semibold text-slate-900">Настройка панели Rivi</div>
            <p className="mt-1 text-sm text-slate-600">Можно включать инструменты и менять их порядок. Настройки сохраняются только для `Rivi`.</p>
            <div className="mt-4 space-y-2">
              {toolbarTools.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={visibleTools[item.id]} onChange={(e) => setVisibleTools((prev) => ({ ...prev, [item.id]: e.target.checked }))} />
                    <span>{item.label}</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => setToolbarTools((prev) => {
                        const next = [...prev];
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        return next;
                      })}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Вверх
                    </button>
                    <button
                      type="button"
                      disabled={index === toolbarTools.length - 1}
                      onClick={() => setToolbarTools((prev) => {
                        const next = [...prev];
                        [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                        return next;
                      })}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Вниз
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setToolbarOpen(false)} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {documentModalOpen ? (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/50 bg-white/95 p-5 shadow-2xl backdrop-blur">
            <div className="text-lg font-semibold text-slate-900">Добавить документ</div>
            <p className="mt-1 text-sm text-slate-600">Выбери файл с компьютера. После подтверждения он появится на холсте как карточка документа.</p>
            <label className="mt-4 flex cursor-pointer items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setDocumentBusy(true);
                  try {
                    const href = await readFileAsDataUrl(file);
                    setPendingDocument({
                      file,
                      title: file.name.replace(/\.[^.]+$/, "") || file.name,
                      href,
                      mimeType: file.type || "application/octet-stream",
                      icon: documentIcon(file.type || "", file.name),
                    });
                  } finally {
                    setDocumentBusy(false);
                  }
                }}
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">{documentBusy ? "Загрузка..." : "Нажми, чтобы выбрать файл"}</div>
                <div className="mt-1 text-xs text-slate-500">PDF, изображения, таблицы, документы и другие локальные файлы</div>
              </div>
            </label>
            {pendingDocument ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Будет добавлено</div>
                <input
                  value={pendingDocument.title}
                  onChange={(e) => setPendingDocument((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
                />
                <div className="mt-2 text-xs text-slate-500">{pendingDocument.file.name} • {pendingDocument.mimeType}</div>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDocumentModalOpen(false);
                  setPendingDocument(null);
                }}
                className="ed-btn rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!pendingDocument || documentBusy}
                onClick={() => {
                  if (!pendingDocument) return;
                  addDocumentCard({
                    title: pendingDocument.title,
                    href: pendingDocument.href,
                    mimeType: pendingDocument.mimeType,
                    icon: pendingDocument.icon,
                  });
                  setDocumentModalOpen(false);
                  setPendingDocument(null);
                }}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Добавить на холст
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

