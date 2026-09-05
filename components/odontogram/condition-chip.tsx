'use client';

import { cn } from '@/lib/utils';
import { CONDITION_BG, CONDITION_LABEL, WholeConditionSymbol } from './tooth-svg';

// Whole-tooth conditions are rendered with their real dental-charting
// symbol via <WholeConditionSymbol> (the same SVG that the chart and the
// mobile list use). Per-surface conditions (caries / restoration) are
// shown with a solid color swatch matching the wedge fill.
const WHOLE_CONDITIONS = new Set([
  'missing',
  'crown',
  'to_extract',
  'perno',
  'sealant',
  'conduct_todo',
  'conduct_done',
  'clean',
]);

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
  const isWhole = WHOLE_CONDITIONS.has(condition);
  return (
    <button
      type="button"
      draggable
      data-condition={condition}
      data-testid={`condition-chip-${condition}`}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={
        paintModeActive && active
          ? 'Click to exit paint mode'
          : `Paint or drag: ${label}`
      }
      className={cn(
        'min-h-[44px] px-3 py-2 rounded-md text-sm border transition-all select-none touch-manipulation',
        'cursor-grab active:cursor-grabbing',
        'inline-flex items-center gap-1.5',
        !isWhole && `${CONDITION_BG[condition] ?? ''} ${CONDITION_LABEL[condition] ?? ''}`,
        isWhole && 'bg-white dark:bg-background',
        active && 'ring-2 ring-primary ring-offset-1',
        !active && paintModeActive && 'opacity-40',
      )}
    >
      {isWhole ? (
        <WholeConditionSymbol condition={condition} size={20} className="shrink-0" />
      ) : null}
      {label}
    </button>
  );
}
