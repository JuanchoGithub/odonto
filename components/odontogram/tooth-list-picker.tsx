'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CONDITION_BG } from './tooth-svg';

type SurfaceRow = { surface: string; condition: string };
type ToothRow = { tooth_number: number; conditions: SurfaceRow[] };

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const CONDITION_PRIORITY = [
  'missing',
  'implant',
  'crown',
  'root_canal',
  'caries',
  'fracture',
  'filling',
  'sealant',
  'impacted',
  'healthy',
] as const;

function worstCondition(tooth: ToothRow | undefined): string {
  if (!tooth || tooth.conditions.length === 0) return '';
  for (const c of CONDITION_PRIORITY) {
    if (tooth.conditions.some((cc) => cc.condition === c)) return c;
  }
  return tooth.conditions[0].condition;
}

function ToothButton({
  n,
  tooth,
  onClick,
  dataTestId,
}: {
  n: number;
  tooth: ToothRow | undefined;
  onClick: () => void;
  dataTestId?: string;
}) {
  const wc = worstCondition(tooth);
  const hasAny = (tooth?.conditions.length ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooth-list-item={n}
      data-testid={dataTestId}
      className={cn(
        'relative flex items-center justify-center',
        'h-12 w-12 rounded-full border-2 text-sm font-semibold',
        'transition-colors',
        hasAny
          ? `${CONDITION_BG[wc] ?? 'bg-muted'} border-transparent text-white`
          : 'bg-background border-border text-foreground hover:border-primary/50',
      )}
    >
      {n}
      {hasAny ? (
        <span
          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background text-[10px] font-bold flex items-center justify-center border"
          aria-label={`${tooth?.conditions.length} conditions`}
        >
          {tooth?.conditions.length}
        </span>
      ) : null}
    </button>
  );
}

export function ToothListPicker({
  teeth,
  onPick,
}: {
  teeth: ToothRow[];
  onPick: (tooth: number) => void;
}) {
  const t = useTranslations('odontogram');
  const toothMap: Record<number, ToothRow> = {};
  for (const t of teeth) toothMap[t.tooth_number] = t;

  const renderRow = (
    label: string,
    arr: number[],
    testId: string,
  ) => (
    <div className="space-y-1" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {arr.map((n) => (
          <ToothButton
            key={n}
            n={n}
            tooth={toothMap[n]}
            onClick={() => onPick(n)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="tooth-list-picker">
      {renderRow(t('archUpperRight'), UPPER_RIGHT, 'list-upper-right')}
      {renderRow(t('archUpperLeft'), UPPER_LEFT, 'list-upper-left')}
      {renderRow(t('archLowerRight'), LOWER_RIGHT, 'list-lower-right')}
      {renderRow(t('archLowerLeft'), LOWER_LEFT, 'list-lower-left')}
    </div>
  );
}
