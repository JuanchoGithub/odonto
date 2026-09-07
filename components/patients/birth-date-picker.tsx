'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const MIN_YEAR = 1900;

function parseIso(v: string | undefined | null): {
  y: string;
  m: string;
  d: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v ?? '').trim());
  if (!m) return { y: '', m: '', d: '' };
  return { y: m[1], m: m[2], d: m[3] };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Birth-date picker with fast year/month navigation on desktop.
 *
 * - Touch devices (coarse pointer, i.e. iOS): native `<input type="date">`
 *   unchanged — the iOS wheels already jump years quickly.
 * - Desktop (fine pointer): Year + Month + Day dropdowns that compose a
 *   `YYYY-MM-DD` hidden input, because Chrome/Edge's native calendar popup
 *   is a month-stepper with no year jump (~480 clicks for a 1980s DOB).
 *
 * Both paths submit the same `name`/`YYYY-MM-DD` value, so server actions
 * and validation are untouched. SSR renders the native input to avoid a
 * hydration mismatch, then swaps on desktop after mount.
 */
export function BirthDatePicker({
  id = 'birth_date',
  name = 'birth_date',
  defaultValue = '',
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
}) {
  const t = useTranslations('patients');
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  const [coarse, setCoarse] = useState(true);
  const initial = useMemo(
    () => parseIso(defaultValue ?? ''),
    // Parse once on mount — defaultValue is the patient's stored DOB.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [year, setYear] = useState(initial.y);
  const [month, setMonth] = useState(initial.m);
  const [day, setDay] = useState(initial.d);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && window.matchMedia) {
      setCoarse(window.matchMedia('(pointer: coarse)').matches);
    } else {
      setCoarse(false);
    }
  }, []);

  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(
    currentYear,
    /^\d{4}$/.test(year) ? Number(year) : currentYear,
  );
  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = maxYear; y >= MIN_YEAR; y--) out.push(String(y));
    return out;
  }, [maxYear]);

  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es' : 'en', {
      month: 'long',
    });
    return Array.from({ length: 12 }, (_, i) => {
      const label = fmt.format(new Date(2000, i, 1));
      return {
        value: pad2(i + 1),
        label: label.charAt(0).toUpperCase() + label.slice(1),
      };
    });
  }, [locale]);

  const daysInMonth =
    year && month
      ? new Date(Number(year), Number(month), 0).getDate()
      : 31;
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => pad2(i + 1)),
    [daysInMonth],
  );

  // Clamp Feb 29 → Feb 28 (etc.) when month/year changes.
  useEffect(() => {
    if (day && Number(day) > daysInMonth) setDay(pad2(daysInMonth));
  }, [day, daysInMonth]);

  if (!mounted || coarse) {
    return (
      <Input
        id={id}
        name={name}
        type="date"
        autoComplete="bday"
        max={`${currentYear}-12-31`}
        defaultValue={defaultValue ?? ''}
      />
    );
  }

  const iso = year && month && day ? `${year}-${month}-${day}` : '';

  return (
    <div>
      <input type="hidden" name={name} value={iso} />
      <div className="grid grid-cols-3 gap-2">
        <Select value={year || undefined} onValueChange={setYear}>
          <SelectTrigger id={id} data-testid="birth-date-year">
            <SelectValue placeholder={t('birthYear')} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month || undefined} onValueChange={setMonth}>
          <SelectTrigger data-testid="birth-date-month" aria-label={t('birthMonth')}>
            <SelectValue placeholder={t('birthMonth')} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {months.map((mo) => (
              <SelectItem key={mo.value} value={mo.value}>
                {mo.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={day || undefined} onValueChange={setDay}>
          <SelectTrigger data-testid="birth-date-day" aria-label={t('birthDay')}>
            <SelectValue placeholder={t('birthDay')} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {days.map((d) => (
              <SelectItem key={d} value={d}>
                {Number(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {iso ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setYear('');
            setMonth('');
            setDay('');
          }}
          aria-label={t('clearDate')}
        >
          <X className="mr-1 h-3 w-3" />
          {t('clearDate')}
        </Button>
      ) : null}
    </div>
  );
}
