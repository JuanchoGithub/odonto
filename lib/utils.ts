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
