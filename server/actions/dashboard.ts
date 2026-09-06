'use server';
import { query } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { getClinicTimezone, wallClockInTz } from '@/lib/availability';
import type { ApptRow } from './appointments';

/**
 * Role-panel data layer for the dashboard.
 *
 * All windows are computed against UTC instants; clinic-local grouping
 * (today / rest of week, HH:mm display) is derived via the clinic
 * timezone so wall-clock math never depends on server or browser TZ.
 */

/** ApptRow plus clinic wall-clock display fields (always correct). */
export type PanelAppt = ApptRow & {
  clinic_date: string;
  start_hhmm: string;
  end_hhmm: string;
};

const APPT_SELECT = `
  SELECT a.*, p.first_name || ' ' || p.last_name as patient_name,
         p.phone as patient_phone, p.email as patient_email,
         u.name as dentist_name, u.color as dentist_color,
         cu.name as creator_name
   FROM appointments a
   JOIN patients p ON p.id = a.patient_id
   JOIN users u ON u.id = a.dentist_id
   LEFT JOIN users cu ON cu.id = a.created_by
`;

function withClinicClock(rows: ApptRow[], tz: string): PanelAppt[] {
  return rows.map((r) => {
    const s = wallClockInTz(r.starts_at, tz);
    const e = wallClockInTz(r.ends_at, tz);
    return { ...r, clinic_date: s.date, start_hhmm: s.hhmm, end_hhmm: e.hhmm };
  });
}

function forbidden() {
  return { error: 'forbidden' as const };
}

/** Next-hour queue for a dentist: active statuses starting within 1h. */
export async function listDoctorQueue(dentistId?: string) {
  const user = await requireUser();
  if (!can(user.role, 'appointments:read')) return forbidden();
  // Dentists only ever see their own queue; admins may pass an id.
  const id = user.role === 'dentist' ? user.id : (dentistId ?? '');
  if (!id) return forbidden();
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60_000);
  const tz = await getClinicTimezone();
  const rows = await query<ApptRow>(
    `${APPT_SELECT}
     WHERE a.dentist_id = ?
       AND a.status IN ('scheduled', 'arrived', 'in_chair')
       AND datetime(a.starts_at) >= datetime(?)
       AND datetime(a.starts_at) < datetime(?)
     ORDER BY a.starts_at`,
    [id, now.toISOString(), inOneHour.toISOString()],
  );
  return { ok: true as const, items: withClinicClock(rows, tz) };
}

export type SecretarySchedule = {
  today: PanelAppt[];
  restOfWeek: { date: string; items: PanelAppt[] }[];
};

/** Today + rest of the week (clinic-local days), non-cancelled. */
export async function listSecretarySchedule(): Promise<
  { ok: true; schedule: SecretarySchedule } | { error: 'forbidden' }
> {
  const user = await requireUser();
  if (!can(user.role, 'appointments:read')) return forbidden();
  const tz = await getClinicTimezone();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayDate = wallClockInTz(nowIso, tz).date;
  const horizon = new Date(now.getTime() + 8 * 86400_000).toISOString();
  const rows = await query<ApptRow>(
    `${APPT_SELECT}
     WHERE a.status != 'cancelled'
       AND datetime(a.starts_at) >= datetime(?, '-24 hours')
       AND datetime(a.starts_at) < datetime(?)
     ORDER BY a.starts_at`,
    [nowIso, horizon],
  );
  const items = withClinicClock(rows, tz);
  const today = items.filter((r) => r.clinic_date === todayDate);
  const restMap = new Map<string, PanelAppt[]>();
  for (const r of items) {
    if (r.clinic_date <= todayDate) continue;
    const arr = restMap.get(r.clinic_date) ?? [];
    arr.push(r);
    restMap.set(r.clinic_date, arr);
  }
  const restOfWeek = [...restMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
  return { ok: true as const, schedule: { today, restOfWeek } };
}

export type FollowUps = {
  late: PanelAppt[];
  noShow: PanelAppt[];
  notCompleted: PanelAppt[];
};

/**
 * Actionable follow-ups, derived from status + time (no stored flags):
 * - late: scheduled, already started but not yet over (patient not arrived)
 * - noShow: scheduled/arrived but already ended (never came)
 * - notCompleted: in_chair but already ended (visit never closed)
 */
export async function listFollowUps(): Promise<
  { ok: true; followUps: FollowUps } | { error: 'forbidden' }
> {
  const user = await requireUser();
  if (!can(user.role, 'appointments:read')) return forbidden();
  const tz = await getClinicTimezone();
  const nowIso = new Date().toISOString();
  const rows = await query<ApptRow>(
    `${APPT_SELECT}
     WHERE a.status IN ('scheduled', 'arrived', 'in_chair')
       AND datetime(a.starts_at) >= datetime(?, '-7 days')
       AND datetime(a.starts_at) <= datetime(?, '+1 day')
     ORDER BY a.starts_at`,
    [nowIso, nowIso],
  );
  const items = withClinicClock(rows, tz);
  const late = items.filter(
    (r) => r.status === 'scheduled' && r.starts_at <= nowIso && r.ends_at > nowIso,
  );
  const noShow = items.filter(
    (r) =>
      (r.status === 'scheduled' || r.status === 'arrived') && r.ends_at <= nowIso,
  );
  const notCompleted = items.filter(
    (r) => r.status === 'in_chair' && r.ends_at <= nowIso,
  );
  return { ok: true as const, followUps: { late, noShow, notCompleted } };
}

export type PanelUnpaidInvoice = {
  id: string;
  number: string;
  patient_id: string;
  patient_name: string;
  issued_at: string;
  status: string;
  total_cents: number;
  paid_cents: number;
};

/** Open invoices (draft/issued) that still carry a balance. */
export async function listPanelUnpaid(): Promise<
  { ok: true; items: PanelUnpaidInvoice[] } | { error: 'forbidden' }
> {
  const user = await requireUser();
  if (!can(user.role, 'billing:read')) return forbidden();
  const rows = await query<PanelUnpaidInvoice>(
    `SELECT i.id, i.number, i.patient_id, i.issued_at, i.status,
            i.total_cents,
            p.first_name || ' ' || p.last_name as patient_name,
            (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE invoice_id = i.id) as paid_cents
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     WHERE i.status IN ('draft', 'issued')
     ORDER BY i.issued_at DESC
     LIMIT 100`,
  );
  return {
    ok: true as const,
    items: rows.filter((r) => r.total_cents - r.paid_cents > 0),
  };
}

export type PanelPayment = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  patient_name: string;
  paid_at: string;
  method: string;
  amount_cents: number;
};

/** Most recent payments, for the secretary's payment follow-through. */
export async function listPanelRecentPayments(
  limit = 20,
): Promise<{ ok: true; items: PanelPayment[] } | { error: 'forbidden' }> {
  const user = await requireUser();
  if (!can(user.role, 'billing:read')) return forbidden();
  const n = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await query<PanelPayment>(
    `SELECT pay.id, pay.invoice_id, pay.paid_at, pay.method, pay.amount_cents,
            i.number as invoice_number,
            p.first_name || ' ' || p.last_name as patient_name
     FROM payments pay
     JOIN invoices i ON i.id = pay.invoice_id
     JOIN patients p ON p.id = i.patient_id
     ORDER BY pay.paid_at DESC
     LIMIT ?`,
    [n],
  );
  return { ok: true as const, items: rows };
}
