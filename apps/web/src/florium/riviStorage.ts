export type RiviSpaceStatus = "active" | "archived";

export type RiviViewport = {
  panX: number;
  panY: number;
  zoom: number;
};

export type RiviBoardBackgroundKind = "pixels" | "grid" | "dots";

type RiviBoardPoint = { x: number; y: number };

type RiviBoardElementBase = {
  id: string;
  kind: "stroke" | "freeLine" | "shape" | "connector" | "textBlock" | "documentCard" | "chatBlock";
};

export type RiviBoardStrokeElement = RiviBoardElementBase & {
  kind: "stroke";
  erase: boolean;
  brushKind: "marker" | "airbrush";
  layerId: string;
  points: RiviBoardPoint[];
  color: string;
  width: number;
  opacity: number; // 0..1
  dash?: number[];
};

export type RiviBoardFreeLineElement = RiviBoardElementBase & {
  kind: "freeLine";
  points: RiviBoardPoint[];
  color: string;
  width: number;
  opacity: number;
  dash?: number[];
};

export type RiviBoardShapeKind = "rect" | "roundRect" | "ellipse" | "diamond" | "cloud";

export type RiviBoardShapeElement = RiviBoardElementBase & {
  kind: "shape";
  shapeKind: RiviBoardShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  description: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  shadow: boolean;
};

export type RiviBoardConnectorElement = RiviBoardElementBase & {
  kind: "connector";
  fromId: string;
  toId: string;
  lineKind: "straight" | "orthogonal";
  arrow: "none" | "end" | "both";
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  label: string;
};

export type RiviBoardTextAlign = "left" | "center" | "right";

export type RiviBoardTextElement = RiviBoardElementBase & {
  kind: "textBlock";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: "regular" | "bold";
  fontStyle: "normal" | "italic";
  align: RiviBoardTextAlign;
  fill: string;
};

export type RiviBoardDocumentCardElement = RiviBoardElementBase & {
  kind: "documentCard";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  documentId: string;
  href: string;
  icon: string;
  fill: string;
  stroke: string;
};

export type RiviBoardChatBlockElement = RiviBoardElementBase & {
  kind: "chatBlock";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  chatId: string;
  communityName: string;
  fill: string;
  stroke: string;
};

export type RiviBoardElement =
  | RiviBoardStrokeElement
  | RiviBoardFreeLineElement
  | RiviBoardShapeElement
  | RiviBoardConnectorElement
  | RiviBoardTextElement
  | RiviBoardDocumentCardElement
  | RiviBoardChatBlockElement;

export type RiviBoardState = {
  id: string;
  title: string;
  width: number;
  height: number;
  backgroundKind: RiviBoardBackgroundKind;
  viewport: RiviViewport;
  elements: RiviBoardElement[];
  updatedAt: string;
};

type RiviObjectBase = {
  id: string;
  type: "text" | "document" | "chatLink" | "shape" | "cluster";
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: string;
  updatedAt: string;
};

export type RiviTextObject = RiviObjectBase & {
  type: "text";
  title: string;
  description: string;
  fill: string;
};

export type RiviDocumentObject = RiviObjectBase & {
  type: "document";
  documentId: string;
  title: string;
  href: string;
  mimeType: string;
  folderLabel: string;
  createdLabel: string;
};

export type RiviChatLinkObject = RiviObjectBase & {
  type: "chatLink";
  chatId: string;
  title: string;
  subtitle: string;
  communityName: string;
  kind: "group" | "direct";
};

export type RiviShapeObject = RiviObjectBase & {
  type: "shape";
  shapeKind: "rect" | "ellipse";
  title: string;
  fill: string;
  stroke: string;
};

export type RiviClusterObject = RiviObjectBase & {
  type: "cluster";
  title: string;
  color: string;
  childIds: string[];
  collapsed: boolean;
};

export type RiviObject = RiviTextObject | RiviDocumentObject | RiviChatLinkObject | RiviShapeObject | RiviClusterObject;

export type RiviConnector = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  color: string;
  style: "solid" | "dashed" | "arrow";
  createdAt: string;
  updatedAt: string;
};

export type RiviSpace = {
  id: string;
  title: string;
  description: string;
  status: RiviSpaceStatus;
  ownerUserId: string;
  updatedAt: string;
  viewport: RiviViewport;
  objects: RiviObject[];
  connectors: RiviConnector[];
  board: RiviBoardState | null;
};

