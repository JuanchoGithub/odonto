import { z } from 'zod';

export const CurrencyEnum = z.enum([
  'ARS',
  'USD',
  'EUR',
  'MXN',
  'COP',
  'CLP',
  'PEN',
  'UYU',
  'BRL',
  'GBP',
]);
export type Currency = z.infer<typeof CurrencyEnum>;

export const LocaleEnum = z.enum(['es', 'en']);
export type AppLocale = z.infer<typeof LocaleEnum>;

export const RoleEnum = z.enum(['admin', 'dentist', 'receptionist']);
export type Role = z.infer<typeof RoleEnum>;
