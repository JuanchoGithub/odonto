'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import { isWithinWorkingHours } from '@/lib/availability';

const WindowSchema = z.object({
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

export type DentistScheduleRow = {
  id: string;
  dentist_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from: string | null;
  effective_to: string | null;
};

export type ClinicBusinessHoursRow = {
  id: string;
  clinic_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type ClinicExceptionRow = {
  id: string;
  kind: 'holiday' | 'closed';
  date: string;
  label: string | null;
};

export type DentistExceptionRow = {
  id: string;
  dentist_id: string;
  date: string;
  kind: 'time_off' | 'custom_hours';
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

export async function getSchedulePageData(dentistId?: string) {
  const user = await requireUser();
  // Admins see everyone; dentists see only themselves.
  const targetId =
    user.role === 'admin' && dentistId ? dentistId : user.id;
  const [weekly, exceptions, businessHours, clinicExceptions, dentists] =
    await Promise.all([
      query<DentistScheduleRow>(
        `SELECT * FROM dentist_schedules WHERE dentist_id = ? ORDER BY day_of_week, start_time`,
        [targetId],
      ),
      query<DentistExceptionRow>(
        `SELECT * FROM dentist_exceptions WHERE dentist_id = ? ORDER BY date DESC LIMIT 100`,
        [targetId],
      ),
      user.role === 'admin'
        ? query<ClinicBusinessHoursRow>(
            `SELECT * FROM clinic_business_hours ORDER BY day_of_week`,
          )
        : Promise.resolve([] as ClinicBusinessHoursRow[]),
      user.role === 'admin'
        ? query<ClinicExceptionRow>(
            `SELECT * FROM clinic_exceptions ORDER BY date DESC LIMIT 100`,
          )
        : Promise.resolve([] as ClinicExceptionRow[]),
      user.role === 'admin'
        ? query<{ id: string; name: string }>(
            `SELECT id, name FROM users WHERE role = 'dentist' ORDER BY name`,
          )
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
  return { weekly, exceptions, businessHours, clinicExceptions, dentists, targetId };
}

/**
 * Compute which future appointments for `dentistId` would fall OUTSIDE the
 * proposed weekly windows. Used by the "warn & decide" dialog before save.
 */
export async function findOrphanedAppointments(
  dentistId: string,
  proposedWindows: { day_of_week: number; start_min: number; end_min: number }[],
): Promise<
  {
    id: string;
    starts_at: string;
    ends_at: string;
    patient_name: string;
  }[]
> {
  await requireUser();
  const now = nowIso();
  const appts = await query<{
    id: string;
    starts_at: string;
    ends_at: string;
    patient_name: string;
  }>(
    `SELECT a.id, a.starts_at, a.ends_at,
            p.first_name || ' ' || p.last_name AS patient_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.dentist_id = ?
       AND a.status NOT IN ('cancelled','completed','no_show')
       AND datetime(a.starts_at) >= datetime(?)
     ORDER BY a.starts_at
     LIMIT 200`,
    [dentistId, now],
  );

  // For each appt, re-evaluate with the proposed windows substituted for the
  // dentist's current weekly schedule.
  const orphaned: typeof appts = [];
  // Fallback: if the dentist would end up with NO schedule at all, they
  // inherit clinic business hours — so check business hours instead.
  const fallbackWindows =
    proposedWindows.length === 0
      ? (
          await query<{ day_of_week: number; start_time: string; end_time: string }>(
            `SELECT day_of_week, start_time, end_time FROM clinic_business_hours`,
          )
        ).map((b) => ({
          day_of_week: b.day_of_week,
          start_min: (() => {
            const [h, m] = b.start_time.split(':').map(Number);
            return h * 60 + (m || 0);
          })(),
          end_min: (() => {
            const [h, m] = b.end_time.split(':').map(Number);
            return h * 60 + (m || 0);
          })(),
        }))
      : proposedWindows;

  for (const a of appts) {
    const start = new Date(a.starts_at);
    const end = new Date(a.ends_at);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;

    // Simulate: check exceptions first (unchanged), then the proposed windows.
    const ex = await queryOne<{ kind: string; start_time: string | null; end_time: string | null }>(
      `SELECT kind, start_time, end_time FROM dentist_exceptions
       WHERE dentist_id = ? AND date = ?`,
      [dentistId, date],
    );
    let windows: { start_min: number; end_min: number }[] = [];
    if (ex) {
      if (ex.kind === 'time_off') {
        windows = [];
      } else if (ex.kind === 'custom_hours' && ex.start_time && ex.end_time) {
        const [sh, sm] = ex.start_time.split(':').map(Number);
        const [eh, em] = ex.end_time.split(':').map(Number);
        windows = [{ start_min: sh * 60 + sm, end_min: eh * 60 + em }];
      }
    } else {
      windows = fallbackWindows.filter((w) => w.day_of_week === start.getDay());
    }

    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const sameDay = end.getDate() === start.getDate();
    const covered =
      sameDay &&
      windows.some((w) => startMin >= w.start_min && endMin <= w.end_min);
    if (!covered) orphaned.push(a);
  }
  return orphaned;
}

const WeeklySchema = z.object({
  dentist_id: z.string().min(1),
  windows: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: z.string().regex(/^\d{2}:\d{2}$/),
        end_time: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(21), // 3 per day max
  // For each orphaned appointment id: 'reschedule' | 'cancel' | 'exception'
  decisions: z.record(
    z.string(),
    z.object({
      action: z.enum(['reschedule', 'cancel', 'exception']),
      new_starts_at: z.string().optional(), // required if reschedule
      new_ends_at: z.string().optional(),
    }),
  ),
});

export async function saveWeeklySchedule(
  payload: unknown,
): Promise<{ ok: boolean; error?: string; orphanedCount?: number }> {
  const user = await requireUser();
  const parsed = WeeklySchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;

  if (user.role !== 'admin' && user.id !== d.dentist_id) {
    return { ok: false, error: 'forbidden' };
  }

  // Re-check orphans to make sure every one got a decision.
  const orphans = await findOrphanedAppointments(
    d.dentist_id,
    d.windows.map((w) => ({
      day_of_week: w.day_of_week,
      start_min:
        parseInt(w.start_time.split(':')[0]) * 60 +
        parseInt(w.start_time.split(':')[1]),
      end_min:
        parseInt(w.end_time.split(':')[0]) * 60 +
        parseInt(w.end_time.split(':')[1]),
    })),
  );
  const undecided = orphans.filter((o) => !d.decisions[o.id]);
  if (undecided.length > 0) {
    return { ok: false, error: 'needs_decisions', orphanedCount: undecided.length };
  }

  // Apply decisions first (reschedule / cancel / exception) so the new schedule
  // doesn't immediately orphan anything.
  for (const o of orphans) {
    const dec = d.decisions[o.id]!;
    if (dec.action === 'cancel') {
      await query(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [
        o.id,
      ]);
    } else if (dec.action === 'exception') {
      // Keep it: create a custom_hours exception matching the appointment window.
      const start = new Date(o.starts_at);
      const end = new Date(o.ends_at);
      const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
      await query(
        `INSERT INTO dentist_exceptions
           (id, dentist_id, date, kind, start_time, end_time, reason, created_at)
         VALUES (?, ?, ?, 'custom_hours', ?, ?, 'kept-after-schedule-change', ?)`,
        [uid(), d.dentist_id, date, startTime, endTime, nowIso()],
      );
    } else if (dec.action === 'reschedule' && dec.new_starts_at && dec.new_ends_at) {
      await query(
        `UPDATE appointments SET starts_at = ?, ends_at = ? WHERE id = ?`,
        [dec.new_starts_at, dec.new_ends_at, o.id],
      );
    }
  }

  // Replace weekly schedule.
  await query(`DELETE FROM dentist_schedules WHERE dentist_id = ?`, [
    d.dentist_id,
  ]);
  for (const w of d.windows) {
    await query(
      `INSERT INTO dentist_schedules (id, dentist_id, day_of_week, start_time, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uid(), d.dentist_id, w.day_of_week, w.start_time, w.end_time, nowIso()],
    );
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta)
     VALUES (?, ?, 'update', 'dentist_schedules', ?, ?)`,
    [uid(), user.id, d.dentist_id, JSON.stringify({ windows: d.windows.length, decisions: Object.keys(d.decisions).length })],
  );
  revalidatePath('/settings/schedules');
  return { ok: true };
}

// ---------- Clinic business hours (admin only) ----------

const BusinessHoursSchema = z.object({
  windows: z.array(
    z.object({
      day_of_week: z.number().int().min(0).max(6),
      start_time: z.string().regex(/^\d{2}:\d{2}$/),
      end_time: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ),
});

export async function saveClinicBusinessHours(
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin']);
  const parsed = BusinessHoursSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const clinic = await queryOne<{ id: string }>('SELECT id FROM clinics LIMIT 1');
  if (!clinic) return { ok: false, error: 'no_clinic' };
  await query(`DELETE FROM clinic_business_hours WHERE clinic_id = ?`, [
    clinic.id,
  ]);
  for (const w of parsed.data.windows) {
    await query(
      `INSERT INTO clinic_business_hours (id, clinic_id, day_of_week, start_time, end_time)
       VALUES (?, ?, ?, ?, ?)`,
      [uid(), clinic.id, w.day_of_week, w.start_time, w.end_time],
    );
  }
  revalidatePath('/settings/schedules');
  return { ok: true };
}

// ---------- Clinic exceptions (admin only) ----------

const ClinicExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['holiday', 'closed']),
  label: z.string().optional().nullable(),
});

export async function addClinicException(
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['admin']);
  const parsed = ClinicExceptionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  await query(
    `INSERT INTO clinic_exceptions (id, kind, date, label, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [uid(), parsed.data.kind, parsed.data.date, parsed.data.label ?? null, nowIso()],
  );
  revalidatePath('/settings/schedules');
  return { ok: true };
}

export async function deleteClinicException(id: string) {
  await requireRole(['admin']);
  await query(`DELETE FROM clinic_exceptions WHERE id = ?`, [id]);
  revalidatePath('/settings/schedules');
}

// ---------- Dentist exceptions ----------

const DentistExceptionSchema = z.object({
  dentist_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['time_off', 'custom_hours']),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  reason: z.string().optional().nullable(),
});

export async function addDentistException(
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = DentistExceptionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;
  if (user.role !== 'admin' && user.id !== d.dentist_id) {
    return { ok: false, error: 'forbidden' };
  }
  if (d.kind === 'custom_hours' && (!d.start_time || !d.end_time)) {
    return { ok: false, error: 'invalid' };
  }
  await query(
    `INSERT INTO dentist_exceptions
       (id, dentist_id, date, kind, start_time, end_time, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid(),
      d.dentist_id,
      d.date,
      d.kind,
      d.start_time ?? null,
      d.end_time ?? null,
      d.reason ?? null,
      nowIso(),
    ],
  );
  revalidatePath('/settings/schedules');
  return { ok: true };
}

export async function deleteDentistException(id: string) {
  const user = await requireUser();
  const row = await queryOne<{ dentist_id: string }>(
    'SELECT dentist_id FROM dentist_exceptions WHERE id = ?',
    [id],
  );
  if (!row) return;
  if (user.role !== 'admin' && user.id !== row.dentist_id) {
    throw new Error('forbidden');
  }
  await query(`DELETE FROM dentist_exceptions WHERE id = ?`, [id]);
  revalidatePath('/settings/schedules');
}

export async function deleteScheduleWindow(id: string) {
  const user = await requireUser();
  const row = await queryOne<{ dentist_id: string }>(
    'SELECT dentist_id FROM dentist_schedules WHERE id = ?',
    [id],
  );
  if (!row) return;
  if (user.role !== 'admin' && user.id !== row.dentist_id) {
    throw new Error('forbidden');
  }
  await query(`DELETE FROM dentist_schedules WHERE id = ?`, [id]);
  revalidatePath('/settings/schedules');
}
