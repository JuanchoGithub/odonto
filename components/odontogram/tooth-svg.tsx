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

export const CONDITION_TEXT: Record<string, string> = {
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
  worstConditionClass: string;
  worstConditionTextClass: string;
};

function surfaceFill(state: SurfaceState | undefined, paintMode: boolean): string {
  if (!state) return paintMode ? 'fill-muted/30' : 'fill-white';
  return CONDITION_COLOR[state.condition] ?? 'fill-white';
}

function surfaceText(state: SurfaceState | undefined): string {
  if (!state) return 'text-muted-foreground';
  return CONDITION_TEXT[state.condition] ?? 'text-foreground';
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
  worstConditionClass,
  worstConditionTextClass,
}: Props) {
  const byKey: Partial<Record<SurfaceKey, SurfaceState>> = {};
  for (const c of conditions) byKey[c.surface] = c;

  const renderPoly = (
    key: SurfaceKey,
    points: string,
    textX: number,
    textY: number,
  ) => {
    const state = byKey[key];
    const isSelected = selectedSurface === key;
    const isHover = hoverSurface === key;
    const isDropTarget = draggingCondition != null && isHover;
    const fill = surfaceFill(state, paintMode);
    return (
      <g key={key}>
        <polygon
          data-surface={key}
          points={points}
          className={cn(
            'transition-colors duration-100',
            fill,
            paintMode ? 'cursor-crosshair' : 'cursor-pointer',
            isSelected && 'stroke-primary',
            isSelected && 'stroke-2',
            !isSelected && isHover && 'stroke-foreground/50',
            !isSelected && isHover && 'stroke-1',
            isDropTarget && 'stroke-primary',
            isDropTarget && 'stroke-2',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onSurfaceClick(key);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onSurfaceContext?.(key);
          }}
          onMouseEnter={() => onSurfaceMouseEnter(key)}
          onMouseLeave={onSurfaceMouseLeave}
          onDragOver={(e) => onSurfaceDragOver(key, e)}
          onDragLeave={() => onSurfaceDragLeave(key)}
          onDrop={(e) => onSurfaceDrop(key, e)}
        />
        {state ? (
          <text
            x={textX}
            y={textY}
            textAnchor="middle"
            dominantBaseline="middle"
            className={cn(
              'pointer-events-none select-none text-[6px] font-semibold',
              surfaceText(state),
            )}
          >
            {key[0].toUpperCase()}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 40 48"
      width={40}
      height={48}
      className={cn(
        'rounded-md border bg-white dark:bg-background',
        worstConditionClass,
        worstConditionTextClass,
      )}
      role="img"
      aria-label={`Tooth ${toothNumber}`}
      data-tooth-svg={toothNumber}
    >
      {renderPoly('buccal', '0,0 40,0 40,10 0,10', 20, 5)}
      {renderPoly('mesial', '0,0 6,0 6,48 0,48', 3, 24)}
      {renderPoly('occlusal', '6,12 34,12 34,36 6,36', 20, 24)}
      {renderPoly('distal', '34,0 40,0 40,48 34,48', 37, 24)}
      {renderPoly('lingual', '0,38 40,38 40,48 0,48', 20, 43)}
      <text
        x="20"
        y="24"
        textAnchor="middle"
        dominantBaseline="middle"
        className="pointer-events-none select-none fill-foreground/70 text-[6px] font-medium"
      >
        {toothNumber}
      </text>
    </svg>
  );
}
