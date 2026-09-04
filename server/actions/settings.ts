'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';

const ClinicSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  tax_id: z.string().optional().nullable(),
  tax_rate_standard_bps: z.coerce.number().int().min(0).max(10000),
  tax_rate_reduced_bps: z.coerce.number().int().min(0).max(10000),
  currency: z.enum([
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
  ]),
  locale: z.enum(['es', 'en']),
  timezone: z.string().min(1).max(64).default('UTC'),
});

export async function upsertClinic(fd: FormData) {
  const me = await requireRole(['admin']);
  const parsed = ClinicSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' };
  const d = parsed.data;
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM clinics LIMIT 1',
  );
  if (existing) {
    await query(
      `UPDATE clinics SET name=?, address=?, tax_id=?, tax_rate_standard_bps=?, tax_rate_reduced_bps=?, currency=?, locale=?, timezone=?, updated_at=? WHERE id=?`,
      [
        d.name,
        d.address || null,
        d.tax_id || null,
        d.tax_rate_standard_bps,
        d.tax_rate_reduced_bps,
        d.currency,
        d.locale,
        d.timezone,
        nowIso(),
        existing.id,
      ],
    );
    await query(
      `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'update', 'clinic', ?)`,
      [uid(), me.id, existing.id],
    );
  } else {
    const id = uid();
    await query(
      `INSERT INTO clinics (id, name, address, tax_id, tax_rate_standard_bps, tax_rate_reduced_bps, currency, locale, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        d.name,
        d.address || null,
        d.tax_id || null,
        d.tax_rate_standard_bps,
        d.tax_rate_reduced_bps,
        d.currency,
        d.locale,
        d.timezone,
        nowIso(),
        nowIso(),
      ],
    );
    await query(
      `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'clinic', ?)`,
      [uid(), me.id, id],
    );
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

const UserSchema = z.object({
  email: z.string().min(3),
  name: z.string().min(1),
  role: z.enum(['admin', 'dentist', 'receptionist']),
  password: z.string().min(6),
  locale: z.enum(['es', 'en']).default('es'),
});

export async function createUser(fd: FormData) {
  const me = await requireRole(['admin']);
  const parsed = UserSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' };
  const d = parsed.data;
  const hash = await bcrypt.hash(d.password, 10);
  const newId = uid();
  try {
    await query(
      `INSERT INTO users (id, email, password_hash, name, role, locale, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, d.email.toLowerCase(), hash, d.name, d.role, d.locale, nowIso()],
    );
  } catch (e: any) {
    if (String(e?.message ?? '').includes('UNIQUE')) {
      return { error: 'Email already exists' };
    }
    throw e;
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'user', ?)`,
    [uid(), me.id, newId],
  );
  revalidatePath('/settings');
  return { ok: true };
}
