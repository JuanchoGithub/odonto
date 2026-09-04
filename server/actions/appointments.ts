'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import { isWithinWorkingHours } from '@/lib/availability';

const ApptSchema = z.object({
  patient_id: z.string().min(1),
  dentist_id: z.string().min(1),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z
    .enum(['scheduled', 'arrived', 'in_chair', 'completed', 'cancelled', 'no_show'])
    .default('scheduled'),
});

export async function createAppointment(fd: FormData) {
  const user = await requireUser();
  const parsed = ApptSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'invalid' as const };
  const data = parsed.data;

  // verify the patient actually exists (defensive; FK would catch it but with a confusing error)
  const patient = await queryOne<{ id: string }>(
    'SELECT id FROM patients WHERE id = ? LIMIT 1',
    [data.patient_id],
  );
  if (!patient) return { error: 'patient_not_found' as const };

  // conflict check — only blocks if the overlapping appointment is still active
  const conflict = await queryOne(
    `SELECT id FROM appointments
     WHERE dentist_id = ? AND status NOT IN ('cancelled','completed','no_show')
       AND NOT (datetime(ends_at) <= datetime(?) OR datetime(starts_at) >= datetime(?))
     LIMIT 1`,
    [data.dentist_id, data.starts_at, data.ends_at],
  );
  if (conflict) return { error: 'conflict' as const };

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
      `INSERT INTO appointments (id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.patient_id,
        data.dentist_id,
        data.starts_at,
        data.ends_at,
        data.status,
        data.reason || null,
        data.notes || null,
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

const UpdateApptSchema = ApptSchema.omit({ patient_id: true }).extend({
  id: z.string().min(1),
});

export type UpdateApptResult =
  | { ok: true; id: string }
  | { error: 'invalid' | 'conflict' | 'not_found' };

export async function updateAppointment(
  fd: FormData,
): Promise<UpdateApptResult> {
  const user = await requireUser();
  const parsed = UpdateApptSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'invalid' as const };
  const data = parsed.data;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM appointments WHERE id = ?',
    [data.id],
  );
  if (!existing) return { error: 'not_found' as const };

  // conflict check — ignore this appointment itself
  const conflict = await queryOne(
    `SELECT id FROM appointments
     WHERE dentist_id = ? AND id != ?
       AND status NOT IN ('cancelled','completed','no_show')
       AND NOT (datetime(ends_at) <= datetime(?) OR datetime(starts_at) >= datetime(?))
     LIMIT 1`,
    [data.dentist_id, data.id, data.starts_at, data.ends_at],
  );
  if (conflict) return { error: 'conflict' as const };

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
  await query('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'appointment', ?, ?)`,
    [uid(), user.id, id, JSON.stringify({ status })],
  );
  revalidatePath('/appointments');
}

export async function deleteAppointment(id: string) {
  await requireUser();
  await query('DELETE FROM appointments WHERE id = ?', [id]);
  revalidatePath('/appointments');
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
};

export async function listAppointmentsForWeek(startIso: string) {
  const end = new Date(new Date(startIso).getTime() + 7 * 86400_000).toISOString();
  return query<ApptRow>(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name,
            u.name as dentist_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = a.dentist_id
     WHERE datetime(a.starts_at) >= datetime(?) AND datetime(a.starts_at) < datetime(?)
     ORDER BY a.starts_at`,
    [startIso, end],
  );
}
