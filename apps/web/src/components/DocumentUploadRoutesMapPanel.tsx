import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientUploadRoute, UploadSourceId, UploadTargetRef } from "../lib/documentUploadRoutesUi";
import { UPLOAD_SOURCE_OPTIONS, targetLabel } from "../lib/documentUploadRoutesUi";

type Section = { id: string; name: string };
type Folder = { id: string; name: string; sectionId: string | null; parentFolderId: string | null };

const BLOCK_W = 220;
const BLOCK_H = 56;

type SourceBlock = {
  id: string; // stable block id
  kind: "source";
  sourceId: UploadSourceId;
  title: string;
  short: string;
  detail: string;
};

type TargetBlock = {
  id: string; // stable block id
  kind: "target";
  target: UploadTargetRef;
  title: string;
  short: string;
  detail: string;
};

type AnyBlock = SourceBlock | TargetBlock;

function sourceBlockId(source: UploadSourceId) {
  return `src:${source}`;
}

function targetBlockId(t: UploadTargetRef) {
  if (t.type === "panel_loose") return "tgt:panel_loose";
  if (t.type === "section_loose") return `tgt:section_loose:${t.sectionId}`;
  return `tgt:folder:${t.folderId}`;
}

type Edge = {
  edgeId: string;
  source: UploadSourceId;
  target: UploadTargetRef;
  sourceBlockId: string;
  targetBlockId: string;
};