export type RiviState = {
  spaces: RiviSpace[];
  lastOpenedSpaceId: string | null;
};

export type RiviDocumentInput = {
  documentId: string;
  title: string;
  href: string;
  mimeType?: string;
  folderLabel?: string;
  createdLabel?: string;
};

export type RiviChatInput = {
  chatId: string;
  title: string;
  subtitle?: string;
  communityName?: string;
  kind: "group" | "direct";
};

const STORAGE_V1 = "edumed.rivi.v1";
export const RIVI_UPDATED_EVENT = "edumed:rivi-updated";
export const RIVI_FOCUS_MODE_EVENT = "edumed:rivi-focus-mode";
export const RIVI_EXIT_WORKSPACE_EVENT = "edumed:rivi-exit-workspace";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultViewport(): RiviViewport {
  return { panX: 0, panY: 0, zoom: 1 };
}

function parseViewport(raw: unknown): RiviViewport {
  if (!raw || typeof raw !== "object") return defaultViewport();
  const o = raw as Record<string, unknown>;
  const panX = typeof o.panX === "number" ? o.panX : 0;
  const panY = typeof o.panY === "number" ? o.panY : 0;
  const zoom = typeof o.zoom === "number" && Number.isFinite(o.zoom) ? Math.min(1.6, Math.max(0.6, o.zoom)) : 1;
  return { panX, panY, zoom };
}

function parseBoardPoint(raw: unknown): RiviBoardPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return null;
  return { x: o.x, y: o.y };
}

