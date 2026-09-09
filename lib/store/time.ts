'use client';

/**
 * Pure client-side clinic wall-clock. Mirrors lib/availability.ts wallClockInTz
 * without importing the server-only db client. Formatters are cached per
 * timezone so per-row formatting stays cheap.
 */

export type WallClock = {
  date: string; // YYYY-MM-DD clinic-local
  hhmm: string; // HH:MM clinic-local (24h)
  dayOfWeek: number; // 0-6, Sun=0
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function wallClock(iso: string, tz: string): WallClock {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { date: '', hhmm: '', dayOfWeek: 0 };
  try {
    const parts = formatter(tz).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    // en-CA yields YYYY-MM-DD order; read parts explicitly to be safe.
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const hhmm = `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
    return { date, hhmm, dayOfWeek: DOW[get('weekday')] ?? 0 };
  } catch {
    const p = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      hhmm: `${p(d.getHours())}:${p(d.getMinutes())}`,
      dayOfWeek: d.getDay(),
    };
  }
}

/** Monday-start key for a clinic-local YYYY-MM-DD date. */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime())) return dateStr;
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
