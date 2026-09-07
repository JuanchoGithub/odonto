import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function centsToAmount(cents: number) {
  return cents / 100;
}

export function amountToCents(amount: number) {
  return Math.round(amount * 100);
}

/**
 * Normalize a locale-typed decimal string so both `12.50` (en) and `12,50`
 * (es-AR) parse identically. Accepts dots and commas as the decimal
 * separator regardless of the phone's locale; only the LAST separator is
 * treated as decimal and any thousand separators / spaces are stripped.
 * Non-strings pass through untouched (for zod preprocess use).
 */
export function normalizeDecimalInput(v: unknown) {
  if (typeof v !== 'string') return v;
  const t = v.trim().replace(/[\s']/g, '');
  if (t === '') return v;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);
  if (lastSep === -1) return t;
  const int = t.slice(0, lastSep).replace(/[.,]/g, '');
  const frac = t.slice(lastSep + 1).replace(/[.,]/g, '');
  return frac ? `${int}.${frac}` : int;
}
