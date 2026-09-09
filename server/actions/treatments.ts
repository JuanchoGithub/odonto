'use server';
import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso, amountToCents } from '@/lib/utils';

import {
  TreatmentSchema,
  TreatmentStatusSchema,
  type TreatmentData,
} from '@/lib/schemas/entities';

/**
 * Replayable core (also used by the offline sync flush). No revalidation.
 * `role` drives the provisional-catalog permission check for the caller.
 */
export async function createTreatmentCore(
  d: TreatmentData,
  userId: string,
  role: 'admin' | 'dentist' | 'receptionist',
  clientId?: string,
): Promise<{ ok: true; id: string }> {
  const id =
    clientId && /^[0-9a-fA-F-]{8,64}$/.test(clientId) ? clientId : uid();
  const now = nowIso();
  await query(
    `INSERT INTO treatments (id, patient_id, appointment_id, tooth_number, description, code, cost_cents, tax_kind, status, performed_by, performed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      d.patient_id,
      d.appointment_id || null,
      d.tooth_number ?? null,
      d.description,
      d.code || null,
      amountToCents(d.cost),
      d.tax_kind,
      d.status,
      d.status === 'done' ? userId : null,
      d.status === 'done' ? now : null,
      now,
      now,
    ],
  );
  // Provisional catalog entry: custom descriptions/prices flow into the shared
  // clinic list for everyone; secretary/admin later mark definitive. Dedup on
  // normalized description; never auto-create a second consulta kind.
  try {
    const desc = d.description.trim();
    const codeUpper = (d.code ?? '').trim().toUpperCase();
    const isConsulta = codeUpper === 'CONSULTA';
    if (desc && !isConsulta) {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM treatment_catalog WHERE lower(trim(description)) = lower(trim(?)) AND archived_at IS NULL LIMIT 1`,
        [desc],
      );
      if (!existing && (can(role, 'catalog:propose') || can(role, 'catalog:write'))) {
        await query(
          `INSERT INTO treatment_catalog (id, code, description, default_price_cents, tax_kind, kind, is_definitive, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'general', ?, ?, ?, ?)`,
          [
            uid(),
            d.code?.trim() || null,
            desc,
            amountToCents(d.cost),
            d.tax_kind,
            can(role, 'catalog:write') ? 1 : 0,
            userId,
            now,
            now,
          ],
        );
      }
    }
  } catch {
    // Provisional catalog is best-effort; treatment creation already succeeded.
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'treatment', ?)`,
    [uid(), userId, id],
  );
  return { ok: true, id };
}

export async function createTreatment(fd: FormData) {
  const user = await requireUser();
  if (!can(user.role, 'treatments:write')) return { error: 'Forbidden' };
  const parsed = TreatmentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  const res = await createTreatmentCore(parsed.data, user.id, user.role);
  revalidatePath(`/patients/${parsed.data.patient_id}`);
  revalidatePath('/treatments');
  return res;
}

/** Replayable core (also used by the offline sync flush). No revalidation. */
export async function updateTreatmentStatusCore(
  id: string,
  status: 'planned' | 'in_progress' | 'done' | 'cancelled',
  userId: string,
): Promise<void> {
  const performed_at = status === 'done' ? nowIso() : null;
  const performed_by = status === 'done' ? userId : null;
  await query(
    'UPDATE treatments SET status = ?, performed_at = ?, performed_by = ?, updated_at = ? WHERE id = ?',
    [status, performed_at, performed_by, nowIso(), id],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'treatment', ?, ?)`,
    [uid(), userId, id, JSON.stringify({ status })],
  );
}

export async function updateTreatmentStatus(id: string, status: string) {
  const user = await requireUser();
  if (!can(user.role, 'treatments:write')) return { error: 'Forbidden' };
  const parsed = TreatmentStatusSchema.safeParse(status);
  if (!parsed.success) return { error: 'Invalid' };
  await updateTreatmentStatusCore(id, parsed.data, user.id);
  revalidatePath('/treatments');
  return { ok: true as const };
}

export type TreatmentRow = {
  id: string;
  patient_id: string;
  patient_name: string;
  description: string;
  code: string | null;
  cost_cents: number;
  tax_kind: string;
  status: string;
  tooth_number: number | null;
  performed_at: string | null;
  created_at: string;
};

export async function listTreatmentsForPatient(patientId: string) {
  return query<TreatmentRow>(
    `SELECT t.*, p.first_name || ' ' || p.last_name as patient_name
     FROM treatments t JOIN patients p ON p.id = t.patient_id
     WHERE t.patient_id = ? ORDER BY t.created_at DESC`,
    [patientId],
  );
}

export async function listAllTreatments() {
  return query<TreatmentRow>(
    `SELECT t.*, p.first_name || ' ' || p.last_name as patient_name
     FROM treatments t JOIN patients p ON p.id = t.patient_id
     ORDER BY t.created_at DESC LIMIT 200`,
  );
}
