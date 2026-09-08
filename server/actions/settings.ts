'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, queryOne, transaction } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { uid, nowIso, normalizeDecimalInput } from '@/lib/utils';
import { randomDentistColor } from '@/lib/colors';
import { SYSTEM_USER_ID } from '@/lib/system-user';

const ClinicSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  tax_id: z.string().optional().nullable(),
  tax_rate_standard_bps: z.preprocess(normalizeDecimalInput, z.coerce.number().int().min(0).max(10000)),
  tax_rate_reduced_bps: z.preprocess(normalizeDecimalInput, z.coerce.number().int().min(0).max(10000)),
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
      `INSERT INTO users (id, email, password_hash, name, role, locale, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        d.email.toLowerCase(),
        hash,
        d.name,
        d.role,
        d.locale,
        d.role === 'dentist' ? randomDentistColor() : null,
        nowIso(),
      ],
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

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Admin-editable calendar color for a user (dentists in practice). */
export async function updateUserColor(id: string, color: string) {
  const me = await requireRole(['admin']);
  if (!ColorSchema.safeParse(color).success) return { error: 'invalid' as const };
  await query('UPDATE users SET color = ? WHERE id = ?', [color, id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'user', ?, ?)`,
    [uid(), me.id, id, JSON.stringify({ color })],
  );
  revalidatePath('/settings');
  revalidatePath('/appointments');
  return { ok: true };
}

/** Soft-delete a user (ex-staff keep history, vanish from lists/login). */
export async function softDeleteUser(id: string) {
  const me = await requireRole(['admin']);
  if (id === SYSTEM_USER_ID || id === me.id) return { error: 'invalid' as const };
  await query('UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [
    nowIso(),
    id,
  ]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'soft_delete', 'user', ?)`,
    [uid(), me.id, id],
  );
  revalidatePath('/settings');
  return { ok: true as const };
}

/** Restore a soft-deleted user. */
export async function restoreUser(id: string) {
  const me = await requireRole(['admin']);
  await query('UPDATE users SET deleted_at = NULL WHERE id = ?', [id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'restore', 'user', ?)`,
    [uid(), me.id, id],
  );
  revalidatePath('/settings');
  return { ok: true as const };
}

type TargetUser = { id: string; email: string; role: string };

/**
 * Hard-delete a user. Attribution columns are reassigned to the system user
 * (never NULLed away silently); dentist-owned rows (appointments, turn links,
 * schedules, exceptions) must move to a successor dentist first — the system
 * user is role='admin' and must never own clinical rows.
 */
export async function hardDeleteUser(id: string, successorDentistId?: string) {
  const me = await requireRole(['admin']);
  if (id === SYSTEM_USER_ID || id === me.id) return { error: 'invalid' as const };
  const target = await queryOne<TargetUser>(
    'SELECT id, email, role FROM users WHERE id = ?',
    [id],
  );
  if (!target) return { error: 'not_found' as const };

  const owned = await queryOne<{ n: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM appointments WHERE dentist_id = ?) +
       (SELECT COUNT(*) FROM turn_picker_links WHERE dentist_id = ?) +
       (SELECT COUNT(*) FROM dentist_schedules WHERE dentist_id = ?) +
       (SELECT COUNT(*) FROM dentist_exceptions WHERE dentist_id = ?)
     ) AS n`,
    [id, id, id, id],
  );
  const ownedCount = owned?.n ?? 0;

  let successor: TargetUser | null = null;
  if (ownedCount > 0) {
    if (!successorDentistId || successorDentistId === id) {
      return { error: 'needs_successor' as const };
    }
    successor = await queryOne<TargetUser>(
      `SELECT id, email, role FROM users
        WHERE id = ? AND role = 'dentist' AND deleted_at IS NULL AND id != 'system'`,
      [successorDentistId],
    );
    if (!successor) return { error: 'bad_successor' as const };
  }

  const note = `original user deleted: ${target.email}`;
  await transaction(async (tx) => {
    if (successor) {
      await tx.execute('UPDATE appointments SET dentist_id = ? WHERE dentist_id = ?', [
        successor.id,
        id,
      ]);
      await tx.execute(
        'UPDATE turn_picker_links SET dentist_id = ? WHERE dentist_id = ?',
        [successor.id, id],
      );
      await tx.execute(
        'UPDATE dentist_schedules SET dentist_id = ? WHERE dentist_id = ?',
        [successor.id, id],
      );
      await tx.execute(
        'UPDATE dentist_exceptions SET dentist_id = ? WHERE dentist_id = ?',
        [successor.id, id],
      );
    }
    // Attribution → system user (RESTRICT FKs require this before the delete).
    await tx.execute('UPDATE appointments SET created_by = ? WHERE created_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute('UPDATE appointments SET cancelled_by = ? WHERE cancelled_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute('UPDATE appointments SET no_show_by = ? WHERE no_show_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute(
      'UPDATE turn_picker_links SET created_by = ? WHERE created_by = ?',
      [SYSTEM_USER_ID, id],
    );
    await tx.execute('UPDATE treatments SET performed_by = ? WHERE performed_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute('UPDATE attachments SET uploaded_by = ? WHERE uploaded_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute('UPDATE audit_log SET user_id = ? WHERE user_id = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute('UPDATE medical_tags SET created_by = ? WHERE created_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute('UPDATE patients SET created_by = ? WHERE created_by = ?', [
      SYSTEM_USER_ID,
      id,
    ]);
    await tx.execute(
      `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'hard_delete', 'user', ?, ?)`,
      [uid(), me.id, id, JSON.stringify({ note, successor: successor?.id ?? null })],
    );
    await tx.execute('DELETE FROM users WHERE id = ?', [id]);
  });
  revalidatePath('/settings');
  revalidatePath('/appointments');
  return { ok: true as const };
}
