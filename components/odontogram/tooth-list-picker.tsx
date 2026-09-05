'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CONDITION_BG } from './tooth-svg';

type SurfaceRow = { surface: string; condition: string };
type ToothRow = { tooth_number: number; conditions: SurfaceRow[] };

const UPPER_RIGHT_ADULT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT_ADULT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT_ADULT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT_ADULT = [31, 32, 33, 34, 35, 36, 37, 38];

const UPPER_RIGHT_KID = [55, 54, 53, 52, 51];
const UPPER_LEFT_KID = [61, 62, 63, 64, 65];
const LOWER_RIGHT_KID = [85, 84, 83, 82, 81];
const LOWER_LEFT_KID = [71, 72, 73, 74, 75];

// "Whole-tooth" conditions render as overlays in the chart; in the list
// picker we just use their color to tint the button.
const CONDITION_PRIORITY = [
  'missing',
  'perno',
  'crown',
  'to_extract',
  'sealant',
  'conduct_todo',
  'conduct_done',
  'caries',
  'restoration',
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
        'h-14 w-14 min-h-[56px] min-w-[56px] rounded-full border-2 text-base font-semibold',
        'transition-colors active:scale-95',
        hasAny
          ? `${CONDITION_BG[wc] ?? 'bg-muted'} border-transparent text-white`
          : 'bg-background border-border text-foreground hover:border-primary/50',
      )}
    >
      {n}
      {hasAny ? (
        <span
          className="absolute -top-1 -right-1 h-5 min-h-[20px] w-5 min-w-[20px] rounded-full bg-background text-[11px] font-bold flex items-center justify-center border"
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
  variant = 'adult',
}: {
  teeth: ToothRow[];
  onPick: (tooth: number) => void;
  variant?: 'adult' | 'kid';
}) {
  const t = useTranslations('odontogram');
  const toothMap: Record<number, ToothRow> = {};
  for (const tt of teeth) toothMap[tt.tooth_number] = tt;

  const sets =
    variant === 'kid'
      ? {
          upperRight: UPPER_RIGHT_KID,
          upperLeft: UPPER_LEFT_KID,
          lowerRight: LOWER_RIGHT_KID,
          lowerLeft: LOWER_LEFT_KID,
        }
      : {
          upperRight: UPPER_RIGHT_ADULT,
          upperLeft: UPPER_LEFT_ADULT,
          lowerRight: LOWER_RIGHT_ADULT,
          lowerLeft: LOWER_LEFT_ADULT,
        };

  const renderRow = (
    label: string,
    arr: number[],
    testId: string,
  ) => (
    <div className="space-y-1" data-testid={testId}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-1 font-medium">
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
    <div
      className="space-y-3"
      data-testid="tooth-list-picker"
      data-variant={variant}
    >
      {renderRow(t('archUpperRight'), sets.upperRight, 'list-upper-right')}
      {renderRow(t('archUpperLeft'), sets.upperLeft, 'list-upper-left')}
      {renderRow(t('archLowerRight'), sets.lowerRight, 'list-lower-right')}
      {renderRow(t('archLowerLeft'), sets.lowerLeft, 'list-lower-left')}
    </div>
  );
}
