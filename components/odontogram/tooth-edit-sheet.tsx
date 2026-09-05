'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConditionChip } from './condition-chip';
import {
  SURFACE_KEYS,
  CONDITION_BG,
  type SurfaceKey,
} from './tooth-svg';

const ALL_SURFACES: SurfaceKey[] = [
  'occlusal',
  'buccal',
  'lingual',
  'mesial',
  'distal',
  'whole',
];

const SURFACE_GLYPH: Record<SurfaceKey, string> = {
  occlusal: 'O',
  buccal: 'B',
  lingual: 'L',
  mesial: 'M',
  distal: 'D',
  whole: '⌖',
};

export function ToothEditSheet({
  open,
  onOpenChange,
  tooth,
  initialSurface,
  initialCondition,
  initialNote,
  paintedSurfaces,
  onSave,
  onClear,
  onClearTooth,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tooth: number | null;
  initialSurface: SurfaceKey;
  initialCondition: string;
  initialNote: string;
  paintedSurfaces: { surface: SurfaceKey | 'whole'; condition: string }[];
  onSave: (args: {
    surface: SurfaceKey;
    condition: string;
    note: string;
  }) => void;
  onClear: (surface: SurfaceKey) => void;
  onClearTooth: () => void;
  saving: boolean;
}) {
  const t = useTranslations('odontogram');
  const tCommon = useTranslations('common');
  const [surface, setSurface] = useState<SurfaceKey>(initialSurface);
  const [condition, setCondition] = useState<string>(initialCondition);
  const [note, setNote] = useState<string>(initialNote);

  useEffect(() => {
    if (open) {
      setSurface(initialSurface);
      setCondition(initialCondition);
      setNote(initialNote);
    }
  }, [open, initialSurface, initialCondition, initialNote]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          data-testid="tooth-edit-sheet"
          className={cn(
            'fixed z-50 bg-background border shadow-xl',
            'inset-x-0 bottom-0 rounded-t-2xl p-4 pb-6',
            'max-h-[90vh] overflow-y-auto',
            'md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto',
            'md:-translate-x-1/2 md:-translate-y-1/2',
            'md:w-full md:max-w-md md:rounded-lg md:p-6',
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {tooth != null ? `${t('tooth')} ${tooth}` : t('editSurface')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="tooth-edit-close"
                aria-label={tCommon('cancel')}
              >
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium mb-2">{t('surface')}</div>
              <div
                className="grid grid-cols-6 gap-2"
                data-testid="sheet-surface-grid"
              >
                {ALL_SURFACES.map((s) => {
                  const painted = paintedSurfaces.find(
                    (p) => p.surface === s,
                  );
                  const isSelected = surface === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSurface(s)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (painted) onClear(s);
                      }}
                      data-testid={`sheet-surface-${s}`}
                      className={cn(
                        'h-12 rounded-md border-2 text-sm font-semibold',
                        'flex flex-col items-center justify-center gap-0.5',
                        painted
                          ? `${CONDITION_BG[painted.condition] ?? ''} border-transparent text-white`
                          : 'bg-background border-border text-foreground',
                        isSelected && 'ring-2 ring-primary',
                      )}
                      title={painted ? `${t('clearSurface')} (${s})` : s}
                    >
                      <span className="text-base leading-none">
                        {SURFACE_GLYPH[s]}
                      </span>
                      <span className="text-[10px] leading-none opacity-80">
                        {t(`surfaces.${s}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">{t('condition')}</div>
              <div
                className="flex flex-wrap gap-2"
                data-testid="sheet-condition-grid"
              >
                {Object.keys(CONDITION_BG).map((c) => (
                  <ConditionChip
                    key={c}
                    condition={c}
                    label={t(`conditions.${c}` as any)}
                    active={condition === c}
                    paintModeActive={false}
                    onClick={() => setCondition(c)}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">{t('note')}</div>
              <textarea
                data-testid="sheet-note"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={onClearTooth}
                disabled={saving}
                data-testid="sheet-clear"
              >
                {t('clearTooth')}
              </Button>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button variant="outline" data-testid="sheet-cancel">
                    {tCommon('cancel')}
                  </Button>
                </Dialog.Close>
                <Button
                  onClick={() => onSave({ surface, condition, note })}
                  disabled={saving}
                  data-testid="sheet-save"
                >
                  {saving ? tCommon('loading') : tCommon('save')}
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
