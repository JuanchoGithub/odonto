'use client';
import { useState, useTransition } from 'react';
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
import { cn } from '@/lib/utils';
import { setToothCondition, getOdontogram, type ToothRow } from '@/server/actions/odontogram';
import { es, enUS } from 'date-fns/locale';
import type { AppLocale } from '@/lib/schemas/common';

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

const ALL = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT];

const SURFACES: Array<{
  key: 'occlusal' | 'buccal' | 'lingual' | 'mesial' | 'distal' | 'whole';
  label: string;
  position: string;
}> = [
  { key: 'occlusal', label: 'O', position: 'center' },
  { key: 'buccal', label: 'B', position: 'top' },
  { key: 'lingual', label: 'L', position: 'bottom' },
  { key: 'mesial', label: 'M', position: 'left' },
  { key: 'distal', label: 'D', position: 'right' },
];

const CONDITION_COLOR: Record<string, string> = {
  caries: 'bg-red-500 text-white',
  filling: 'bg-blue-500 text-white',
  crown: 'bg-yellow-500 text-black',
  root_canal: 'bg-purple-500 text-white',
  missing: 'bg-gray-700 text-white',
  impacted: 'bg-orange-500 text-white',
  fracture: 'bg-rose-600 text-white',
  sealant: 'bg-cyan-500 text-white',
  implant: 'bg-slate-500 text-white',
  healthy: 'bg-emerald-500 text-white',
};

export function Odontogram({
  initial,
  patientId,
  locale,
}: {
  initial: ToothRow[];
  patientId: string;
  locale: AppLocale;
}) {
  const t = useTranslations('odontogram');
  const tCommon = useTranslations('common');
  const [teeth, setTeeth] = useState(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [surface, setSurface] = useState<typeof SURFACES[number]['key']>('whole');
  const [condition, setCondition] = useState('healthy');
  const [note, setNote] = useState('');
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const toothMap: Record<number, ToothRow> = {};
  for (const t of teeth) toothMap[t.tooth_number] = t;

  function worstCondition(tooth: ToothRow | undefined): string {
    if (!tooth || tooth.conditions.length === 0) return '';
    // priority order
    const order = [
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
    ];
    for (const c of order) {
      if (tooth.conditions.find((cc) => cc.condition === c)) return c;
    }
    return tooth.conditions[0].condition;
  }

  async function save() {
    if (selected == null) return;
    setSaving(true);
    const fd = new FormData();
    fd.set('tooth_number', String(selected));
    fd.set('surface', surface);
    fd.set('condition', condition);
    fd.set('note', note);
    await setToothCondition(patientId, fd);
    const next = await getOdontogram(patientId);
    setTeeth(next);
    setNote('');
    setSaving(false);
  }

  function renderTooth(n: number) {
    const tooth = toothMap[n];
    const wc = worstCondition(tooth);
    const isSelected = selected === n;
    return (
      <button
        key={n}
        type="button"
        onClick={() => setSelected(n)}
        className={cn(
          'relative w-10 h-12 border rounded-md transition-all',
          wc ? CONDITION_COLOR[wc] : 'bg-background',
          isSelected && 'ring-2 ring-primary',
        )}
        title={`Tooth ${n}`}
      >
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
          {n}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-center">
            <div className="space-y-2">
              <div className="flex gap-1 justify-center">
                {[...UPPER_RIGHT].reverse().map((n) => renderTooth(n))}
                {[...UPPER_LEFT].map((n) => renderTooth(n))}
              </div>
              <div className="border-t-2 border-b-2 border-dashed" />
              <div className="flex gap-1 justify-center">
                {[...LOWER_LEFT].reverse().map((n) => renderTooth(n))}
                {[...LOWER_RIGHT].map((n) => renderTooth(n))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 justify-center text-xs">
            {Object.entries(CONDITION_COLOR).map(([c, cls]) => (
              <span key={c} className={cn('px-2 py-1 rounded', cls)}>
                {t(`conditions.${c}` as any)}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected != null ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="font-medium">
              {t('tooth')} {selected}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('surface')}</label>
                <Select
                  value={surface}
                  onValueChange={(v) => setSurface(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SURFACES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {t(`surfaces.${s.key}` as any)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('condition')}</label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CONDITION_COLOR).map((c) => (
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
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
            {toothMap[selected] ? (
              <div className="text-sm text-muted-foreground space-y-1 border-t pt-3">
                {toothMap[selected].conditions.map((c, i) => (
                  <div key={i}>
                    <span className="font-medium">{t(`surfaces.${c.surface}` as any)}:</span>{' '}
                    {t(`conditions.${c.condition}` as any)}
                    {c.note ? ` — ${c.note}` : ''}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
