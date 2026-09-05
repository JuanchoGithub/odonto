'use client';

import { cn } from '@/lib/utils';

export type SurfaceKey = 'occlusal' | 'buccal' | 'lingual' | 'mesial' | 'distal' | 'whole';

export const SURFACE_KEYS: SurfaceKey[] = [
  'occlusal',
  'buccal',
  'lingual',
  'mesial',
  'distal',
  'whole',
];

// Conditions that apply to a single surface (per-surface markers).
// The remaining conditions (missing, crown, to_extract, perno, sealant,
// conduct_todo, conduct_done) apply to the WHOLE tooth and are rendered
// as overlays on top of the per-surface wedges.
export const PER_SURFACE_CONDITIONS = new Set([
  'caries',
  'restoration',
]);

// SVG fill classes for per-surface conditions. Used on the wedge paths.
export const CONDITION_COLOR: Record<string, string> = {
  caries: 'fill-blue-500',
  restoration: 'fill-red-500',
  missing: 'fill-gray-400',
  crown: 'fill-red-600',
  to_extract: 'fill-amber-500',
  perno: 'fill-red-600',
  sealant: 'fill-red-500',
  conduct_todo: 'fill-blue-500',
  conduct_done: 'fill-red-500',
};

// HTML counterparts (for legend chips and the tooth-list picker).
export const CONDITION_BG: Record<string, string> = {
  caries: 'bg-blue-500',
  restoration: 'bg-red-500',
  missing: 'bg-gray-500',
  crown: 'bg-red-600',
  to_extract: 'bg-amber-500',
  perno: 'bg-red-600',
  sealant: 'bg-red-500',
  conduct_todo: 'bg-blue-500',
  conduct_done: 'bg-red-500',
};

export const CONDITION_TEXT: Record<string, string> = {
  caries: 'fill-white',
  restoration: 'fill-white',
  missing: 'fill-white',
  crown: 'fill-white',
  to_extract: 'fill-white',
  perno: 'fill-white',
  sealant: 'fill-white',
  conduct_todo: 'fill-white',
  conduct_done: 'fill-white',
};

export const CONDITION_LABEL: Record<string, string> = {
  caries: 'text-white',
  restoration: 'text-white',
  missing: 'text-white',
  crown: 'text-white',
  to_extract: 'text-white',
  perno: 'text-white',
  sealant: 'text-white',
  conduct_todo: 'text-white',
  conduct_done: 'text-white',
};

type SurfaceState = { surface: SurfaceKey; condition: string };
type WholeState = { condition: string };

type Props = {
  toothNumber: number;
  conditions: SurfaceState[];
  whole: WholeState | null;
  selectedSurface: SurfaceKey | null;
  hoverSurface: SurfaceKey | null;
  paintMode: boolean;
  onSurfaceClick: (surface: SurfaceKey) => void;
  onSurfaceContext?: (surface: SurfaceKey) => void;
  onSurfaceMouseEnter: (surface: SurfaceKey) => void;
  onSurfaceMouseLeave: () => void;
  onSurfaceDragOver: (surface: SurfaceKey, e: React.DragEvent) => void;
  onSurfaceDrop: (surface: SurfaceKey, e: React.DragEvent) => void;
  onSurfaceDragLeave: (surface: SurfaceKey) => void;
  draggingCondition: string | null;
  className?: string;
};

const CX = 28;
const CY = 28;
const R = 26;
const R_INNER = 9;
const LABEL_DY = 72;
const TOOTH_STROKE = '#1e293b';

function surfaceFill(state: SurfaceState | undefined, paintMode: boolean): string {
  if (!state) return paintMode ? 'fill-muted/30' : 'fill-white';
  return CONDITION_COLOR[state.condition] ?? 'fill-white';
}

function surfaceLabelColor(state: SurfaceState | undefined): string {
  if (!state) return 'fill-foreground';
  return CONDITION_TEXT[state.condition] ?? 'fill-foreground';
}

