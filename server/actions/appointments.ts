'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import { SYSTEM_USER_ID } from '@/lib/system-user';
import { isWithinWorkingHours, getWeekWindows, getClinicTimezone, wallClockInTz, type DayWindows } from '@/lib/availability';
import { effectiveExpiryMs } from '@/lib/turn-picker';

const ApptStatusSchema = z.enum(['scheduled', 'arrived', 'in_chair', 'completed', 'cancelled', 'no_show']);

// Not exported: 'use server' files may only export async functions.
const CancelReasonSchema = z.enum([
  'patient_request',
  'dentist_request',
  'no_answer',
  'duplicate',
  'schedule_change',
  'other',
]);
export type CancelReason =
  | 'patient_request'
  | 'dentist_request'
  | 'no_answer'
  | 'duplicate'
  | 'schedule_change'
  | 'other';

const TERMINAL_STATUSES = ['completed', 'cancelled', 'no_show'] as const;
const ACTIVE_STATUSES = ['scheduled', 'arrived', 'in_chair'] as const;

function isTerminal(s: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}
function isActive(s: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(s);
}

const ApptObject = z.object({
  patient_id: z.string().min(1),
  dentist_id: z.string().min(1),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: ApptStatusSchema.default('scheduled'),
  created_via: z.enum(['manual', 'click', 'drag']).default('manual'),
  // Explicit opt-in to save outside the dentist's working hours. Only a real
  // caller-sent 'true' bypasses the gate — drags never set it.
  bypass_hours: z.enum(['true', 'false']).optional(),
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

/**
 * Best-effort refresh of the per-dentist subscribable ICS feeds (Blob).
 * Never throws; appointment writes must not fail because the feed did.
 */
async function refreshCalendars(ids: (string | null | undefined)[]) {
  try {
    const { refreshDentistCalendars } = await import('./calendar-feed');
    await refreshDentistCalendars(ids);
  } catch {
    // Best-effort; the appointment write already succeeded.
  }
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
  const bypass = data.bypass_hours === 'true';
  if (!bypass && !withinHours) return { error: 'conflict' as const };

  const id = uid();
  try {
    await query(
      `INSERT INTO appointments (id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes, created_by, created_via, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  await refreshCalendars([data.dentist_id]);
  revalidatePath('/appointments');
  return { ok: true, id };
}

const UpdateApptSchema = ApptObject.omit({ patient_id: true })
  .extend({
    id: z.string().min(1),
    cancel_reason: CancelReasonSchema.optional(),
    // Explicit opt-in to move a terminal appointment back to an active status.
    reopen: z.enum(['true', 'false']).optional(),
  })
  .refine(validRange, { message: 'ends_at must be after starts_at' });

export type UpdateApptResult =
  | { ok: true; id: string; reprogrammed: boolean }
  | { error: 'invalid' | 'conflict' | 'not_found' | 'forbidden' | 'terminal' };

type ExistingAppt = {
  id: string;
  patient_id: string;
  dentist_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  reprogram_count: number | null;
  original_starts_at: string | null;
};

export async function updateAppointment(
  fd: FormData,
): Promise<UpdateApptResult> {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  const parsed = UpdateApptSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'invalid' as const };
  const data = parsed.data;

  const existing = await queryOne<ExistingAppt>(
    'SELECT id, patient_id, dentist_id, starts_at, ends_at, status, reprogram_count, original_starts_at FROM appointments WHERE id = ?',
    [data.id],
  );
  if (!existing) return { error: 'not_found' as const };

  // Terminal guard: completed/cancelled/no_show can't silently go back to
  // an active status — the caller must pass reopen=true (confirmed in UI).
  if (isTerminal(existing.status) && isActive(data.status) && data.reopen !== 'true') {
    return { error: 'terminal' as const };
  }

  // Overlapping appointments are allowed (same or different dentists).

  const withinHours = await isWithinWorkingHours(
    data.dentist_id,
    data.starts_at,
    data.ends_at,
  );
  const bypass = data.bypass_hours === 'true';
  if (!bypass && !withinHours) return { error: 'conflict' as const };

  // Any date/time/dentist change tags the appointment as reprogrammed.
  const timeChanged =
    data.starts_at !== existing.starts_at ||
    data.ends_at !== existing.ends_at ||
    data.dentist_id !== existing.dentist_id;
  const reprogramCount = (existing.reprogram_count ?? 0) + (timeChanged ? 1 : 0);
  const originalStarts = timeChanged
    ? (existing.original_starts_at ?? existing.starts_at)
    : existing.original_starts_at;

  const now = nowIso();
  const cancelled = data.status === 'cancelled';
  const noShow = data.status === 'no_show';
  const completed = data.status === 'completed';

  await query(
    `UPDATE appointments SET dentist_id=?, starts_at=?, ends_at=?, status=?, reason=?, notes=?,
      reprogram_count=?, original_starts_at=?,
      cancelled_at=?, cancelled_by=?, cancel_reason=?,
      no_show_at=?, no_show_by=?, completed_at=?, updated_at=? WHERE id=?`,
    [
      data.dentist_id,
      data.starts_at,
      data.ends_at,
      data.status,
      data.reason || null,
      data.notes || null,
      reprogramCount,
      originalStarts,
      cancelled ? now : null,
      cancelled ? user.id : null,
      cancelled ? (data.cancel_reason ?? null) : null,
      noShow ? now : null,
      noShow ? user.id : null,
      completed ? now : null,
      now,
      data.id,
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, ?, 'appointment', ?, ?)`,
    [
      uid(),
      user.id,
      timeChanged ? 'reschedule' : 'update',
      data.id,
      JSON.stringify({
        from: {
          starts_at: existing.starts_at,
          ends_at: existing.ends_at,
          dentist_id: existing.dentist_id,
        },
        to: {
          starts_at: data.starts_at,
          ends_at: data.ends_at,
          dentist_id: data.dentist_id,
        },
        status_from: existing.status,
        status_to: data.status,
        reprogram_count: reprogramCount,
        cancel_reason: cancelled ? (data.cancel_reason ?? null) : null,
        reopened: isTerminal(existing.status) && isActive(data.status),
      }),
    ],
  );
  if (completed) {
    try {
      const { ensureConsultaForAppointment } = await import('./billing');
      await ensureConsultaForAppointment(data.id, user.id);
    } catch {
      // Best-effort; update already succeeded.
    }
  }
  await refreshCalendars([data.dentist_id, existing.dentist_id]);
  revalidatePath('/appointments');
  return { ok: true, id: data.id, reprogrammed: timeChanged };
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  opts?: { reopen?: boolean; cancelReason?: string; noShowBy?: string },
) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  const parsed = ApptStatusSchema.safeParse(status);
  if (!parsed.success) return { error: 'invalid' as const };
  const existing = await queryOne<{ id: string; status: string; dentist_id: string }>(
    'SELECT id, status, dentist_id FROM appointments WHERE id = ?',
    [id],
  );
  if (!existing) return { error: 'not_found' as const };
  if (isTerminal(existing.status) && isActive(parsed.data) && !opts?.reopen) {
    return { error: 'terminal' as const };
  }
  let cancelReason: string | null = null;
  if (parsed.data === 'cancelled' && opts?.cancelReason) {
    cancelReason = CancelReasonSchema.safeParse(opts.cancelReason).success
      ? opts.cancelReason
      : null;
  }
  const now = nowIso();
  const next = parsed.data;
  await query(
    `UPDATE appointments SET status=?,
      cancelled_at=CASE WHEN ?='cancelled' THEN ? ELSE NULL END,
      cancelled_by=CASE WHEN ?='cancelled' THEN ? ELSE NULL END,
      cancel_reason=CASE WHEN ?='cancelled' THEN ? ELSE NULL END,
      no_show_at=CASE WHEN ?='no_show' THEN ? ELSE NULL END,
      no_show_by=CASE WHEN ?='no_show' THEN ? ELSE NULL END,
      completed_at=CASE WHEN ?='completed' THEN ? ELSE NULL END,
      updated_at=?
     WHERE id=?`,
    [
      next,
      next, now,
      next, next === 'cancelled' ? user.id : null,
      next, cancelReason,
      next, now,
      next, next === 'no_show' ? (opts?.noShowBy ?? user.id) : null,
      next, now,
      now,
      id,
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'appointment', ?, ?)`,
    [
      uid(),
      opts?.noShowBy === SYSTEM_USER_ID ? SYSTEM_USER_ID : user.id,
      id,
      JSON.stringify({
        status_from: existing.status,
        status_to: next,
        cancel_reason: cancelReason,
        reopened: isTerminal(existing.status) && isActive(next),
        via: opts?.noShowBy === SYSTEM_USER_ID ? 'auto' : 'manual',
      }),
    ],
  );
  // Completed visits carry a default consulta treatment (never duplicated).
  // Dynamic import avoids a billing↔appointments cycle.
  if (next === 'completed') {
    try {
      const { ensureConsultaForAppointment } = await import('./billing');
      await ensureConsultaForAppointment(id, user.id);
    } catch {
      // Best-effort; status flip already succeeded.
    }
  }
  await refreshCalendars([existing.dentist_id]);
  revalidatePath('/appointments');
  return { ok: true as const };
}

export async function deleteAppointment(id: string, cancelReason?: string) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  const reason = cancelReason && CancelReasonSchema.safeParse(cancelReason).success
    ? cancelReason
    : null;
  // Soft-cancel instead of hard-delete: preserves history + audit trail.
  const now = nowIso();
  const doomed = await queryOne<{ dentist_id: string }>(
    'SELECT dentist_id FROM appointments WHERE id = ?',
    [id],
  );
  await query(
    `UPDATE appointments SET status='cancelled', cancelled_at=?, cancelled_by=?, cancel_reason=?, updated_at=? WHERE id=?`,
    [now, user.id, reason, now, id],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'cancel', 'appointment', ?, ?)`,
    [uid(), user.id, id, JSON.stringify({ via: 'deleteAppointment', cancel_reason: reason })],
  );
  await refreshCalendars([doomed?.dentist_id]);
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
  reprogram_count: number | null;
  original_starts_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  no_show_at: string | null;
  no_show_by: string | null;
  completed_at: string | null;
  patient_name: string;
  dentist_name: string;
  dentist_color: string | null;
  created_by: string | null;
  created_via: string | null;
  creator_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  /** Clinic-local YYYY-MM-DD. Set by callers that run the rows through
   *  `withClinicClock`; absent on raw rows. Client-side fallbacks slice
   *  the ISO date when missing. */
  clinic_date?: string;
  /** Clinic-local HH:MM. Same caveat as `clinic_date`. */
  start_hhmm?: string;
  end_hhmm?: string;
};

export type AppointmentHistoryEntry = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  meta: string | null;
  at: string;
};

/** Audit trail for a single appointment (reschedule from/to, cancels, status flips). */
export async function listAppointmentHistory(appointmentId: string) {
  await requireUser();
  return query<AppointmentHistoryEntry>(
    `SELECT l.id, l.user_id, u.name as user_name, l.action, l.meta, l.at
     FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.entity = 'appointment' AND l.entity_id = ?
     ORDER BY l.at DESC`,
    [appointmentId],
  );
}

/**
 * Shared core for the automatic no-show sweep. No auth check here — callers
 * must gate (cron secret in the API route, requireUser in the server action).
 *
 * Rule: only `scheduled` appointments past `ends_at + grace` are flipped.
 * `arrived` / `in_chair` overdue means the patient DID come (explicit show),
 * so they go to the secretary "not completed" worklist instead, never auto
 * no-show. A `scheduled` appointment with clinical evidence in the visit
 * window (treatment, invoice/payment, attachment, odontogram write) is
 * treated as attended and auto-completed instead of no-showed.
 */
export async function sweepOverdueNoShows(
  graceMin = 60,
  markedBy: string = SYSTEM_USER_ID,
): Promise<{ checked: number; noShows: number; attended: number; ids: string[] }> {
  // markedBy defaults to the reserved system user (see lib/system-user.ts):
  // no_show_by / audit_log.user_id are FKs to users(id), so automated writes
  // attribute to 'system' instead of a magic string or NULL.
  const cutoff = new Date(Date.now() - graceMin * 60000).toISOString();
  const candidates = await query<{ id: string; patient_id: string; dentist_id: string; starts_at: string; ends_at: string }>(
    `SELECT id, patient_id, dentist_id, starts_at, ends_at FROM appointments
     WHERE status = 'scheduled' AND datetime(ends_at) <= datetime(?)
     ORDER BY ends_at LIMIT 200`,
    [cutoff],
  );
  let noShows = 0;
  let attended = 0;
  const ids: string[] = [];
  const touchedDentists = new Set<string>();
  for (const c of candidates) {
    const evidence = await findAttendanceEvidence(c.patient_id, c.starts_at, c.ends_at);
    const now = nowIso();
    if (evidence) {
      await query(
        `UPDATE appointments SET status='completed', completed_at=?, updated_at=? WHERE id=? AND status='scheduled'`,
        [now, now, c.id],
      );
      await query(
        `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'appointment', ?, ?)`,
        [uid(), markedBy, c.id, JSON.stringify({ status_from: 'scheduled', status_to: 'completed', via: 'auto-attendance', evidence })],
      );
      try {
        const { ensureConsultaForAppointment } = await import('./billing');
        await ensureConsultaForAppointment(c.id, markedBy);
      } catch {
        // Best-effort.
      }
      attended++;
    } else {
      await query(
        `UPDATE appointments SET status='no_show', no_show_at=?, no_show_by=?, updated_at=? WHERE id=? AND status='scheduled'`,
        [now, markedBy, now, c.id],
      );
      await query(
        `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'appointment', ?, ?)`,
        [uid(), markedBy, c.id, JSON.stringify({ status_from: 'scheduled', status_to: 'no_show', via: 'auto' })],
      );
      noShows++;
    }
    ids.push(c.id);
    touchedDentists.add(c.dentist_id);
  }
  await refreshCalendars([...touchedDentists]);
  return { checked: candidates.length, noShows, attended, ids };
}

async function findAttendanceEvidence(
  patientId: string,
  startsAt: string,
  endsAt: string,
): Promise<string | null> {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const from = new Date(s - 30 * 60000).toISOString();
  const to = new Date(e + 90 * 60000).toISOString();
  const between = 'datetime(?) AND datetime(?)';
  const checks: [string, unknown[], string][] = [
    [`SELECT id FROM treatments WHERE patient_id = ? AND datetime(created_at) BETWEEN ${between} LIMIT 1`, [patientId, from, to], 'treatment'],
    [`SELECT id FROM treatments WHERE patient_id = ? AND performed_at IS NOT NULL AND datetime(performed_at) BETWEEN ${between} LIMIT 1`, [patientId, from, to], 'treatment-performed'],
    [`SELECT id FROM invoices WHERE patient_id = ? AND datetime(issued_at) BETWEEN ${between} LIMIT 1`, [patientId, from, to], 'invoice'],
    [`SELECT p.id FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.patient_id = ? AND datetime(p.paid_at) BETWEEN ${between} LIMIT 1`, [patientId, from, to], 'payment'],
    [`SELECT id FROM attachments WHERE patient_id = ? AND datetime(uploaded_at) BETWEEN ${between} LIMIT 1`, [patientId, from, to], 'attachment'],
    [`SELECT id FROM odontogram_history WHERE patient_id = ? AND datetime(created_at) BETWEEN ${between} LIMIT 1`, [patientId, from, to], 'odontogram'],
  ];
  for (const [sql, args, label] of checks) {
    try {
      const row = await queryOne<{ id: string }>(sql, args as string[]);
      if (row) return label;
    } catch {
      // Table may not exist on old DBs (e.g. odontogram_history) — skip.
    }
  }
  // tooth_conditions has no patient_id; join via teeth_chart.
  try {
    const tc = await queryOne<{ id: string }>(
      `SELECT tc.id FROM tooth_conditions tc JOIN teeth_chart c ON c.id = tc.tooth_chart_id
       WHERE c.patient_id = ? AND datetime(tc.created_at) BETWEEN ${between} LIMIT 1`,
      [patientId, from, to],
    );
    if (tc) return 'odontogram';
  } catch {
    /* ignore */
  }
  return null;
}

/** Manual "run now" entry point (gated); the cron route calls sweepOverdueNoShows directly. */
export async function runAutoNoShowSweep(graceMin = 60) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:write')) return { error: 'forbidden' as const };
  const res = await sweepOverdueNoShows(graceMin, user.id);
  revalidatePath('/appointments');
  return { ok: true as const, ...res };
}

