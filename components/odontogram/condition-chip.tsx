'use client';

import { cn } from '@/lib/utils';
import { CONDITION_BG, CONDITION_LABEL } from './tooth-svg';

// Whole-tooth conditions get a symbol glyph instead of a solid fill,
// mirroring what the tooth itself renders.
const SYMBOL_GLYPH: Record<string, string> = {
  missing: '✕',
  crown: '○',
  to_extract: '//',
  perno: '■',
  sealant: '–',
  conduct_todo: 'TC',
  conduct_done: 'TC',
  clean: '✓',
};

const SYMBOL_COLOR: Record<string, string> = {
  missing: 'text-red-600',
  crown: 'text-red-600',
  to_extract: 'text-blue-600',
  perno: 'text-red-600',
  sealant: 'text-red-600',
  conduct_todo: 'text-blue-600',
  conduct_done: 'text-red-600',
  clean: 'text-emerald-600',
};

type Props = {
  condition: string;
  label: string;
  active: boolean;
  paintModeActive: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

export function ConditionChip({
  condition,
  label,
  active,
  paintModeActive,
  onClick,
  onDragStart,
  onDragEnd,
}: Props) {
  const glyph = SYMBOL_GLYPH[condition];
  return (
    <button
      type="button"
      draggable
      data-condition={condition}
      data-testid={`condition-chip-${condition}`}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={paintModeActive && active ? 'Click to exit paint mode' : `Paint or drag: ${label}`}
      className={cn(
        'px-2 py-1 rounded text-xs border transition-all select-none',
        'cursor-grab active:cursor-grabbing',
        'inline-flex items-center gap-1.5',
        glyph
          ? 'bg-background text-foreground'
          : `${CONDITION_BG[condition] ?? ''} ${CONDITION_LABEL[condition] ?? ''}`,
        active && 'ring-2 ring-primary ring-offset-1',
        !active && paintModeActive && 'opacity-40',
      )}
    >
      {glyph ? (
        <span
          aria-hidden
          className={cn('text-sm font-bold leading-none', SYMBOL_COLOR[condition])}
        >
          {glyph}
        </span>
      ) : null}
      {label}
    </button>
  );
}