type WedgeProps = {
  surface: SurfaceKey;
  d: string;
  state: SurfaceState | undefined;
  isSelected: boolean;
  isHover: boolean;
  isDropTarget: boolean;
  paintMode: boolean;
  labelX: number;
  labelY: number;
  onSurfaceClick: (s: SurfaceKey) => void;
  onSurfaceContext?: (s: SurfaceKey) => void;
  onSurfaceMouseEnter: (s: SurfaceKey) => void;
  onSurfaceMouseLeave: () => void;
  onSurfaceDragOver: (s: SurfaceKey, e: React.DragEvent) => void;
  onSurfaceDrop: (s: SurfaceKey, e: React.DragEvent) => void;
  onSurfaceDragLeave: (s: SurfaceKey) => void;
};

function Wedge({
  surface,
  d,
  state,
  isSelected,
  isHover,
  isDropTarget,
  paintMode,
  labelX,
  labelY,
  onSurfaceClick,
  onSurfaceContext,
  onSurfaceMouseEnter,
  onSurfaceMouseLeave,
  onSurfaceDragOver,
  onSurfaceDrop,
  onSurfaceDragLeave,
}: WedgeProps) {
  return (
    <g>
      <path
        d={d}
        data-surface={surface}
        className={cn(
          'transition-colors duration-100',
          surfaceFill(state, paintMode),
          'stroke-1',
          paintMode ? 'cursor-crosshair' : 'cursor-pointer',
          isSelected && 'stroke-primary stroke-2',
          !isSelected && isHover && 'stroke-primary/70 stroke-1.5',
          isDropTarget && 'stroke-primary stroke-2',
        )}
        style={{ stroke: TOOTH_STROKE }}
        onClick={(e) => {
          e.stopPropagation();
          onSurfaceClick(surface);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSurfaceContext?.(surface);
        }}
        onMouseEnter={() => onSurfaceMouseEnter(surface)}
        onMouseLeave={onSurfaceMouseLeave}
        onDragOver={(e) => onSurfaceDragOver(surface, e)}
        onDragLeave={() => onSurfaceDragLeave(surface)}
        onDrop={(e) => onSurfaceDrop(surface, e)}
      />
      {state ? (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          className={cn(
            'pointer-events-none select-none text-[10px] font-bold',
            surfaceLabelColor(state),
          )}
        >
          {surface[0].toUpperCase()}
        </text>
      ) : null}
    </g>
  );
}

