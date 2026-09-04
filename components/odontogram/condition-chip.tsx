'use client';

import { cn } from '@/lib/utils';
import { CONDITION_BG, CONDITION_LABEL } from './tooth-svg';

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
        CONDITION_BG[condition],
        CONDITION_LABEL[condition],
        active && 'ring-2 ring-primary ring-offset-1',
        !active && paintModeActive && 'opacity-40',
      )}
    >
      {label}
    </button>
  );
}
