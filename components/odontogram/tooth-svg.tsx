'use client';

import { cn } from '@/lib/utils';

export type SurfaceKey = 'occlusal' | 'buccal' | 'lingual' | 'mesial' | 'distal';

export const SURFACE_KEYS: SurfaceKey[] = [
  'occlusal',
  'buccal',
  'lingual',
  'mesial',
  'distal',
];

export const CONDITION_COLOR: Record<string, string> = {
  caries: 'fill-red-500',
  filling: 'fill-blue-500',
  crown: 'fill-yellow-400',
  root_canal: 'fill-purple-500',
  missing: 'fill-gray-700',
  impacted: 'fill-orange-500',
  fracture: 'fill-rose-600',
  sealant: 'fill-cyan-500',
  implant: 'fill-slate-500',
  healthy: 'fill-emerald-500',
};

// HTML counterparts of CONDITION_COLOR for use on non-SVG elements
// (e.g. the condition chips in the legend). Tailwind's `fill-*` only
// applies to SVG elements; HTML buttons need `bg-*` + `text-*`.
export const CONDITION_BG: Record<string, string> = {
  caries: 'bg-red-500',
  filling: 'bg-blue-500',
  crown: 'bg-yellow-400',
  root_canal: 'bg-purple-500',
  missing: 'bg-gray-700',
  impacted: 'bg-orange-500',
  fracture: 'bg-rose-600',
  sealant: 'bg-cyan-500',
  implant: 'bg-slate-500',
  healthy: 'bg-emerald-500',
};

export const CONDITION_TEXT: Record<string, string> = {
  caries: 'fill-white',
  filling: 'fill-white',
  crown: 'fill-black',
  root_canal: 'fill-white',
  missing: 'fill-white',
  impacted: 'fill-white',
  fracture: 'fill-white',
  sealant: 'fill-white',
  implant: 'fill-white',
  healthy: 'fill-white',
};

export const CONDITION_LABEL: Record<string, string> = {
  caries: 'text-white',
  filling: 'text-white',
  crown: 'text-black',
  root_canal: 'text-white',
  missing: 'text-white',
  impacted: 'text-white',
  fracture: 'text-white',
  sealant: 'text-white',
  implant: 'text-white',
  healthy: 'text-white',
};

type SurfaceState = { surface: SurfaceKey; condition: string };

type Props = {
  toothNumber: number;
  conditions: SurfaceState[];
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

function ringFill(state: SurfaceState | undefined, paintMode: boolean): string {
  if (!state) return paintMode ? 'fill-muted/30' : 'fill-white';
  return CONDITION_COLOR[state.condition] ?? 'fill-white';
}

function ringStroke(state: SurfaceState | undefined): string {
  if (!state) return 'stroke-foreground';
  return 'stroke-foreground';
}

function ringLabelColor(state: SurfaceState | undefined): string {
  if (!state) return 'fill-foreground';
  return CONDITION_TEXT[state.condition] ?? 'text-foreground';
}

function ringLabel(state: SurfaceState | undefined, key: SurfaceKey): string {
  if (state) return key[0].toUpperCase();
  return '';
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
          ringFill(state, paintMode),
          ringStroke(state),
          'stroke-1',
          paintMode ? 'cursor-crosshair' : 'cursor-pointer',
          isSelected && 'stroke-primary stroke-2',
          !isSelected && isHover && 'stroke-primary/70 stroke-1.5',
          isDropTarget && 'stroke-primary stroke-2',
        )}
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
            'pointer-events-none select-none text-[11px] font-bold',
            ringLabelColor(state),
          )}
        >
          {ringLabel(state, surface)}
        </text>
      ) : null}
    </g>
  );
}

