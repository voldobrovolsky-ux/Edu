"use client";

import type { MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CandidateSalaryPreview, SalaryPreviewSegment } from "@/lib/payroll/candidate-salary-preview";
import { SectionCard } from "@/components/ui/SectionCard";
import { Abbr } from "@/components/ui/Abbr";
import { ABBR } from "@/lib/abbr-glossary";

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function donutSlicePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  a0: number,
  a1: number,
): string {
  const [x0o, y0o] = polar(cx, cy, outerR, a0);
  const [x1o, y1o] = polar(cx, cy, outerR, a1);
  const [x0i, y0i] = polar(cx, cy, innerR, a0);
  const [x1i, y1i] = polar(cx, cy, innerR, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${x0o} ${y0o}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${x0i} ${y0i}`,
    "Z",
  ].join(" ");
}

function DonutChart({
  segments,
  totalRub,
  onHover,
}: {
  segments: CandidateSalaryPreview["segments"];
  totalRub: number;
  onHover: (idx: number | null, e: MouseEvent<SVGPathElement> | null) => void;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.38;
  const innerR = size * 0.22;
  const sum = segments.reduce((s, x) => s + x.amountRub, 0) || 1;

  let angle = -Math.PI / 2;
  const paths = segments.map((seg) => {
    const sweep = (seg.amountRub / sum) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const d = donutSlicePath(cx, cy, innerR, outerR, a0, a1);
    return { d, seg };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label="Распределение прогноза выплат"
      onMouseLeave={() => onHover(null, null)}
    >
      <title>Прогноз выплат по компонентам</title>
      {paths.map(({ d, seg }, i) => (
        <path
          key={seg.id}
          d={d}
          fill={seg.color}
          className="cursor-pointer transition-[filter] hover:brightness-110"
          onMouseEnter={(e) => onHover(i, e)}
          onMouseMove={(e) => onHover(i, e)}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
        Прогноз
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-foreground text-lg font-semibold tabular-nums">
        {totalRub.toLocaleString("ru-RU")} ₽
      </text>
      <text x={cx} y={cy + 30} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        в месяц
      </text>
    </svg>
  );
}

export function CandidateSalaryDonutPanel({
  preview,
  className = "",
}: {
  preview: CandidateSalaryPreview;
  /** Доп. классы для оболочки (высота в сетке и т.п.). */
  className?: string;
}) {
  const [tip, setTip] = useState<{ idx: number; x: number; y: number } | null>(null);

  const onHover = useCallback((idx: number | null, e: MouseEvent<SVGPathElement> | null) => {
    if (idx == null || !e) {
      setTip(null);
      return;
    }
    setTip({ idx, x: e.clientX, y: e.clientY });
  }, []);

  const seg = tip != null ? preview.segments[tip.idx] : null;

  const segmentShort = (s: SalaryPreviewSegment) => {
    if (s.id === "pk" || s.id === "regional") return <Abbr title={ABBR.rk}>{s.shortLabel}</Abbr>;
    if (s.id === "pr") return <Abbr title={ABBR.pr}>{s.shortLabel}</Abbr>;
    if (s.id === "op") return <Abbr title={ABBR.op}>{s.shortLabel}</Abbr>;
    return s.shortLabel;
  };

  const metricLabel = (label: string) => {
    if (label === "ПК") return <Abbr title={ABBR.rk}>ПК</Abbr>;
    if (label === "ПР") return <Abbr title={ABBR.pr}>ПР</Abbr>;
    if (label === "ОП") return <Abbr title={ABBR.op}>ОП</Abbr>;
    return label;
  };

  const legend = useMemo(
    () =>
      preview.segments.map((s) => (
        <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
          <span className="font-medium text-foreground">{segmentShort(s)}</span>
          <span className="tabular-nums">{Math.round(s.amountRub).toLocaleString("ru-RU")} ₽</span>
        </div>
      )),
    [preview.segments],
  );

  const tooltip =
    tip &&
    seg &&
    typeof window !== "undefined" &&
    createPortal(
      <div
        className="pointer-events-none fixed z-[200] max-w-sm rounded-xl border border-border/80 bg-card/98 px-3 py-2.5 text-sm shadow-xl ring-1 ring-border/50 backdrop-blur-sm"
        style={{
          left: Math.min(tip.x + 14, typeof window !== "undefined" ? window.innerWidth - 320 : tip.x),
          top: tip.y + 14,
        }}
      >
        <p className="font-semibold text-foreground">{seg.shortLabel} — {Math.round(seg.amountRub).toLocaleString("ru-RU")} ₽</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{seg.detail}</p>
      </div>,
      document.body,
    );

  return (
    <SectionCard
      title="Прогноз выплат по часам"
      description="Модель по настройкам бухгалтерии: база + ПК / ПР / ОП × отведённые часы. Наведите на сегмент дуги."
      variant="quiet"
      className={`flex h-full min-h-0 flex-col ${className}`.trim()}
    >
      {tooltip}
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
        <div className="relative flex flex-col items-center">
          <DonutChart segments={preview.segments} totalRub={preview.totalRub} onHover={onHover} />
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">{legend}</div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Параметры расчёта</p>
          <ul className="space-y-2.5">
            {preview.metrics.map((m) => (
              <li
                key={m.label}
                className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-elevated/50 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span className="text-xs text-muted-foreground">{metricLabel(m.label)}</span>
                <span className="text-sm font-medium text-foreground">{m.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] leading-relaxed text-subtle-foreground">
            ПК — квалификационная надбавка по ветке; ПР — предмет; ОП — опыт. РК — региональная сумма (если задана в настройках).
            Реальная ЗП зависит от фактических часов и прогонов расчёта.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
