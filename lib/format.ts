import type { Currency, AppLocale } from './schemas/common';

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
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(
    locale === 'es' ? 'es-AR' : 'en-US',
    options,
  ).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: AppLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(
    locale === 'es' ? 'es-AR' : 'en-US',
    { dateStyle: 'short', timeStyle: 'short' },
  ).format(d);
}
