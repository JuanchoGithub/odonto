import type { Currency, AppLocale } from './schemas/common';

/**
 * Clinic wall-clock rule (AGENTS.md §12.9): instants (`starts_at`, `issued_at`,
 * …) are stored as UTC ISO and must be rendered in `clinics.timezone`, never
 * in server-UTC or browser-local time. Pass the clinic IANA timezone as the
 * last arg whenever the caller has it; without it the output falls back to
 * the runtime TZ (previous behavior, kept for back-compat).
 *
 * Date-only strings (`YYYY-MM-DD`: birth dates, clinic-local dates) carry no
 * instant, so they are pinned to UTC noon + `timeZone: 'UTC'` — otherwise
 * `new Date('…')` (UTC midnight) renders as the previous day west of UTC.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(date: Date | string): Date {
  if (typeof date !== 'string') return date;
  return DATE_ONLY.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date);
}

function withTz(
  options: Intl.DateTimeFormatOptions,
  date: Date | string,
  timeZone?: string,
): Intl.DateTimeFormatOptions {
  if (typeof date === 'string' && DATE_ONLY.test(date)) {
    return { ...options, timeZone: 'UTC' };
  }
  return timeZone ? { ...options, timeZone } : options;
}

export function formatMoney(
  cents: number,
  currency: Currency,
  locale: AppLocale,
): string {
  const value = cents / 100;
  return new Intl.NumberFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

export function formatDate(
  date: Date | string,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  timeZone?: string,
): string {
  const d = toDate(date);
  return new Intl.DateTimeFormat(
    locale === 'es' ? 'es-AR' : 'en-US',
    withTz(options, date, timeZone),
  ).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: AppLocale,
  timeZone?: string,
): string {
  const d = toDate(date);
  return new Intl.DateTimeFormat(
    locale === 'es' ? 'es-AR' : 'en-US',
    withTz({ dateStyle: 'short', timeStyle: 'short' }, date, timeZone),
  ).format(d);
}

/** Time-only `HH:MM` formatter with an explicit timezone (no runtime-TZ leak). */
export function formatTime(
  date: Date | string,
  locale: AppLocale,
  timeZone?: string,
): string {
  const d = toDate(date);
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : null),
  }).format(d);
}
