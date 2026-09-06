'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  addMedicalTag,
  deleteMedicalTag,
} from '@/server/actions/medical-tags';
import {
  MEDICAL_TAG_FIELDS,
  MEDICAL_TAG_FIELDS_LABEL_KEYS,
  type MedicalTagField,
} from '@/lib/medical-tags';

export function MedicalTagsManager({
  initial,
}: {
  initial: Record<string, string[]>;
}) {
  const t = useTranslations('settings');
  const tp = useTranslations('patients');
  const [tags, setTags] = useState<Record<string, string[]>>(initial);
  const [field, setField] = useState<MedicalTagField>('current_medications');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const clean = term.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    const res = await addMedicalTag(field, clean);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTerm('');
    if (!tags[field].some((x) => x.toLowerCase() === res.term.toLowerCase())) {
      setTags((prev) => ({ ...prev, [field]: [...prev[field], res.term] }));
    }
  }

  async function handleDelete(term: string) {
    const res = await deleteMedicalTag(field, term);
    if (res.ok) {
      setTags((prev) => ({
        ...prev,
        [field]: prev[field].filter((x) => x !== res.term),
      }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-48">
          <label className="text-sm font-medium" htmlFor="mt-field">
            {t('tagField')}
          </label>
          <select
            id="mt-field"
            className="flex h-10 w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={field}
            onChange={(e) => setField(e.target.value as MedicalTagField)}
          >
            {MEDICAL_TAG_FIELDS.map((f) => (
              <option key={f} value={f}>
                {tp(MEDICAL_TAG_FIELDS_LABEL_KEYS[f])}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 gap-2">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('tagTermPlaceholder')}
            className="min-h-[44px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" onClick={handleAdd} disabled={busy || !term.trim()}>
            {t('addTag')}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        {tags[field].map((term) => (
          <Badge key={term} variant="secondary" className="gap-1.5 px-2 py-1">
            {term}
            <button
              type="button"
              aria-label={t('removeTag', { term })}
              onClick={() => handleDelete(term)}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </Badge>
        ))}
        {tags[field].length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noTags')}</p>
        ) : null}
      </div>
    </div>
  );
}