function parseBoardElement(raw: unknown): RiviBoardElement | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const kind = o.kind;
  if (
    !id ||
    (kind !== "stroke" &&
      kind !== "freeLine" &&
      kind !== "shape" &&
      kind !== "connector" &&
      kind !== "textBlock" &&
      kind !== "documentCard" &&
      kind !== "chatBlock")
  ) {
    return null;
  }

  if (kind === "stroke") {
    const points = Array.isArray(o.points) ? o.points.map(parseBoardPoint).filter((v): v is RiviBoardPoint => v != null) : [];
    return {
      id,
      kind,
      erase: o.erase === true,
      brushKind: o.brushKind === "airbrush" ? "airbrush" : "marker",
      layerId: typeof o.layerId === "string" ? o.layerId : "drawing",
      points,
      color: typeof o.color === "string" ? o.color : "#64748b",
      width: typeof o.width === "number" && Number.isFinite(o.width) ? Math.max(1, o.width) : 2,
      opacity: typeof o.opacity === "number" && Number.isFinite(o.opacity) ? Math.min(1, Math.max(0, o.opacity)) : 1,
      dash: Array.isArray(o.dash) ? o.dash.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : undefined,
    };
  }

  if (kind === "freeLine") {
    const points = Array.isArray(o.points) ? o.points.map(parseBoardPoint).filter((v): v is RiviBoardPoint => v != null) : [];
    return {
      id,
      kind,
      points,
      color: typeof o.color === "string" ? o.color : "#2563eb",
      width: typeof o.width === "number" && Number.isFinite(o.width) ? Math.max(1, o.width) : 2,
      opacity: typeof o.opacity === "number" && Number.isFinite(o.opacity) ? Math.min(1, Math.max(0, o.opacity)) : 1,
      dash: Array.isArray(o.dash) ? o.dash.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : undefined,
    };
  }

  if (kind === "shape") {
    return {
      id,
      kind,
      shapeKind:
        o.shapeKind === "roundRect" || o.shapeKind === "diamond" || o.shapeKind === "cloud" || o.shapeKind === "ellipse"
          ? o.shapeKind
          : "rect",
      x: typeof o.x === "number" ? o.x : 0,
      y: typeof o.y === "number" ? o.y : 0,
      w: typeof o.w === "number" ? o.w : 10,
      h: typeof o.h === "number" ? o.h : 10,
      title: typeof o.title === "string" ? o.title : "Фигура",
      description: typeof o.description === "string" ? o.description : "",
      fill: typeof o.fill === "string" ? o.fill : "rgba(191,219,254,0.65)",
      stroke: typeof o.stroke === "string" ? o.stroke : "#60a5fa",
      strokeWidth: typeof o.strokeWidth === "number" && Number.isFinite(o.strokeWidth) ? Math.max(1, o.strokeWidth) : 2,
      dash: Array.isArray(o.dash) ? o.dash.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : undefined,
      shadow: o.shadow !== false,
    };
  }

  if (kind === "connector") {
    return {
      id,
      kind,
      fromId: typeof o.fromId === "string" ? o.fromId : "",
      toId: typeof o.toId === "string" ? o.toId : "",
      lineKind: o.lineKind === "orthogonal" ? "orthogonal" : "straight",
      arrow: o.arrow === "end" || o.arrow === "both" ? o.arrow : "none",
      stroke: typeof o.stroke === "string" ? o.stroke : "#60a5fa",
      strokeWidth: typeof o.strokeWidth === "number" && Number.isFinite(o.strokeWidth) ? Math.max(1, o.strokeWidth) : 2,
      dash: Array.isArray(o.dash) ? o.dash.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : undefined,
      label: typeof o.label === "string" ? o.label : "",
    };
  }

  if (kind === "textBlock") {
    return {
      id,
      kind,
      x: typeof o.x === "number" ? o.x : 0,
      y: typeof o.y === "number" ? o.y : 0,
      w: typeof o.w === "number" ? o.w : 220,
      h: typeof o.h === "number" ? o.h : 120,
      title: typeof o.title === "string" ? o.title : "Текст",
      text: typeof o.text === "string" ? o.text : "Новый текстовый блок",
      color: typeof o.color === "string" ? o.color : "#0f172a",
      fontSize: typeof o.fontSize === "number" && Number.isFinite(o.fontSize) ? Math.max(8, o.fontSize) : 18,
      fontFamily: typeof o.fontFamily === "string" ? o.fontFamily : "system-ui",
      fontWeight: o.fontWeight === "bold" ? "bold" : "regular",
      fontStyle: o.fontStyle === "italic" ? "italic" : "normal",
      align: o.align === "center" || o.align === "right" ? o.align : "left",
      fill: typeof o.fill === "string" ? o.fill : "rgba(255,255,255,0.92)",
    };
  }

  if (kind === "chatBlock") {
    return {
      id,
      kind,
      x: typeof o.x === "number" ? o.x : 0,
      y: typeof o.y === "number" ? o.y : 0,
      w: typeof o.w === "number" ? o.w : 280,
      h: typeof o.h === "number" ? o.h : 132,
      title: typeof o.title === "string" ? o.title : "Чат проекта",
      subtitle: typeof o.subtitle === "string" ? o.subtitle : "Связанный чат Communitoria",
      chatId: typeof o.chatId === "string" ? o.chatId : makeId("chat-block"),
      communityName: typeof o.communityName === "string" ? o.communityName : "Communitoria",
      fill: typeof o.fill === "string" ? o.fill : "rgba(236,253,245,0.96)",
      stroke: typeof o.stroke === "string" ? o.stroke : "#10b981",
    };
  }

  return {
    id,
    kind,
    x: typeof o.x === "number" ? o.x : 0,
    y: typeof o.y === "number" ? o.y : 0,
    w: typeof o.w === "number" ? o.w : 280,
    h: typeof o.h === "number" ? o.h : 140,
    title: typeof o.title === "string" ? o.title : "Документ",
    subtitle: typeof o.subtitle === "string" ? o.subtitle : "Карточка документа",
    documentId: typeof o.documentId === "string" ? o.documentId : makeId("doc-card"),
    href: typeof o.href === "string" ? o.href : "/documents",
    icon: typeof o.icon === "string" ? o.icon : "DOC",
    fill: typeof o.fill === "string" ? o.fill : "rgba(255,248,220,0.96)",
    stroke: typeof o.stroke === "string" ? o.stroke : "#f59e0b",
  };
}

function parseBoard(raw: unknown): RiviBoardState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  const backgroundKind: RiviBoardBackgroundKind = o.backgroundKind === "grid" || o.backgroundKind === "dots" ? o.backgroundKind : "pixels";
  const width = typeof o.width === "number" && Number.isFinite(o.width) ? Math.max(320, o.width) : 1920;
  const height = typeof o.height === "number" && Number.isFinite(o.height) ? Math.max(240, o.height) : 1080;
  const elements = Array.isArray(o.elements) ? o.elements.map(parseBoardElement).filter((v): v is RiviBoardElement => v != null) : [];
  return {
    id: o.id,
    title: o.title,
    width,
    height,
    backgroundKind,
    viewport: parseViewport(o.viewport),
    elements,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
  };
}

