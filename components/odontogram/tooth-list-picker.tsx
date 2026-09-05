'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ToothSvg, type SurfaceKey } from './tooth-svg';

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

// Whole-tooth conditions: if a tooth has one of these we render the SVG
// overlay (red X, red ring, blue parallel slashes, red disc, red bar, TC
// badge) — same dental-charting standard as the desktop chart.
const WHOLE_CONDITIONS = new Set([
  'missing',
  'crown',
  'to_extract',
  'perno',
  'sealant',
  'conduct_todo',
  'conduct_done',
]);

function pickWhole(tooth: ToothRow | undefined): string | null {
  if (!tooth) return null;
  const found = tooth.conditions.find((c) => WHOLE_CONDITIONS.has(c.condition));
  return found?.condition ?? null;
}

function pickSurfaceConditions(
  tooth: ToothRow | undefined,
): { surface: SurfaceKey; condition: string }[] {
  if (!tooth) return [];
  return tooth.conditions
    .filter((c) => !WHOLE_CONDITIONS.has(c.condition))
    .map((c) => ({ surface: c.surface as SurfaceKey, condition: c.condition }));
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
  const whole = pickWhole(tooth);
  const surfaceStates = pickSurfaceConditions(tooth);
  const hasAny = (tooth?.conditions.length ?? 0) > 0;
  // Slightly larger button area than the tooth itself so the touch target
  // meets the 44×44 iOS HIG; the SVG is centered inside.
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooth-list-item={n}
      data-testid={dataTestId}
      aria-label={`Tooth ${n}${hasAny ? `, ${tooth?.conditions.length} conditions` : ''}`}
      className={cn(
        'relative flex items-center justify-center',
        'h-14 w-14 min-h-[56px] min-w-[56px] rounded-lg border-2',
        'transition-colors active:scale-95 bg-white dark:bg-background',
        hasAny
          ? 'border-transparent'
          : 'border-border hover:border-primary/50',
      )}
    >
      {/* Real tooth SVG — identical to the desktop chart at this size.
          The SVG covers up to ~52px tall; the button is 56px to give
          2px of touch padding. The SVG is non-interactive (pointer-events:none)
          so the entire button is one tap target. */}
      <ToothSvg
        toothNumber={n}
        conditions={surfaceStates}
        whole={whole ? { condition: whole } : null}
        selectedSurface={null}
        hoverSurface={null}
        paintMode={false}
        onSurfaceClick={() => {}}
        onSurfaceMouseEnter={() => {}}
        onSurfaceMouseLeave={() => {}}
        onSurfaceDragOver={() => {}}
        onSurfaceDrop={() => {}}
        onSurfaceDragLeave={() => {}}
        draggingCondition={null}
        className="pointer-events-none h-12 w-12"
      />
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