export function DocumentUploadRoutesMapPanel({
  editableRoutes,
  readonlyRoutes,
  sections,
  folders,
  saving,
  onAddEdge,
  onRemoveEdge,
}: {
  editableRoutes: ClientUploadRoute[];
  readonlyRoutes?: ClientUploadRoute[];
  sections: Section[];
  folders: Folder[];
  saving: boolean;
  onAddEdge: (source: UploadSourceId, target: UploadTargetRef) => void;
  onRemoveEdge: (source: UploadSourceId, target: UploadTargetRef) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [activeSource, setActiveSource] = useState<UploadSourceId | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [edgeHoverTip, setEdgeHoverTip] = useState<null | { x: number; y: number; text: string }>(null);
  const [edgeMenu, setEdgeMenu] = useState<null | { edge: Edge; x: number; y: number }>(null);

  const blocks: AnyBlock[] = useMemo(() => {
    const srcBlocks: SourceBlock[] = UPLOAD_SOURCE_OPTIONS.map((s) => ({
      id: sourceBlockId(s.id),
      kind: "source",
      sourceId: s.id,
      title: s.label,
      short: s.label,
      detail: s.label,
    }));

    const panelTarget: TargetBlock = {
      id: targetBlockId({ type: "panel_loose" }),
      kind: "target",
      target: { type: "panel_loose" },
      title: "Корень панели",
      short: "Корень панели",
      detail: targetLabel({ type: "panel_loose" }, sections, folders),
    };

    const sectionTargets: TargetBlock[] = sections.map((s) => ({
      id: targetBlockId({ type: "section_loose", sectionId: s.id }),
      kind: "target",
      target: { type: "section_loose", sectionId: s.id },
      title: s.name,
      short: s.name,
      detail: targetLabel({ type: "section_loose", sectionId: s.id }, sections, folders),
    }));

    const folderTargets: TargetBlock[] = folders.map((f) => ({
      id: targetBlockId({ type: "folder", folderId: f.id }),
      kind: "target",
      target: { type: "folder", folderId: f.id },
      title: f.name,
      short: f.name,
      detail: targetLabel({ type: "folder", folderId: f.id }, sections, folders),
    }));

    return [ ...srcBlocks, panelTarget, ...sectionTargets, ...folderTargets ];
  }, [folders, sections]);

  const initialPositions = useMemo(() => {
    // Размещаем источники сверху, приёмники снизу. Дальше пользователь может перетаскивать блоки.
    const positions: Record<string, { x: number; y: number }> = {};
    const canvasWidth = 1180;
    const leftPad = 42;
    const topPad = 20;
    const sourceY = topPad;
    const targetY = topPad + 120;

    // Источники слева направо
    const sourceTotalW = UPLOAD_SOURCE_OPTIONS.length * BLOCK_W + (UPLOAD_SOURCE_OPTIONS.length - 1) * 18;
    const sourceStartX = Math.max(leftPad, Math.round((canvasWidth - sourceTotalW) / 2));
    UPLOAD_SOURCE_OPTIONS.forEach((s, i) => {
      positions[sourceBlockId(s.id)] = {
        x: sourceStartX + i * (BLOCK_W + 18),
        y: sourceY,
      };
    });

    const targetBlocks = blocks.filter((b) => b.kind === "target") as TargetBlock[];
    const cols = 4;
    const targetTotalW = cols * BLOCK_W + (cols - 1) * 18;
    const targetStartX = Math.max(leftPad, Math.round((canvasWidth - targetTotalW) / 2));
    targetBlocks.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[b.id] = {
        x: targetStartX + col * (BLOCK_W + 18),
        y: targetY + row * (BLOCK_H + 18),
      };
    });

    return positions;
  }, [blocks]);

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => initialPositions);

  // Добавляем новые блоки без перезапуска уже перетаскиваемых позиций.
  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      for (const b of blocks) {
        if (!next[b.id]) next[b.id] = initialPositions[b.id] ?? { x: 0, y: 0 };
      }
      return next;
    });
  }, [blocks, initialPositions]);

  const getBounds = useCallback(() => {
    const el = mapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  const clamp = useCallback((x: number, y: number, bounds: { width: number; height: number }) => {
    const maxX = Math.max(0, bounds.width - BLOCK_W);
    const maxY = Math.max(0, bounds.height - BLOCK_H);
    return {
      x: Math.max(8, Math.min(x, maxX - 8)),
      y: Math.max(8, Math.min(y, maxY - 8)),
    };
  }, []);

  const draggingRef = useRef<null | {
    blockId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    bounds: { width: number; height: number };
  }>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      if (e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;
      if (Math.hypot(dx, dy) > 4) didDragRef.current = true;
      const rawX = d.startX + dx;
      const rawY = d.startY + dy;
      const c = clamp(rawX, rawY, d.bounds);
      setPositions((prev) => ({ ...prev, [d.blockId]: c }));
    };
    const onUp = (e: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      if (e.pointerId !== d.pointerId) return;

      draggingRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clamp]);

  const edges: Array<Edge & { editable: boolean }> = useMemo(() => {
    const out: Array<Edge & { editable: boolean }> = [];
    for (const row of readonlyRoutes ?? []) {
      for (const target of row.targets) {
        const sBlockId = sourceBlockId(row.source);
        const tBlockId = targetBlockId(target);
        out.push({
          edgeId: `ro:${row.source}|${tBlockId}`,
          source: row.source,
          target,
          sourceBlockId: sBlockId,
          targetBlockId: tBlockId,
          editable: false,
        });
      }
    }
    for (const row of editableRoutes) {
      for (const target of row.targets) {
        const sBlockId = sourceBlockId(row.source);
        const tBlockId = targetBlockId(target);
        out.push({
          edgeId: `ed:${row.source}|${tBlockId}`,
          source: row.source,
          target,
          sourceBlockId: sBlockId,
          targetBlockId: tBlockId,
          editable: true,
        });
      }
    }
    return out;
  }, [editableRoutes, readonlyRoutes]);

  const onBlockClick = useCallback(
    (b: AnyBlock) => {
      if (saving) return;
      if (b.kind === "source") {
        setActiveSource((cur) => (cur === b.sourceId ? null : b.sourceId));
        return;
      }
      if (!activeSource) return;
      onAddEdge(activeSource, b.target);
      setActiveSource(null);
    },
    [activeSource, onAddEdge, saving],
  );

  const onLineClick = useCallback(
    (e: React.MouseEvent<SVGPathElement, MouseEvent>, edge: Edge) => {
      e.stopPropagation();
      const bounds = getBounds();
      if (!bounds) return;
      const x = e.clientX - bounds.left;
      const y = e.clientY - bounds.top;
      setEdgeMenu({ edge, x, y });
    },
    [getBounds],
  );

  return (
    <div data-routes-map-root>
      <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
        <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">Карта маршрутов</div>

        <div
          ref={mapRef}
          className="relative mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"
          style={{
            height: 660,
            backgroundImage:
              "linear-gradient(to right, rgba(148,163,184,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.09) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
          onClick={() => {
            setEdgeMenu(null);
            setEdgeHoverTip(null);
          }}
        >
          <svg className="absolute inset-0" style={{ pointerEvents: edgeMenu ? "none" : "auto" }}>
            <defs>
              <marker id="ed-route-arrow-readonly" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="rgba(148,163,184,0.75)" />
              </marker>
              <marker id="ed-route-arrow-editable" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="rgba(16,185,129,0.82)" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const sPos = positions[edge.sourceBlockId];
              const tPos = positions[edge.targetBlockId];
              if (!sPos || !tPos) return null;
              const x1 = sPos.x + BLOCK_W / 2;
              const y1 = sPos.y + BLOCK_H / 2;
              const x2 = tPos.x + BLOCK_W / 2;
              const y2 = tPos.y + BLOCK_H / 2;
              const yMid = (y1 + y2) / 2;
              const d = `M ${x1} ${y1} C ${x1} ${yMid}, ${x2} ${yMid}, ${x2} ${y2}`;
              const isHovered = hoveredEdgeId === edge.edgeId;
              const isActiveSource = activeSource && edge.source === activeSource;
              const highlight = Boolean(isHovered || isActiveSource);
              const sourceTitle = UPLOAD_SOURCE_OPTIONS.find((x) => x.id === edge.source)?.label ?? edge.source;
              const targetTitle = targetLabel(edge.target, sections, folders);
              return (
                <g key={edge.edgeId}>
                  <path
                    d={d}
                    stroke={
                      edge.editable
                        ? highlight
                          ? "rgba(245,158,11,0.95)"
                          : "rgba(16,185,129,0.8)"
                        : "rgba(148,163,184,0.75)"
                    }
                    strokeWidth={highlight ? 4.5 : 3}
                    fill="none"
                    opacity={highlight ? 1 : 0.9}
                    style={{ cursor: edge.editable ? "pointer" : "default" }}
                    markerEnd={edge.editable ? "url(#ed-route-arrow-editable)" : "url(#ed-route-arrow-readonly)"}
                    strokeLinecap="round"
                    onPointerEnter={() => setHoveredEdgeId(edge.edgeId)}
                    onPointerMove={(ev) => {
                      setEdgeHoverTip({
                        x: ev.clientX + 10,
                        y: ev.clientY + 12,
                        text: `Из «${sourceTitle}» → в «${targetTitle}»`,
                      });
                    }}
                    onPointerLeave={() => {
                      setHoveredEdgeId(null);
                      setEdgeHoverTip(null);
                    }}
                    onClick={(ev) => {
                      if (!edge.editable) return;
                      onLineClick(ev, edge);
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {blocks.map((b) => {
            const pos = positions[b.id] ?? { x: 0, y: 0 };
            const isSource = b.kind === "source";
            const selected = isSource && activeSource === b.sourceId;
            const isConnectedToHovered =
              hoveredEdgeId &&
              edges.some((e) => e.edgeId === hoveredEdgeId && (e.sourceBlockId === b.id || e.targetBlockId === b.id));
            return (
              <div
                key={b.id}
                title={b.detail}
                className={[
                  "absolute select-none rounded-2xl border bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm",
                  "cursor-grab transition duration-150 hover:-translate-y-0.5 hover:shadow-lg",
                  selected
                    ? "border-amber-300 bg-amber-50"
                    : isSource
                      ? "border-sky-200 bg-sky-50/45"
                      : "border-violet-200 bg-violet-50/45",
                  isConnectedToHovered ? "ring-2 ring-amber-200" : "",
                ].join(" ")}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: BLOCK_W,
                  height: BLOCK_H,
                }}
                role="button"
                aria-label={b.detail}
                data-block-id={b.id}
                onPointerDown={(ev) => {
                  if (saving) return;
                  didDragRef.current = false;
                  // Клик по блоку также используется для создания связи, но в режиме перетаскивания не создаём.
                  // (поэтому drag должен начаться до mouseup)
                  const bounds = getBounds();
                  if (!bounds) return;
                  draggingRef.current = {
                    blockId: b.id,
                    pointerId: ev.pointerId,
                    startClientX: ev.clientX,
                    startClientY: ev.clientY,
                    startX: pos.x,
                    startY: pos.y,
                    bounds: { width: bounds.width, height: bounds.height },
                  };
                  (ev.currentTarget as HTMLDivElement).setPointerCapture?.(ev.pointerId);
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (didDragRef.current) {
                    // If a drag happened, suppress the click action to avoid accidental edge creation.
                    didDragRef.current = false;
                    return;
                  }
                  onBlockClick(b);
                }}
              >
                <div className="flex h-full items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {b.kind === "source" ? "Источник" : "Выход"}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[13px] font-semibold text-slate-900">{b.short}</div>
                  </div>
                  <div className="shrink-0 text-lg" aria-hidden>
                    {b.kind === "source" ? "↥" : "↧"}
                  </div>
                </div>
              </div>
            );
          })}

          {edgeMenu ? (
            <div
              className="absolute z-50 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
              style={{ left: Math.max(8, Math.min(edgeMenu.x, 520 - 200)), top: Math.max(8, edgeMenu.y) }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                onClick={() => {
                  onRemoveEdge(edgeMenu.edge.source, edgeMenu.edge.target);
                  setEdgeMenu(null);
                }}
              >
                Удалить связь
              </button>
            </div>
          ) : null}
          {edgeHoverTip ? (
            <div
              className="pointer-events-none fixed z-[70] rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg"
              style={{ left: edgeHoverTip.x, top: edgeHoverTip.y }}
            >
              {edgeHoverTip.text}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