export function ToothSvg({
  toothNumber,
  conditions,
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

  // Outer ring divided into 4 quarter-pie wedges by angle from center.
  // 0° = right (3 o'clock), 90° = down, etc. We compute the four wedges:
  //   distal:   -45° .. 45°   (right)
  //   lingual:   45° .. 135°  (bottom)
  //   mesial:   135° .. 225°  (left)
  //   buccal:   225° .. 315°  (top)
  // For a top-down occlusal view, "top of screen" is buccal, so we map
  // screen-y=2 (north) to the buccal wedge, which is angle 270° in SVG
  // coordinates (where y grows downward, so angle 270° = up).
  // The pie wedge for an angle range [a, b] in SVG coords:
  //   M cx,cy  L (cx + R*cos a, cy + R*sin a)  A R,R 0 0 1 (cx + R*cos b, cy + R*sin b)  Z
  // We pre-compute these for cleanliness.
  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  };

  // Wedge endpoints (using the same convention as the visual cross):
  // - buccal wedge top center: y=2 (north)
  // - mesial wedge left center: x=2 (west)
  // - distal wedge right center: x=42 (east)
  // - lingual wedge bottom center: y=42 (south)
  // Build wedges using these cardinal endpoints.
  const wedge = (
    surface: SurfaceKey,
    a: { x: number; y: number },
    b: { x: number; y: number },
    largeArc: 0 | 1,
    labelX: number,
    labelY: number,
  ) => {
    const d = `M ${CX} ${CY} L ${a.x} ${a.y} A ${R} ${R} 0 ${largeArc} 1 ${b.x} ${b.y} Z`;
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

  // Cardinal points on the outer circle
  const N = { x: CX, y: CY - R }; // (22, 2)
  const E = { x: CX + R, y: CY }; // (42, 22)
  const S = { x: CX, y: CY + R }; // (22, 42)
  const W = { x: CX - R, y: CY }; // (2, 22)

  // Wedge labels sit at the center of each wedge (midway between adjacent
  // cardinals) at a radius halfway between the inner and outer circle.
  const LABEL_R = (R + R_INNER) / 2; // midpoint of the ring
  const labelAt = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: CX + LABEL_R * Math.cos(rad),
      y: CY + LABEL_R * Math.sin(rad),
    };
  };
  // Each wedge spans 90° between two adjacent cardinals; label at the
  // wedge's center angle.
  //   buccal wedge: -90° → 0° (center -45°)
  //   distal wedge:    0° → 90° (center  45°)
  //   lingual wedge:  90° → 180° (center 135°)
  //   mesial wedge:  180° → 270° (center 225°)
  const buccalLabel = labelAt(-45);
  const distalLabel = labelAt(45);
  const lingualLabel = labelAt(135);
  const mesialLabel = labelAt(225);

  // Build occlusal inner-circle hit-area
  const occlusalState = byKey.occlusal;
  const occlusalSelected = selectedSurface === 'occlusal';
  const occlusalHover = hoverSurface === 'occlusal';
  const occlusalDropTarget = draggingCondition != null && occlusalHover;

  return (
    <svg
      viewBox="0 0 56 80"
      preserveAspectRatio="xMidYMid meet"
      className={cn('bg-white dark:bg-background', className)}
      role="img"
      aria-label={`Tooth ${toothNumber}`}
      data-tooth-svg={toothNumber}
    >
      {wedge('buccal', N, E, 0, buccalLabel.x, buccalLabel.y)}
      {wedge('mesial', W, N, 0, mesialLabel.x, mesialLabel.y)}
      {wedge('lingual', S, W, 0, lingualLabel.x, lingualLabel.y)}
      {wedge('distal', E, S, 0, distalLabel.x, distalLabel.y)}

      {/* Inner occlusal circle as a hit-area */}
      <circle
        data-surface="occlusal"
        cx={CX}
        cy={CY}
        r={R_INNER}
        className={cn(
          'transition-colors duration-100',
          ringFill(occlusalState, paintMode),
          'stroke-foreground stroke-1',
          paintMode ? 'cursor-crosshair' : 'cursor-pointer',
          occlusalSelected && 'stroke-primary stroke-2',
          !occlusalSelected && occlusalHover && 'stroke-primary/70 stroke-1.5',
          occlusalDropTarget && 'stroke-primary stroke-2',
        )}
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
            'pointer-events-none select-none text-[11px] font-bold',
            ringLabelColor(occlusalState),
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
        stroke="#1e293b"
        strokeWidth={1.4}
        strokeLinecap="round"
        pointerEvents="none"
      />
      <line
        x1={CX - R}
        y1={CY}
        x2={CX + R}
        y2={CY}
        stroke="#1e293b"
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
        stroke="#1e293b"
        strokeWidth={1.8}
        pointerEvents="none"
      />

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
