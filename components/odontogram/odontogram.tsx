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
  clearTooth,
  getOdontogram,
  type ToothRow,
  type OdontogramMode,
} from '@/server/actions/odontogram';
import {
  ToothSvg,
  SURFACE_KEYS,
  type SurfaceKey,
} from './tooth-svg';
import { ConditionChip } from './condition-chip';
import { ToothListPicker } from './tooth-list-picker';
import { ToothEditSheet } from './tooth-edit-sheet';

// Adult dentition (FDI): 18-11 on screen-left, 21-28 on screen-right
const UPPER_RIGHT_ADULT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT_ADULT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT_ADULT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT_ADULT = [31, 32, 33, 34, 35, 36, 37, 38];

// Pediatric (primary) dentition: 55-51 on screen-left, 61-65 on screen-right
const UPPER_RIGHT_KID = [55, 54, 53, 52, 51];
const UPPER_LEFT_KID = [61, 62, 63, 64, 65];
const LOWER_RIGHT_KID = [85, 84, 83, 82, 81];
const LOWER_LEFT_KID = [71, 72, 73, 74, 75];

// The full set of conditions the user can apply. Per-surface (caries,
// restoration) use surface wedges; the rest are whole-tooth overlays.
export const ALL_CONDITIONS = [
  'caries',
  'restoration',
  'missing',
  'crown',
  'to_extract',
  'perno',
  'sealant',
  'conduct_todo',
  'conduct_done',
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

const WHOLE_CONDITIONS = new Set([
  'missing',
  'crown',
  'to_extract',
  'perno',
  'sealant',
  'conduct_todo',
  'conduct_done',
]);

type SurfaceState = { surface: SurfaceKey; condition: string };
type WholeState = { condition: string };

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
  mode,
}: {
  initial: ToothRow[];
  patientId: string;
  locale: string;
  mode: OdontogramMode;
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
  const [pickerCondition, setPickerCondition] = useState<string>(
    ALL_CONDITIONS[0],
  );
  const [pickerNote, setPickerNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTooth, setSheetTooth] = useState<number | null>(null);
  const [sheetInitialSurface, setSheetSurface] = useState<SurfaceKey>('occlusal');
  const [sheetInitialCondition, setSheetInitialCondition] = useState<string>(
    ALL_CONDITIONS[0],
  );
  const [sheetInitialNote, setSheetInitialNote] = useState<string>('');

  const toothMap = useMemo<Record<number, ToothRow>>(() => {
    const m: Record<number, ToothRow> = {};
    for (const tt of teeth) m[tt.tooth_number] = tt;
    return m;
  }, [teeth]);

  const paintedSurfacesFor = useCallback(
    (n: number | null): { surface: SurfaceKey | 'whole'; condition: string }[] => {
      if (n == null) return [];
      const row = toothMap[n];
      if (!row) return [];
      return row.conditions
        .filter((c) =>
          (SURFACE_KEYS as readonly string[]).includes(c.surface) ||
          c.surface === 'whole',
        )
        .map((c) => ({ surface: c.surface as SurfaceKey | 'whole', condition: c.condition }));
    },
    [toothMap],
  );

  const wholeFor = useCallback(
    (n: number | null): WholeState | null => {
      if (n == null) return null;
      const row = toothMap[n];
      if (!row) return null;
      const whole = row.conditions.find((c) => c.surface === 'whole');
      if (!whole) return null;
      if (!WHOLE_CONDITIONS.has(whole.condition)) return null;
      return { condition: whole.condition };
    },
    [toothMap],
  );

  const clearWholeTooth = useCallback(
    async (tooth: number) => {
      const previous = teeth;
      setTeeth((curr) => curr.filter((t) => t.tooth_number !== tooth));
      try {
        const fd = new FormData();
        fd.set('tooth_number', String(tooth));
        const res = await clearTooth(patientId, fd);
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

  const clearOneSurface = useCallback(
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

  const applyCondition = useCallback(
    async (
      tooth: number,
      surface: SurfaceKey,
      condition: string,
      note = '',
    ) => {
      // 'clean' (Sano) erases the whole tooth instead of painting.
      if (condition === 'clean') {
        await clearWholeTooth(tooth);
        return;
      }
      // Whole-tooth conditions (missing, crown, to_extract, perno, sealant,
      // conduct_todo, conduct_done) are always stored on the 'whole' surface
      // so the tooth renders its symbol — no matter which part was clicked.
      const routed: SurfaceKey = WHOLE_CONDITIONS.has(condition)
        ? 'whole'
        : surface;
      // Toggle: clicking the same condition again on the same spot removes
      // it — the fastest way to mend a misclick.
      const alreadyThere = teeth
        .find((t) => t.tooth_number === tooth)
        ?.conditions.some(
          (c) => c.surface === routed && c.condition === condition,
        );
      if (alreadyThere) {
        await clearOneSurface(tooth, routed);
        return;
      }
      const previous = teeth;
      setTeeth((curr) => upsertSurfaceLocal(curr, tooth, routed, condition));
      try {
        const fd = new FormData();
        fd.set('tooth_number', String(tooth));
        fd.set('surface', routed);
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
    [teeth, patientId, toast, clearWholeTooth, clearOneSurface],
  );

  const clearSurface = useCallback(
    async (tooth: number, surface: SurfaceKey) => {
      await clearOneSurface(tooth, surface);
    },
    [clearOneSurface],
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
      // Condition-first flow: clicking a chip only arms it.
      // Click a tooth surface afterwards to apply. Click again or Esc to disarm.
      if (paintMode === condition) {
        setPaintMode(null);
        return;
      }
      setPaintMode(condition);
    },
    [paintMode],
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
      const routed: SurfaceKey = WHOLE_CONDITIONS.has(condition)
        ? 'whole'
        : surface;
      setSelectedTooth(tooth);
      setSelectedSurface(surface);
      setPickerTooth(tooth);
      setPickerSurface(routed);
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
        return;
      }
      // No per-surface condition here but the tooth has a whole-tooth
      // symbol (missing, crown, ...) — clear that instead.
      const whole = toothMap[tooth]?.conditions.find(
        (c) => c.surface === 'whole',
      );
      if (whole) {
        void clearSurface(tooth, 'whole');
      }
    },
    [clearSurface, toothMap],
  );

  const handlePickerSave = useCallback(async () => {
    if (pickerTooth == null) return;
    setSaving(true);
    // 'clean' (Sano) erases the whole tooth instead of saving.
    if (pickerCondition === 'clean') {
      try {
        await clearWholeTooth(pickerTooth);
        setPickerNote('');
      } finally {
        setSaving(false);
      }
      return;
    }
    // Whole-tooth conditions always land on the 'whole' surface so the
    // tooth renders its symbol, even if another surface was picked.
    const routedSurface = WHOLE_CONDITIONS.has(pickerCondition)
      ? 'whole'
      : pickerSurface;
    const fd = new FormData();
    fd.set('tooth_number', String(pickerTooth));
    fd.set('surface', routedSurface);
    fd.set('condition', pickerCondition);
    fd.set('note', pickerNote);
    const previous = teeth;
    setTeeth((curr) =>
      (ALL_SURFACES as readonly string[]).includes(routedSurface)
        ? upsertSurfaceLocal(
            curr,
            pickerTooth,
            routedSurface as SurfaceKey,
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
  }, [pickerTooth, pickerSurface, pickerCondition, pickerNote, patientId, teeth, toast, clearWholeTooth]);

  const handlePickerClear = useCallback(async () => {
    if (pickerTooth == null) return;
    setSaving(true);
    try {
      await clearWholeTooth(pickerTooth);
      setPickerNote('');
    } finally {
      setSaving(false);
    }
  }, [pickerTooth, clearWholeTooth]);

  function renderTooth(n: number) {
    const tooth = toothMap[n];
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
          whole={wholeFor(n)}
          className="w-8 h-[44px] md:w-10 md:h-14 lg:w-14 lg:h-20"
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
        />
      </div>
    );
  }

  const selectedToothRow =
    selectedTooth != null ? toothMap[selectedTooth] : undefined;

  // Decide which rows to render based on the mode.
  const showAdult =
    mode.kind === 'adult' ||
    (mode.kind === 'both' && mode.order === 'adult-then-kid');
  const showKid =
    mode.kind === 'kid' ||
    (mode.kind === 'both' && mode.order === 'adult-then-kid') ||
    (mode.kind === 'both' && mode.order === 'kid-then-adult');

  type ChartSet = {
    label: string;
    testId: string;
    upperRight: number[];
    upperLeft: number[];
    lowerRight: number[];
    lowerLeft: number[];
  };

  const adultSet: ChartSet = {
    label: t('chartAdult'),
    testId: 'adult',
    upperRight: UPPER_RIGHT_ADULT,
    upperLeft: UPPER_LEFT_ADULT,
    lowerRight: LOWER_RIGHT_ADULT,
    lowerLeft: LOWER_LEFT_ADULT,
  };
  const kidSet: ChartSet = {
    label: t('chartKid'),
    testId: 'kid',
    upperRight: UPPER_RIGHT_KID,
    upperLeft: UPPER_LEFT_KID,
    lowerRight: LOWER_RIGHT_KID,
    lowerLeft: LOWER_LEFT_KID,
  };

  const charts: ChartSet[] = [];
  if (mode.kind === 'both' && mode.order === 'kid-then-adult') {
    charts.push(kidSet, adultSet);
  } else {
    if (showAdult) charts.push(adultSet);
    if (showKid) charts.push(kidSet);
  }

  return (
    <div
      className="space-y-4"
      data-testid="odontogram-root"
      onMouseLeave={() => setHoverSurface(null)}
    >
      {charts.map((chart, idx) => (
        <Card key={chart.testId} data-testid={`chart-${chart.testId}`}>
          <CardContent className="pt-6 space-y-4">
            <div className="text-sm font-medium text-muted-foreground">
              {chart.label}
            </div>
            <div className="flex justify-center">
              <div className="space-y-2 w-full">
                {/* Desktop / tablet: 2 rows with the dashed midline between them */}
                <div
                  className="hidden md:flex md:gap-1.5 md:justify-center"
                  data-testid={`upper-row-${chart.testId}`}
                >
                  {chart.upperRight.map(renderTooth)}
                  {chart.upperLeft.map(renderTooth)}
                </div>
                <div className="hidden md:block md:border-t-2 md:border-b-2 md:border-dashed" />
                <div
                  className="hidden md:flex md:gap-1.5 md:justify-center"
                  data-testid={`lower-row-${chart.testId}`}
                >
                  {chart.lowerRight.map(renderTooth)}
                  {chart.lowerLeft.map(renderTooth)}
                </div>

                {/* Mobile: 4-row tooth list. Tap a tooth to open the edit sheet. */}
                <div className="md:hidden">
                  <ToothListPicker
                    teeth={teeth}
                    variant={chart.testId as 'adult' | 'kid'}
                    onPick={(n) => {
                      setSheetTooth(n);
                      setSheetSurface('occlusal');
                      const existing = toothMap[n]?.conditions.find(
                        (c) => c.surface === 'occlusal',
                      );
                      setSheetInitialCondition(
                        existing?.condition ?? ALL_CONDITIONS[0],
                      );
                      setSheetInitialNote(existing?.note ?? '');
                      setSheetOpen(true);
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="pt-6 space-y-4">
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
            <ConditionChip
              key="clean"
              condition="clean"
              label={t('conditions.clean')}
              active={paintMode === 'clean'}
              paintModeActive={paintMode != null}
              onClick={() => handleConditionChipClick('clean')}
              onDragStart={handleChipDragStart('clean')}
              onDragEnd={() => {
                setDraggingCondition(null);
                setDragOverSurface(null);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="hidden md:block">
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
                onValueChange={(v) => {
                  setPickerCondition(v);
                  // Live-apply: changing the condition paints the selected
                  // tooth immediately (or clears it for 'clean').
                  if (pickerTooth != null) {
                    void applyCondition(
                      pickerTooth,
                      pickerSurface as SurfaceKey,
                      v,
                      pickerNote,
                    );
                  }
                }}
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
                  <SelectItem key="clean" value="clean">
                    {t('conditions.clean')}
                  </SelectItem>
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
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handlePickerClear}
              disabled={saving || pickerTooth == null}
              data-testid="picker-clear"
            >
              {t('clearTooth')}
            </Button>
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

      <ToothEditSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tooth={sheetTooth}
        initialSurface={sheetInitialSurface}
        initialCondition={sheetInitialCondition}
        initialNote={sheetInitialNote}
        paintedSurfaces={paintedSurfacesFor(sheetTooth)}
        saving={saving}
        onSave={async ({ surface, condition, note }) => {
          if (sheetTooth == null) return;
          setSaving(true);
          // 'clean' (Sano) erases the whole tooth instead of saving.
          if (condition === 'clean') {
            try {
              await clearWholeTooth(sheetTooth);
              setSheetOpen(false);
            } finally {
              setSaving(false);
            }
            return;
          }
          const routed: SurfaceKey = WHOLE_CONDITIONS.has(condition)
            ? 'whole'
            : surface;
          const previous = teeth;
          setTeeth((curr) =>
            upsertSurfaceLocal(curr, sheetTooth, routed, condition),
          );
          try {
            const fd = new FormData();
            fd.set('tooth_number', String(sheetTooth));
            fd.set('surface', routed);
            fd.set('condition', condition);
            fd.set('note', note);
            const res = await setToothCondition(patientId, fd);
            if (res && 'error' in res && res.error) {
              setTeeth(previous);
              toast({ title: 'Error', description: String(res.error), variant: 'destructive' });
            } else {
              const refreshed = await getOdontogram(patientId);
              setTeeth(refreshed);
              setSheetInitialNote('');
              setSheetOpen(false);
            }
          } catch (e) {
            setTeeth(previous);
            toast({ title: 'Error', description: String(e), variant: 'destructive' });
          } finally {
            setSaving(false);
          }
        }}
        onClear={async (surface) => {
          if (sheetTooth == null) return;
          const previous = teeth;
          setTeeth((curr) => removeSurfaceLocal(curr, sheetTooth, surface));
          try {
            const fd = new FormData();
            fd.set('tooth_number', String(sheetTooth));
            fd.set('surface', surface);
            const res = await clearToothSurface(patientId, fd);
            if (res && 'error' in res && res.error) {
              setTeeth(previous);
              toast({ title: 'Error', description: String(res.error), variant: 'destructive' });
            } else {
              const refreshed = await getOdontogram(patientId);
              setTeeth(refreshed);
            }
          } catch (e) {
            setTeeth(previous);
            toast({ title: 'Error', description: String(e), variant: 'destructive' });
          }
        }}
        onClearTooth={async () => {
          if (sheetTooth == null) return;
          setSaving(true);
          try {
            await clearWholeTooth(sheetTooth);
            setSheetOpen(false);
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
