'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { uid, nowIso, amountToCents } from '@/lib/utils';

const TreatmentSchema = z.object({
  patient_id: z.string().min(1),
  appointment_id: z.string().optional().nullable(),
  tooth_number: z.coerce.number().int().min(0).max(48).optional().nullable(),
  description: z.string().min(1),
  code: z.string().optional().nullable(),
  cost: z.coerce.number().min(0).default(0),
  tax_kind: z.enum(['standard', 'reduced', 'none']).default('standard'),
  status: z
    .enum(['planned', 'in_progress', 'done', 'cancelled'])
    .default('planned'),
});

export async function createTreatment(fd: FormData) {
  const user = await requireUser();
  const parsed = TreatmentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  const d = parsed.data;
  const id = uid();
  await query(
    `INSERT INTO treatments (id, patient_id, appointment_id, tooth_number, description, code, cost_cents, tax_kind, status, performed_by, performed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      d.status === 'done' ? user.id : null,
      d.status === 'done' ? nowIso() : null,
      nowIso(),
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'treatment', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath(`/patients/${d.patient_id}`);
  revalidatePath('/treatments');
  return { ok: true, id };
}

export async function updateTreatmentStatus(id: string, status: string) {
  const user = await requireUser();
  const performed_at = status === 'done' ? nowIso() : null;
  const performed_by = status === 'done' ? user.id : null;
  await query(
    'UPDATE treatments SET status = ?, performed_at = ?, performed_by = ? WHERE id = ?',
    [status, performed_at, performed_by, id],
  );
  revalidatePath('/treatments');
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
