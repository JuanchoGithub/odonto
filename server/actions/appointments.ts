'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import { isWithinWorkingHours, getWeekWindows, type DayWindows } from '@/lib/availability';
import { effectiveExpiryMs } from '@/lib/turn-picker';

const ApptStatusSchema = z.enum(['scheduled', 'arrived', 'in_chair', 'completed', 'cancelled', 'no_show']);

const ApptObject = z.object({
  patient_id: z.string().min(1),
  dentist_id: z.string().min(1),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: ApptStatusSchema.default('scheduled'),
  created_via: z.enum(['manual', 'click', 'drag']).default('manual'),
});

function validRange(d: { starts_at: string; ends_at: string }): boolean {
  const s = new Date(d.starts_at).getTime();
  const e = new Date(d.ends_at).getTime();
  return Number.isFinite(s) && Number.isFinite(e) && e > s;
}

const ApptSchema = ApptObject.refine(validRange, {
  message: 'ends_at must be after starts_at',
});

function forbidden() {
  return { error: 'forbidden' as const };
}

export async function createAppointment(fd: FormData) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return forbidden();
  const parsed = ApptSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'invalid' as const };
  const data = parsed.data;

  // verify the patient actually exists (defensive; FK would catch it but with a confusing error)
  const patient = await queryOne<{ id: string }>(
    'SELECT id FROM patients WHERE id = ? LIMIT 1',
    [data.patient_id],
  );
  if (!patient) return { error: 'patient_not_found' as const };

  // Overlapping appointments are allowed (same or different dentists) —
  // the calendar renders them side by side.

  // outside working hours (schedule / exceptions / business-hours fallback)
  const withinHours = await isWithinWorkingHours(
    data.dentist_id,
    data.starts_at,
    data.ends_at,
  );
  if (!withinHours) return { error: 'conflict' as const };

  const id = uid();
  try {
    await query(
      `INSERT INTO appointments (id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes, created_by, created_via, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.patient_id,
        data.dentist_id,
        data.starts_at,
        data.ends_at,
        data.status,
        data.reason || null,
        data.notes || null,
        user.id,
        data.created_via,
        nowIso(),
      ],
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('FOREIGN KEY')) {
      return { error: 'patient_not_found' as const };
    }
    throw e;
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'appointment', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath('/appointments');
  return { ok: true, id };
}

const UpdateApptSchema = ApptObject.omit({ patient_id: true })
  .extend({
    id: z.string().min(1),
  })
  .refine(validRange, { message: 'ends_at must be after starts_at' });

export type UpdateApptResult =
  | { ok: true; id: string }
  | { error: 'invalid' | 'conflict' | 'not_found' | 'forbidden' };

export async function updateAppointment(
  fd: FormData,
): Promise<UpdateApptResult> {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  const parsed = UpdateApptSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'invalid' as const };
  const data = parsed.data;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM appointments WHERE id = ?',
    [data.id],
  );
  if (!existing) return { error: 'not_found' as const };

  // Overlapping appointments are allowed (same or different dentists).

  const withinHours = await isWithinWorkingHours(
    data.dentist_id,
    data.starts_at,
    data.ends_at,
  );
  if (!withinHours) return { error: 'conflict' as const };

  await query(
    `UPDATE appointments SET dentist_id=?, starts_at=?, ends_at=?, status=?, reason=?, notes=? WHERE id=?`,
    [
      data.dentist_id,
      data.starts_at,
      data.ends_at,
      data.status,
      data.reason || null,
      data.notes || null,
      data.id,
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'appointment', ?, ?)`,
    [uid(), user.id, data.id, JSON.stringify({ status: data.status })],
  );
  revalidatePath('/appointments');
  return { ok: true, id: data.id };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  const parsed = ApptStatusSchema.safeParse(status);
  if (!parsed.success) return { error: 'invalid' as const };
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM appointments WHERE id = ?',
    [id],
  );
  if (!existing) return { error: 'not_found' as const };
  await query('UPDATE appointments SET status = ? WHERE id = ?', [parsed.data, id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'appointment', ?, ?)`,
    [uid(), user.id, id, JSON.stringify({ status: parsed.data })],
  );
  revalidatePath('/appointments');
  return { ok: true as const };
}

export async function deleteAppointment(id: string) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  // Soft-cancel instead of hard-delete: preserves history + audit trail.
  await query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'cancel', 'appointment', ?, ?)`,
    [uid(), user.id, id, JSON.stringify({ via: 'deleteAppointment' })],
  );
  revalidatePath('/appointments');
  return { ok: true as const };
}

export type ApptRow = {
  id: string;
  patient_id: string;
  dentist_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  reason: string | null;
  notes: string | null;
  patient_name: string;
  dentist_name: string;
  dentist_color: string | null;
  created_by: string | null;
  created_via: string | null;
  creator_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
};

export async function listAppointmentsForWeek(startIso: string) {
  const end = new Date(new Date(startIso).getTime() + 7 * 86400_000).toISOString();
  return query<ApptRow>(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name,
            p.phone as patient_phone, p.email as patient_email,
            u.name as dentist_name, u.color as dentist_color,
            cu.name as creator_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = a.dentist_id
     LEFT JOIN users cu ON cu.id = a.created_by
     WHERE datetime(a.starts_at) >= datetime(?) AND datetime(a.starts_at) < datetime(?)
     ORDER BY a.starts_at`,
    [startIso, end],
  );
}

/** Working windows per day for calendar shading (null dentistId = clinic-wide "all" view). */
export async function getWeekWindowsAction(
  dentistId: string | null,
  weekStartIso: string,
): Promise<DayWindows[]> {
  await requireUser();
  return getWeekWindows(dentistId, weekStartIso);
}

/** Shared turn-picker links that are still waiting for the patient to book. */
export type PendingLinkRow = {
  id: string;
  token: string;
  slot_minutes: number;
  created_at: string;
  expires_at: string;
  dentist_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  dentist_name: string;
  dentist_color: string | null;
  creator_name: string | null;
};

export async function listPendingTurnLinks(): Promise<PendingLinkRow[]> {
  await requireUser();
  const rows = await query<PendingLinkRow>(
    `SELECT l.id, l.token, l.slot_minutes, l.created_at, l.expires_at, l.dentist_id,
            p.first_name || ' ' || p.last_name as patient_name,
            p.phone as patient_phone, p.email as patient_email,
            u.name as dentist_name, u.color as dentist_color,
            cu.name as creator_name
     FROM turn_picker_links l
     JOIN patients p ON p.id = l.patient_id
     JOIN users u ON u.id = l.dentist_id
     LEFT JOIN users cu ON cu.id = l.created_by
     WHERE l.used_at IS NULL
     ORDER BY l.created_at DESC`,
  );
  // Exclude expired links server-side (effective expiry = min(expires_at, created+idle)).
  const now = Date.now();
  return rows.filter((r) => effectiveExpiryMs(r) > now);
}