function parseObject(raw: unknown): RiviObject | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const type = o.type;
  if (!id || (type !== "text" && type !== "document" && type !== "chatLink" && type !== "shape" && type !== "cluster")) return null;
  const base = {
    id,
    type,
    x: typeof o.x === "number" ? o.x : 80,
    y: typeof o.y === "number" ? o.y : 80,
    w: typeof o.w === "number" ? o.w : 280,
    h: typeof o.h === "number" ? o.h : 150,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
  } as const;
  if (type === "text") {
    return {
      ...base,
      type,
      title: typeof o.title === "string" ? o.title : "Новый блок",
      description: typeof o.description === "string" ? o.description : "",
      fill: typeof o.fill === "string" ? o.fill : "rgba(255,255,255,0.94)",
    };
  }
  if (type === "document") {
    return {
      ...base,
      type,
      documentId: typeof o.documentId === "string" ? o.documentId : makeId("doc"),
      title: typeof o.title === "string" ? o.title : "Документ",
      href: typeof o.href === "string" ? o.href : "/documents",
      mimeType: typeof o.mimeType === "string" ? o.mimeType : "application/octet-stream",
      folderLabel: typeof o.folderLabel === "string" ? o.folderLabel : "Без папки",
      createdLabel: typeof o.createdLabel === "string" ? o.createdLabel : "—",
    };
  }
  if (type === "shape") {
    return {
      ...base,
      type,
      shapeKind: o.shapeKind === "ellipse" ? "ellipse" : "rect",
      title: typeof o.title === "string" ? o.title : "Фигура",
      fill: typeof o.fill === "string" ? o.fill : "rgba(191,219,254,0.65)",
      stroke: typeof o.stroke === "string" ? o.stroke : "#60a5fa",
    };
  }
  if (type === "cluster") {
    return {
      ...base,
      type,
      title: typeof o.title === "string" ? o.title : "Кластер",
      color: typeof o.color === "string" ? o.color : "rgba(125,211,252,0.16)",
      childIds: Array.isArray(o.childIds) ? o.childIds.filter((v): v is string => typeof v === "string") : [],
      collapsed: o.collapsed === true,
    };
  }
  return {
    ...base,
    type,
    chatId: typeof o.chatId === "string" ? o.chatId : makeId("chat"),
    title: typeof o.title === "string" ? o.title : "Чат",
    subtitle: typeof o.subtitle === "string" ? o.subtitle : "",
    communityName: typeof o.communityName === "string" ? o.communityName : "",
    kind: o.kind === "direct" ? "direct" : "group",
  };
}

function parseConnector(raw: unknown): RiviConnector | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.fromId !== "string" || typeof o.toId !== "string") return null;
  return {
    id: o.id,
    fromId: o.fromId,
    toId: o.toId,
    label: typeof o.label === "string" ? o.label : "",
    color: typeof o.color === "string" ? o.color : "#64748b",
    style: o.style === "dashed" || o.style === "arrow" ? o.style : "solid",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
  };
}

function parseSpace(raw: unknown): RiviSpace | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  return {
    id: o.id,
    title: o.title,
    description: typeof o.description === "string" ? o.description : "",
    status: o.status === "archived" ? "archived" : "active",
    ownerUserId: typeof o.ownerUserId === "string" ? o.ownerUserId : "unknown",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : nowIso(),
    viewport: parseViewport(o.viewport),
    objects: Array.isArray(o.objects) ? o.objects.map(parseObject).filter((v): v is RiviObject => v != null) : [],
    connectors: Array.isArray(o.connectors)
      ? o.connectors.map(parseConnector).filter((v): v is RiviConnector => v != null)
      : [],
    board: parseBoard(o.board),
  };
}

function normalizeState(raw: unknown): RiviState {
  if (!raw || typeof raw !== "object") return { spaces: [], lastOpenedSpaceId: null };
  const o = raw as Record<string, unknown>;
  return {
    spaces: Array.isArray(o.spaces) ? o.spaces.map(parseSpace).filter((v): v is RiviSpace => v != null) : [],
    lastOpenedSpaceId: typeof o.lastOpenedSpaceId === "string" ? o.lastOpenedSpaceId : null,
  };
}

function emitUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RIVI_UPDATED_EVENT));
  }
}

export function emitRiviFocusMode(active: boolean) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<boolean>(RIVI_FOCUS_MODE_EVENT, { detail: active }));
  }
}

export function emitRiviExitWorkspace() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RIVI_EXIT_WORKSPACE_EVENT));
  }
}

export function loadRiviState(): RiviState {
  try {
    const raw = localStorage.getItem(STORAGE_V1);
    if (!raw) return { spaces: [], lastOpenedSpaceId: null };
    return normalizeState(JSON.parse(raw) as unknown);
  } catch {
    return { spaces: [], lastOpenedSpaceId: null };
  }
}

export function saveRiviState(next: RiviState) {
  try {
    localStorage.setItem(STORAGE_V1, JSON.stringify(next));
    emitUpdated();
  } catch {
    // ignore
  }
}

export function createRiviSpace(input: {
  title: string;
  description: string;
  ownerUserId: string;
  status?: RiviSpaceStatus;
}): RiviSpace {
  const stamp = nowIso();
  return {
    id: makeId("space"),
    title: input.title.trim() || "Новое пространство",
    description: input.description.trim(),
    status: input.status ?? "active",
    ownerUserId: input.ownerUserId,
    updatedAt: stamp,
    viewport: defaultViewport(),
    board: null,
    objects: [],
    connectors: [],
  };
}

export function upsertRiviSpace(space: RiviSpace, options?: { select?: boolean }) {
  const state = loadRiviState();
  const nextSpaces = state.spaces.some((item) => item.id === space.id)
    ? state.spaces.map((item) => (item.id === space.id ? space : item))
    : [space, ...state.spaces];
  saveRiviState({
    spaces: nextSpaces.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    lastOpenedSpaceId: options?.select ? space.id : state.lastOpenedSpaceId,
  });
}

export function deleteRiviSpace(spaceId: string) {
  const state = loadRiviState();
  saveRiviState({
    spaces: state.spaces.filter((space) => space.id !== spaceId),
    lastOpenedSpaceId: state.lastOpenedSpaceId === spaceId ? null : state.lastOpenedSpaceId,
  });
}

export function patchRiviSpace(spaceId: string, patch: Partial<Omit<RiviSpace, "id">>) {
  const state = loadRiviState();
  const nextSpaces = state.spaces.map((space) =>
    space.id === spaceId ? { ...space, ...patch, updatedAt: nowIso() } : space,
  );
  saveRiviState({ ...state, spaces: nextSpaces });
}

export function setLastOpenedRiviSpace(spaceId: string | null) {
  const state = loadRiviState();
  saveRiviState({ ...state, lastOpenedSpaceId: spaceId });
}

export function updateRiviViewport(spaceId: string, viewport: RiviViewport) {
  patchRiviSpace(spaceId, { viewport: parseViewport(viewport) });
}

export function updateRiviObjects(spaceId: string, objects: RiviObject[]) {
  patchRiviSpace(spaceId, { objects });
}

export function updateRiviConnectors(spaceId: string, connectors: RiviConnector[]) {
  patchRiviSpace(spaceId, { connectors });
}

export function addTextObjectToRiviSpace(
  spaceId: string,
  input?: Partial<Pick<RiviTextObject, "title" | "description" | "x" | "y" | "w" | "h" | "fill">>,
) {
  const state = loadRiviState();
  const stamp = nowIso();
  const nextSpaces = state.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const next: RiviTextObject = {
      id: makeId("obj"),
      type: "text",
      title: input?.title?.trim() || "Новый блок",
      description: input?.description?.trim() || "Опишите этап, гипотезу или заметку.",
      x: input?.x ?? 120 + (space.objects.length % 4) * 44,
      y: input?.y ?? 120 + (space.objects.length % 3) * 36,
      w: input?.w ?? 300,
      h: input?.h ?? 170,
      fill: input?.fill ?? "rgba(255,255,255,0.94)",
      createdAt: stamp,
      updatedAt: stamp,
    };
    return { ...space, updatedAt: stamp, objects: [...space.objects, next] };
  });
  saveRiviState({ ...state, spaces: nextSpaces, lastOpenedSpaceId: spaceId });
}