// Single source of truth for whole-tooth condition symbols.
// Exported so the mobile tooth-list picker, the legend chips, and the
// desktop chart all render the same SVG markup — these are dental-charting
// standards (red X = missing, red ring = crown, two blue parallel slashes
// = to extract, red solid fill = perno, red bar = sealant, TC badge =
// endo) and must not be re-implemented with different glyphs.
export function WholeSymbol({ condition }: { condition: string }) {
  switch (condition) {
    case 'missing':
      // A plain RED X across the whole tooth — no fill, just the cross.
      return (
        <g pointerEvents="none">
          <line
            x1={CX - R * 0.7}
            y1={CY - R * 0.7}
            x2={CX + R * 0.7}
            y2={CY + R * 0.7}
            stroke="#dc2626"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <line
            x1={CX - R * 0.7}
            y1={CY + R * 0.7}
            x2={CX + R * 0.7}
            y2={CY - R * 0.7}
            stroke="#dc2626"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </g>
      );
    case 'crown':
      // Red ring around the tooth
      return (
        <g pointerEvents="none">
          <circle
            cx={CX}
            cy={CY}
            r={R + 3}
            fill="none"
            stroke="#dc2626"
            strokeWidth={2.5}
          />
        </g>
      );
    case 'to_extract':
      // Two PARALLEL diagonal slashes in blue across the tooth
      return (
        <g pointerEvents="none">
          <line
            x1={CX - R * 0.75 - 5}
            y1={CY - R * 0.75}
            x2={CX + R * 0.75 - 5}
            y2={CY + R * 0.75}
            stroke="#2563eb"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <line
            x1={CX - R * 0.75 + 5}
            y1={CY - R * 0.75}
            x2={CX + R * 0.75 + 5}
            y2={CY + R * 0.75}
            stroke="#2563eb"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </g>
      );
    case 'perno':
      // Whole tooth filled red
      return (
        <g pointerEvents="none">
          <circle
            cx={CX}
            cy={CY}
            r={R}
            className="fill-red-600"
          />
          <text
            x={CX}
            y={CY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white text-[10px] font-bold select-none"
          >
            P
          </text>
        </g>
      );
    case 'sealant':
      // A long RED dash across the top of the tooth
      return (
        <g pointerEvents="none">
          <line
            x1={CX - R * 0.85}
            y1={CY - R * 0.55}
            x2={CX + R * 0.85}
            y2={CY - R * 0.55}
            stroke="#dc2626"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </g>
      );
    case 'conduct_todo':
      return <ConductMarker color="#2563eb" />;
    case 'conduct_done':
      return <ConductMarker color="#dc2626" />;
    case 'clean':
      // Healthy tooth — green check inside the tooth outline.
      return (
        <g pointerEvents="none">
          <path
            d={`M ${CX - 7} ${CY} L ${CX - 2} ${CY + 5} L ${CX + 7} ${CY - 4}`}
            stroke="#059669"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      );
    default:
      return null;
  }
}

function ConductMarker({ color }: { color: string }) {
  // A large blue/red "TC" badge overlapping the top of the tooth
  return (
    <g pointerEvents="none">
      <rect
        x={CX - 17}
        y={-6}
        width={34}
        height={19}
        rx={4}
        fill={color}
      />
      <text
        x={CX}
        y={3.5}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-white text-[12px] font-bold select-none"
      >
        TC
      </text>
    </g>
  );
}

/**
 * Standalone SVG of a tooth-shape (circle + cross-hair divider) with a
 * whole-tooth condition symbol drawn on top. Use this anywhere the dental
 * standard needs to be shown off the main chart: the mobile quadrant
 * list, the legend chips, etc. It is intentionally identical to the
 * rendering used inside <ToothSvg> on the desktop chart.
 */
export function WholeConditionSymbol({
  condition,
  size = 32,
  className,
}: {
  condition: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 80"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      className={cn('bg-white dark:bg-background', className)}
      aria-hidden
    >
      {/* outer ring + cross-hair divider (same frame as the chart tooth) */}
      <line
        x1={CX}
        y1={CY - R}
        x2={CX}
        y2={CY + R}
        stroke={TOOTH_STROKE}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <line
        x1={CX - R}
        y1={CY}
        x2={CX + R}
        y2={CY}
        stroke={TOOTH_STROKE}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke={TOOTH_STROKE}
        strokeWidth={1.6}
      />
      <WholeSymbol condition={condition} />
    </svg>
  );
}

export function ToothSvg({
  toothNumber,
  conditions,
  whole,
  selectedSurface,
  hoverSurface,
  paintMode,
  onSurfaceClick,
  onSurfaceContext,
  onSurfaceMouseEnter,
  onSurfaceMouseLeave,
  onSurfaceDragOver,
  onSurfaceDrop,
  onSurfaceDragLeave,
  draggingCondition,
  className,
}: Props) {
  const byKey: Partial<Record<SurfaceKey, SurfaceState>> = {};
  for (const c of conditions) byKey[c.surface] = c;

  // Cardinal points on the outer circle
  const N = { x: CX, y: CY - R };
  const E = { x: CX + R, y: CY };
  const S = { x: CX, y: CY + R };
  const W = { x: CX - R, y: CY };

  const LABEL_R = (R + R_INNER) / 2;
  const labelAt = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: CX + LABEL_R * Math.cos(rad),
      y: CY + LABEL_R * Math.sin(rad),
    };
  };
  const buccalLabel = labelAt(-45);
  const distalLabel = labelAt(45);
  const lingualLabel = labelAt(135);
  const mesialLabel = labelAt(225);

  const wedge = (
    surface: SurfaceKey,
    a: { x: number; y: number },
    b: { x: number; y: number },
    labelX: number,
    labelY: number,
  ) => {
    const d = `M ${CX} ${CY} L ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y} Z`;
    const state = byKey[surface];
    const isSelected = selectedSurface === surface;
    const isHover = hoverSurface === surface;
    const isDropTarget = draggingCondition != null && isHover;
    return (
      <Wedge
        key={surface}
        surface={surface}
        d={d}
        state={state}
        isSelected={isSelected}
        isHover={isHover}
        isDropTarget={isDropTarget}
        paintMode={paintMode}
        labelX={labelX}
        labelY={labelY}
        onSurfaceClick={onSurfaceClick}
        onSurfaceContext={onSurfaceContext}
        onSurfaceMouseEnter={onSurfaceMouseEnter}
        onSurfaceMouseLeave={onSurfaceMouseLeave}
        onSurfaceDragOver={onSurfaceDragOver}
        onSurfaceDrop={onSurfaceDrop}
        onSurfaceDragLeave={onSurfaceDragLeave}
      />
    );
  };

  const occlusalState = byKey.occlusal;
  const occlusalSelected = selectedSurface === 'occlusal';
  const occlusalHover = hoverSurface === 'occlusal';
  const occlusalDropTarget = draggingCondition != null && occlusalHover;

  return (
    <svg
      viewBox="0 0 56 80"
      preserveAspectRatio="xMidYMid meet"
      className={cn('bg-white dark:bg-background overflow-visible', className)}
      role="img"
      aria-label={`Tooth ${toothNumber}`}
      data-tooth-svg={toothNumber}
    >
      {wedge('buccal', N, E, buccalLabel.x, buccalLabel.y)}
      {wedge('mesial', W, N, mesialLabel.x, mesialLabel.y)}
      {wedge('lingual', S, W, lingualLabel.x, lingualLabel.y)}
      {wedge('distal', E, S, distalLabel.x, distalLabel.y)}

      <circle
        data-surface="occlusal"
        cx={CX}
        cy={CY}
        r={R_INNER}
        className={cn(
          'transition-colors duration-100',
          surfaceFill(occlusalState, paintMode),
          'stroke-1',
          paintMode ? 'cursor-crosshair' : 'cursor-pointer',
          occlusalSelected && 'stroke-primary stroke-2',
          !occlusalSelected && occlusalHover && 'stroke-primary/70 stroke-1.5',
          occlusalDropTarget && 'stroke-primary stroke-2',
        )}
        style={{ stroke: TOOTH_STROKE }}
        onClick={(e) => {
          e.stopPropagation();
          onSurfaceClick('occlusal');
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSurfaceContext?.('occlusal');
        }}
        onMouseEnter={() => onSurfaceMouseEnter('occlusal')}
        onMouseLeave={onSurfaceMouseLeave}
        onDragOver={(e) => onSurfaceDragOver('occlusal', e)}
        onDragLeave={() => onSurfaceDragLeave('occlusal')}
        onDrop={(e) => onSurfaceDrop('occlusal', e)}
      />
      {occlusalState ? (
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="middle"
          className={cn(
            'pointer-events-none select-none text-[10px] font-bold',
            surfaceLabelColor(occlusalState),
          )}
        >
          O
        </text>
      ) : null}

      {/* Cross lines (visual divider) — drawn over the wedges */}
      <line
        x1={CX}
        y1={CY - R}
        x2={CX}
        y2={CY + R}
        stroke={TOOTH_STROKE}
        strokeWidth={1.4}
        strokeLinecap="round"
        pointerEvents="none"
      />
      <line
        x1={CX - R}
        y1={CY}
        x2={CX + R}
        y2={CY}
        stroke={TOOTH_STROKE}
        strokeWidth={1.4}
        strokeLinecap="round"
        pointerEvents="none"
      />

      {/* Outer border ring */}
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke={TOOTH_STROKE}
        strokeWidth={1.6}
        pointerEvents="none"
      />

      {/* Whole-tooth condition symbol (overlays everything) */}
      {whole ? <WholeSymbol condition={whole.condition} /> : null}

      {/* Tooth number label, outside the tooth body for readability */}
      <text
        x={CX}
        y={LABEL_DY}
        textAnchor="middle"
        dominantBaseline="middle"
        className="pointer-events-none select-none fill-foreground text-[12px] font-semibold"
      >
        {toothNumber}
      </text>
    </svg>
  );
}
