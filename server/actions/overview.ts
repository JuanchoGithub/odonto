'use server';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { nowIso } from '@/lib/utils';
import { getOdontogram, getOdontogramMode } from '@/server/actions/odontogram';

export type OverviewTurn = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  reason: string | null;
  dentist_name: string;
  dentist_id: string;
} | null;

export type OverviewTreatment = {
  id: string;
  description: string;
  status: string;
  tooth_number: number | null;
  cost_cents: number;
  created_at: string;
};

export type PatientOverview = {
  insurerName: string | null;
  lastPast: OverviewTurn;
  nextUpcoming: OverviewTurn;
  openTreatments: OverviewTreatment[];
  openTreatmentCount: number;
  unpaidCount: number;
  unpaidCents: number;
  teeth: Awaited<ReturnType<typeof getOdontogram>>;
  odontogramMode: Awaited<ReturnType<typeof getOdontogramMode>>;
};

/**
 * Single-round-trip summary for the patient Overview tab.
 * Last-past excludes cancelled/no_show (a missed turn is not a "visit");
 * next-upcoming only counts actionable statuses.
 */
export async function getPatientOverview(patientId: string): Promise<PatientOverview> {
  await requireUser();
  const now = nowIso();
  const [insurer, lastPast, nextUpcoming, openTreatments, openCount, balance, teeth, mode] =
    await Promise.all([
      queryOne<{ name: string | null }>(
        `SELECT i.name as name FROM patients p
         LEFT JOIN insurers i ON i.id = p.insurer_id
         WHERE p.id = ?`,
        [patientId],
      ),
      queryOne<NonNullable<OverviewTurn>>(
        `SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason, u.name as dentist_name, u.id as dentist_id
         FROM appointments a JOIN users u ON u.id = a.dentist_id
         WHERE a.patient_id = ? AND datetime(a.starts_at) < datetime(?)
           AND a.status NOT IN ('cancelled', 'no_show')
         ORDER BY datetime(a.starts_at) DESC LIMIT 1`,
        [patientId, now],
      ),
      queryOne<NonNullable<OverviewTurn>>(
        `SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason, u.name as dentist_name, u.id as dentist_id
         FROM appointments a JOIN users u ON u.id = a.dentist_id
         WHERE a.patient_id = ? AND datetime(a.starts_at) >= datetime(?)
           AND a.status IN ('scheduled', 'arrived', 'in_chair')
         ORDER BY datetime(a.starts_at) ASC LIMIT 1`,
        [patientId, now],
      ),
      query<OverviewTreatment>(
        `SELECT id, description, status, tooth_number, cost_cents, created_at
         FROM treatments
         WHERE patient_id = ? AND status IN ('planned', 'in_progress')
         ORDER BY datetime(created_at) DESC LIMIT 5`,
        [patientId],
      ),
      queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM treatments
         WHERE patient_id = ? AND status IN ('planned', 'in_progress')`,
        [patientId],
      ),
      queryOne<{ c: number; cents: number }>(
        `SELECT COUNT(*) as c,
                COALESCE(SUM(i.total_cents - COALESCE(
                  (SELECT SUM(p.amount_cents) FROM payments p WHERE p.invoice_id = i.id), 0)
                ), 0) as cents
         FROM invoices i
         WHERE i.patient_id = ? AND i.status = 'issued'`,
        [patientId],
      ),
      getOdontogram(patientId),
      getOdontogramMode(patientId),
    ]);
  return {
    insurerName: insurer?.name ?? null,
    lastPast: lastPast ?? null,
    nextUpcoming: nextUpcoming ?? null,
    openTreatments,
    openTreatmentCount: openCount?.c ?? 0,
    unpaidCount: balance?.c ?? 0,
    unpaidCents: balance?.cents ?? 0,
    teeth,
    odontogramMode: mode,
  };
}
