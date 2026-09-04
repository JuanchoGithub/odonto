'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  setToothCondition,
  clearToothSurface,
  getOdontogram,
  type ToothRow,
} from '@/server/actions/odontogram';
import {
  ToothSvg,
  SURFACE_KEYS,
  CONDITION_COLOR,
  CONDITION_TEXT,
  type SurfaceKey,
} from './tooth-svg';
import { ConditionChip } from './condition-chip';

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const ALL_CONDITIONS = [
  'caries',
  'filling',
  'crown',
  'root_canal',
  'missing',
  'impacted',
  'fracture',
  'sealant',
  'implant',
  'healthy',
] as const;

const ALL_SURFACES = [
  'occlusal',
  'buccal',
  'lingual',
  'mesial',
  'distal',
  'root',
  'whole',
] as const;

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
    if (tooth.conditions.find((cc) => cc.surface === c || cc.condition === c))
      return c;
  }
  return tooth.conditions[0].condition;
}

type SurfaceState = { surface: SurfaceKey; condition: string };

function upsertSurfaceLocal(
  teeth: ToothRow[],
  tooth: number,
  surface: SurfaceKey,
  condition: string,
): ToothRow[] {
  const next = teeth.filter((t) => t.tooth_number !== tooth);
  const existing = teeth.find((t) => t.tooth_number === tooth);
  const conditions = (existing?.conditions ?? []).filter(
    (c) => c.surface !== surface,
  );
  conditions.push({ surface, condition, note: null });
  next.push({ tooth_number: tooth, conditions });
  return next.sort((a, b) => a.tooth_number - b.tooth_number);
}

function removeSurfaceLocal(
  teeth: ToothRow[],
  tooth: number,
  surface: SurfaceKey,
): ToothRow[] {
  const existing = teeth.find((t) => t.tooth_number === tooth);
  if (!existing) return teeth;
  const conditions = existing.conditions.filter((c) => c.surface !== surface);
  const next = teeth.filter((t) => t.tooth_number !== tooth);
  if (conditions.length > 0) {
    next.push({ tooth_number: tooth, conditions });
  }
  return next.sort((a, b) => a.tooth_number - b.tooth_number);
}