export async function listAppointmentsForWeek(startIso: string) {
  const end = new Date(new Date(startIso).getTime() + 7 * 86400_000).toISOString();
  const rows = await query<ApptRow>(
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
  // Decorate with clinic-local wall-clock so the list / cards can render
  // the time and use it for the WhatsApp template without trusting the
  // browser timezone (per AGENTS §12.9).
  const tz = await getClinicTimezone();
  return rows.map((r) => {
    const s = wallClockInTz(r.starts_at, tz);
    const e = wallClockInTz(r.ends_at, tz);
    return { ...r, clinic_date: s.date, start_hhmm: s.hhmm, end_hhmm: e.hhmm };
  });
}

/** Full appointment history for a single patient (all statuses, most recent first). */
export async function listAppointmentsForPatient(patientId: string) {
  await requireUser();
  return query<ApptRow>(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name,
            p.phone as patient_phone, p.email as patient_email,
            u.name as dentist_name, u.color as dentist_color,
            cu.name as creator_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     JOIN users u ON u.id = a.dentist_id
     LEFT JOIN users cu ON cu.id = a.created_by
     WHERE a.patient_id = ?
     ORDER BY a.starts_at DESC`,
    [patientId],
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
     WHERE l.used_at IS NULL AND l.revoked_at IS NULL
     ORDER BY l.created_at DESC`,
  );
  // Exclude expired links server-side (effective expiry = min(expires_at, created+idle)).
  const now = Date.now();
  return rows.filter((r) => effectiveExpiryMs(r) > now);
}