export function addShapeObjectToRiviSpace(
  spaceId: string,
  input?: Partial<Pick<RiviShapeObject, "shapeKind" | "title" | "x" | "y" | "w" | "h" | "fill" | "stroke">>,
) {
  const state = loadRiviState();
  const stamp = nowIso();
  const nextSpaces = state.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const next: RiviShapeObject = {
      id: makeId("obj"),
      type: "shape",
      shapeKind: input?.shapeKind ?? "rect",
      title: input?.title?.trim() || (input?.shapeKind === "ellipse" ? "Круг" : "Прямоугольник"),
      x: input?.x ?? 180 + (space.objects.length % 4) * 42,
      y: input?.y ?? 180 + (space.objects.length % 4) * 26,
      w: input?.w ?? 180,
      h: input?.h ?? 120,
      fill: input?.fill ?? "rgba(191,219,254,0.55)",
      stroke: input?.stroke ?? "#60a5fa",
      createdAt: stamp,
      updatedAt: stamp,
    };
    return { ...space, updatedAt: stamp, objects: [...space.objects, next] };
  });
  saveRiviState({ ...state, spaces: nextSpaces, lastOpenedSpaceId: spaceId });
}

export function addClusterToRiviSpace(
  spaceId: string,
  input: { title?: string; color?: string; childIds: string[]; x?: number; y?: number; w?: number; h?: number },
) {
  const state = loadRiviState();
  const stamp = nowIso();
  const nextSpaces = state.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const next: RiviClusterObject = {
      id: makeId("obj"),
      type: "cluster",
      title: input.title?.trim() || "Кластер",
      color: input.color ?? "rgba(125,211,252,0.16)",
      childIds: input.childIds,
      x: input.x ?? 0,
      y: input.y ?? 0,
      w: input.w ?? 240,
      h: input.h ?? 180,
      collapsed: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    return { ...space, updatedAt: stamp, objects: [...space.objects, next] };
  });
  saveRiviState({ ...state, spaces: nextSpaces, lastOpenedSpaceId: spaceId });
}

export function addDocumentObjectToRiviSpace(spaceId: string, input: RiviDocumentInput) {
  const state = loadRiviState();
  const stamp = nowIso();
  const nextSpaces = state.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const next: RiviDocumentObject = {
      id: makeId("obj"),
      type: "document",
      documentId: input.documentId,
      title: input.title,
      href: input.href,
      mimeType: input.mimeType ?? "application/octet-stream",
      folderLabel: input.folderLabel ?? "Документы",
      createdLabel: input.createdLabel ?? "—",
      x: 140 + (space.objects.length % 4) * 46,
      y: 140 + (space.objects.length % 4) * 28,
      w: 320,
      h: 144,
      createdAt: stamp,
      updatedAt: stamp,
    };
    return { ...space, updatedAt: stamp, objects: [...space.objects, next] };
  });
  saveRiviState({ ...state, spaces: nextSpaces, lastOpenedSpaceId: spaceId });
}

export function addChatLinkObjectToRiviSpace(spaceId: string, input: RiviChatInput) {
  const state = loadRiviState();
  const stamp = nowIso();
  const nextSpaces = state.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const next: RiviChatLinkObject = {
      id: makeId("obj"),
      type: "chatLink",
      chatId: input.chatId,
      title: input.title,
      subtitle: input.subtitle ?? "",
      communityName: input.communityName ?? "",
      kind: input.kind,
      x: 160 + (space.objects.length % 4) * 40,
      y: 160 + (space.objects.length % 5) * 24,
      w: 300,
      h: 132,
      createdAt: stamp,
      updatedAt: stamp,
    };
    return { ...space, updatedAt: stamp, objects: [...space.objects, next] };
  });
  saveRiviState({ ...state, spaces: nextSpaces, lastOpenedSpaceId: spaceId });
}

export function createConnector(input: Pick<RiviConnector, "fromId" | "toId"> & Partial<Pick<RiviConnector, "label" | "color" | "style">>): RiviConnector {
  const stamp = nowIso();
  return {
    id: makeId("link"),
    fromId: input.fromId,
    toId: input.toId,
    label: input.label ?? "",
    color: input.color ?? "#64748b",
    style: input.style ?? "solid",
    createdAt: stamp,
    updatedAt: stamp,
  };
}