export function Odontogram({
  initial,
  patientId,
}: {
  initial: ToothRow[];
  patientId: string;
  locale: string;
}) {
  const t = useTranslations('odontogram');
  const tCommon = useTranslations('common');
  const { push: toast } = useToast();

  const [teeth, setTeeth] = useState<ToothRow[]>(initial);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<SurfaceKey | null>(null);
  const [hoverSurface, setHoverSurface] = useState<SurfaceKey | null>(null);

  const [paintMode, setPaintMode] = useState<string | null>(null);
  const [draggingCondition, setDraggingCondition] = useState<string | null>(null);
  const [dragOverSurface, setDragOverSurface] = useState<{
    tooth: number;
    surface: SurfaceKey;
  } | null>(null);

  const [pickerTooth, setPickerTooth] = useState<number | null>(null);
  const [pickerSurface, setPickerSurface] = useState<string>('whole');
  const [pickerCondition, setPickerCondition] = useState<string>('healthy');
  const [pickerNote, setPickerNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const toothMap = useMemo<Record<number, ToothRow>>(() => {
    const m: Record<number, ToothRow> = {};
    for (const t of teeth) m[t.tooth_number] = t;
    return m;
  }, [teeth]);

  const applyCondition = useCallback(
    async (
      tooth: number,
      surface: SurfaceKey,
      condition: string,
      note = '',
    ) => {
      const previous = teeth;
      setTeeth((curr) => upsertSurfaceLocal(curr, tooth, surface, condition));
      try {
        const fd = new FormData();
        fd.set('tooth_number', String(tooth));
        fd.set('surface', surface);
        fd.set('condition', condition);
        fd.set('note', note);
        const res = await setToothCondition(patientId, fd);
        if (res && 'error' in res && res.error) {
          setTeeth(previous);
          toast({
            title: 'Error',
            description: String(res.error),
            variant: 'destructive',
          });
        }
      } catch (e) {
        setTeeth(previous);
        toast({
          title: 'Error',
          description: String(e),
          variant: 'destructive',
        });
      }
    },
    [teeth, patientId, toast],
  );

  const clearSurface = useCallback(
    async (tooth: number, surface: SurfaceKey) => {
      const previous = teeth;
      setTeeth((curr) => removeSurfaceLocal(curr, tooth, surface));
      try {
        const fd = new FormData();
        fd.set('tooth_number', String(tooth));
        fd.set('surface', surface);
        const res = await clearToothSurface(patientId, fd);
        if (res && 'error' in res && res.error) {
          setTeeth(previous);
          toast({
            title: 'Error',
            description: String(res.error),
            variant: 'destructive',
          });
        }
      } catch (e) {
        setTeeth(previous);
        toast({
          title: 'Error',
          description: String(e),
          variant: 'destructive',
        });
      }
    },
    [teeth, patientId, toast],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPaintMode(null);
        setSelectedSurface(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSurfaceClick = useCallback(
    (tooth: number, surface: SurfaceKey) => {
      setSelectedTooth(tooth);
      setSelectedSurface(surface);
      setPickerTooth(tooth);
      setPickerSurface(surface);
      const existing = toothMap[tooth]?.conditions.find(
        (c) => c.surface === surface,
      );
      if (existing) {
        setPickerCondition(existing.condition);
        setPickerNote(existing.note ?? '');
      } else {
        setPickerNote('');
      }
      if (paintMode) {
        void applyCondition(tooth, surface, paintMode);
      }
    },
    [applyCondition, paintMode, toothMap],
  );

  const handleConditionChipClick = useCallback(
    (condition: string) => {
      if (paintMode === condition) {
        setPaintMode(null);
        return;
      }
      setPaintMode(condition);
      if (selectedTooth != null && selectedSurface != null) {
        setPickerCondition(condition);
        void applyCondition(selectedTooth, selectedSurface, condition);
      }
    },
    [paintMode, selectedTooth, selectedSurface, applyCondition],
  );

  const handleChipDragStart = useCallback(
    (condition: string) => (e: React.DragEvent) => {
      setDraggingCondition(condition);
      e.dataTransfer.setData('text/condition', condition);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [],
  );

  const handleSurfaceDragOver = useCallback(
    (surface: SurfaceKey, e: React.DragEvent) => {
      if (!draggingCondition) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [draggingCondition],
  );

  const handleSurfaceDrop = useCallback(
    (tooth: number) => (surface: SurfaceKey, e: React.DragEvent) => {
      e.preventDefault();
      const condition =
        e.dataTransfer.getData('text/condition') || draggingCondition;
      setDraggingCondition(null);
      setDragOverSurface(null);
      if (!condition) return;
      setSelectedTooth(tooth);
      setSelectedSurface(surface);
      setPickerTooth(tooth);
      setPickerSurface(surface);
      setPickerCondition(condition);
      void applyCondition(tooth, surface, condition);
    },
    [applyCondition, draggingCondition],
  );

  const handleSurfaceContext = useCallback(
    (tooth: number, surface: SurfaceKey) => {
      const existing = toothMap[tooth]?.conditions.find(
        (c) => c.surface === surface,
      );
      if (existing) {
        void clearSurface(tooth, surface);
      }
    },
    [clearSurface, toothMap],
  );

  const handlePickerSave = useCallback(async () => {
    if (pickerTooth == null) return;
    setSaving(true);
    const fd = new FormData();
    fd.set('tooth_number', String(pickerTooth));
    fd.set('surface', pickerSurface);
    fd.set('condition', pickerCondition);
    fd.set('note', pickerNote);
    const previous = teeth;
    setTeeth((curr) =>
      (ALL_SURFACES as readonly string[]).includes(pickerSurface)
        ? upsertSurfaceLocal(
            curr,
            pickerTooth,
            pickerSurface as SurfaceKey,
            pickerCondition,
          )
        : curr,
    );
    try {
      const res = await setToothCondition(patientId, fd);
      if (res && 'error' in res && res.error) {
        setTeeth(previous);
        toast({
          title: 'Error',
          description: String(res.error),
          variant: 'destructive',
        });
      } else {
        const refreshed = await getOdontogram(patientId);
        setTeeth(refreshed);
        setPickerNote('');
      }
    } catch (e) {
      setTeeth(previous);
      toast({
        title: 'Error',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [pickerTooth, pickerSurface, pickerCondition, pickerNote, patientId, teeth, toast]);

  function renderTooth(n: number) {
    const tooth = toothMap[n];
    const wc = worstCondition(tooth);
    const surfaces: SurfaceState[] = (tooth?.conditions ?? [])
      .filter((c): c is { surface: SurfaceKey; condition: string; note: string | null } =>
        (SURFACE_KEYS as readonly string[]).includes(c.surface),
      )
      .map((c) => ({ surface: c.surface as SurfaceKey, condition: c.condition }));
    return (
      <div
        key={n}
        className="flex flex-col items-center gap-0.5"
      >
        <ToothSvg
          toothNumber={n}
          conditions={surfaces}
          selectedSurface={
            selectedTooth === n ? selectedSurface : null
          }
          hoverSurface={
            dragOverSurface?.tooth === n ? dragOverSurface.surface : hoverSurface
          }
          paintMode={paintMode != null}
          onSurfaceClick={(s) => handleSurfaceClick(n, s)}
          onSurfaceContext={(s) => handleSurfaceContext(n, s)}
          onSurfaceMouseEnter={() => {}}
          onSurfaceMouseLeave={() => setHoverSurface(null)}
          onSurfaceDragOver={handleSurfaceDragOver}
          onSurfaceDrop={handleSurfaceDrop(n)}
          onSurfaceDragLeave={() => setDragOverSurface(null)}
          draggingCondition={draggingCondition}
          worstConditionClass={wc ? CONDITION_COLOR[wc] : ''}
          worstConditionTextClass={wc ? CONDITION_TEXT[wc] : ''}
        />
      </div>
    );
  }

  const selectedToothRow =
    selectedTooth != null ? toothMap[selectedTooth] : undefined;

  return (
    <div
      className="space-y-4"
      data-testid="odontogram-root"
      onMouseLeave={() => setHoverSurface(null)}
    >
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-center">
            <div className="space-y-2">
              <div className="flex gap-1 justify-center" data-testid="upper-row">
                {UPPER_RIGHT.map(renderTooth)}
                {UPPER_LEFT.map(renderTooth)}
              </div>
              <div className="border-t-2 border-b-2 border-dashed" />
              <div className="flex gap-1 justify-center" data-testid="lower-row">
                {LOWER_RIGHT.map(renderTooth)}
                {LOWER_LEFT.map(renderTooth)}
              </div>
            </div>
          </div>

          <div
            className={cn(
              'flex flex-wrap items-center gap-2 justify-center text-xs pt-2',
              paintMode && 'rounded-md bg-primary/5 p-2',
            )}
            data-testid="condition-legend"
          >
            {paintMode ? (
              <span
                data-testid="paint-mode-banner"
                className="font-medium text-primary"
              >
                {t('paintModeActive', { condition: t(`conditions.${paintMode}` as any) })}
              </span>
            ) : null}
            {ALL_CONDITIONS.map((c) => (
              <ConditionChip
                key={c}
                condition={c}
                label={t(`conditions.${c}` as any)}
                active={paintMode === c}
                paintModeActive={paintMode != null}
                onClick={() => handleConditionChipClick(c)}
                onDragStart={handleChipDragStart(c)}
                onDragEnd={() => {
                  setDraggingCondition(null);
                  setDragOverSurface(null);
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="font-medium flex items-center justify-between">
            <span>
              {t('advancedPicker')}
              {pickerTooth != null ? ` — ${t('tooth')} ${pickerTooth}` : ''}
            </span>
            {pickerTooth != null && selectedSurface ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="picker-surface-label"
              >
                {t('surfaceSelected', {
                  surface: t(`surfaces.${selectedSurface}` as any),
                })}
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('surface')}</label>
              <Select
                value={pickerSurface}
                onValueChange={(v) => setPickerSurface(v)}
              >
                <SelectTrigger data-testid="picker-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SURFACES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`surfaces.${s}` as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('condition')}</label>
              <Select
                value={pickerCondition}
                onValueChange={(v) => setPickerCondition(v)}
              >
                <SelectTrigger data-testid="picker-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`conditions.${c}` as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">{t('note')}</label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={pickerNote}
                onChange={(e) => setPickerNote(e.target.value)}
                data-testid="picker-note"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handlePickerSave}
              disabled={saving || pickerTooth == null}
              data-testid="picker-save"
            >
              {saving ? tCommon('loading') : tCommon('save')}
            </Button>
          </div>
          {selectedToothRow ? (
            <div
              className="text-sm text-muted-foreground space-y-1 border-t pt-3"
              data-testid="picker-existing"
            >
              {selectedToothRow.conditions.map((c, i) => (
                <div key={i}>
                  <span className="font-medium">
                    {t(`surfaces.${c.surface}` as any)}:
                  </span>{' '}
                  {t(`conditions.${c.condition}` as any)}
                  {c.note ? ` — ${c.note}` : ''}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
