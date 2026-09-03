'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query, queryOne, transaction } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';

const PatientSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  document_id: z.string().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  gender: z.enum(['male', 'female', 'other', '']).optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  insurance_provider: z.string().optional().nullable(),
  insurance_number: z.string().optional().nullable(),
  insurer_id: z.string().optional().nullable(),
  insurance_plan: z.string().optional().nullable(),
  medical_history: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type PatientFormState = { error?: string; ok?: boolean };

const PATIENT_COLS =
  'first_name, last_name, document_id, birth_date, gender, phone, email, address, insurance_provider, insurance_number, insurer_id, insurance_plan, medical_history, allergies, notes';

export async function createPatient(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = PatientSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  const data = parsed.data;
  const id = uid();
  await query(
    `INSERT INTO patients (id, ${PATIENT_COLS}, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.first_name,
      data.last_name,
      data.document_id || null,
      data.birth_date || null,
      data.gender || null,
      data.phone || null,
      data.email || null,
      data.address || null,
      data.insurance_provider || null,
      data.insurance_number || null,
      data.insurer_id || null,
      data.insurance_plan || null,
      data.medical_history || null,
      data.allergies || null,
      data.notes || null,
      user.id,
      nowIso(),
      nowIso(),
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'patient', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath('/patients');
  redirect(`/patients/${id}`);
}

export async function updatePatient(
  id: string,
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = PatientSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  const data = parsed.data;
  await query(
    `UPDATE patients SET first_name=?, last_name=?, document_id=?, birth_date=?, gender=?, phone=?, email=?, address=?, insurance_provider=?, insurance_number=?, insurer_id=?, insurance_plan=?, medical_history=?, allergies=?, notes=?, updated_at=? WHERE id=?`,
    [
      data.first_name,
      data.last_name,
      data.document_id || null,
      data.birth_date || null,
      data.gender || null,
      data.phone || null,
      data.email || null,
      data.address || null,
      data.insurance_provider || null,
      data.insurance_number || null,
      data.insurer_id || null,
      data.insurance_plan || null,
      data.medical_history || null,
      data.allergies || null,
      data.notes || null,
      nowIso(),
      id,
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'update', 'patient', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath(`/patients/${id}`);
  return { ok: true };
}

export async function deletePatient(id: string) {
  const user = await requireUser();
  await query('DELETE FROM patients WHERE id=?', [id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'patient', ?)`,
    [uid(), user.id, id],
  );
  const created = await queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', [id]);
  revalidatePath('/patients');
  return { ok: true, patient: created! };
}
export async function createPatientInline(
  _prev: PatientFormState,
  formData: FormData,
): Promise<CreatePatientResult> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const parsed = PatientSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid' };
  }
  const data = parsed.data;
  const id = uid();
  await query(
    `INSERT INTO patients (id, ${PATIENT_COLS}, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.first_name,
      data.last_name,
      data.document_id || null,
      data.birth_date || null,
      data.gender || null,
      data.phone || null,
      data.email || null,
      data.address || null,
      data.insurance_provider || null,
      data.insurance_number || null,
      data.insurer_id || null,
      data.insurance_plan || null,
      data.medical_history || null,
      data.allergies || null,
      data.notes || null,
      user.id,
      nowIso(),
      nowIso(),
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'patient', ?)`,
    [uid(), user.id, id],
  );
  const created = await queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', [id]);
  revalidatePath('/patients');
  return { ok: true, patient: created! };
}

export type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  document_id: string | null;
  birth_date: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  insurer_id: string | null;
  insurance_plan: string | null;
  medical_history: string | null;
  allergies: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listPatients(q?: string, limit = 200) {
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    return query<PatientRow>(
      `SELECT * FROM patients
       WHERE first_name LIKE ? OR last_name LIKE ? OR document_id LIKE ? OR phone LIKE ? OR email LIKE ?
       ORDER BY last_name, first_name LIMIT ?`,
      [like, like, like, like, like, limit],
    );
  }
  return query<PatientRow>(
    'SELECT * FROM patients ORDER BY last_name, first_name LIMIT ?',
    [limit],
  );
}

export type CreatePatientResult =
  | { ok: true; patient: PatientRow }
  | { ok: false; error: string };

export async function createPatientJson(body: unknown): Promise<CreatePatientResult> {
  const Schema = PatientSchema;
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'invalid' };
  const data = parsed.data;
  const user = await requireUser();
  const id = uid();
  await query(
    `INSERT INTO patients (id, ${PATIENT_COLS}, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.first_name,
      data.last_name,
      data.document_id || null,
      data.birth_date || null,
      data.gender || null,
      data.phone || null,
      data.email || null,
      data.address || null,
      data.insurance_provider || null,
      data.insurance_number || null,
      data.insurer_id || null,
      data.insurance_plan || null,
      data.medical_history || null,
      data.allergies || null,
      data.notes || null,
      user.id,
      nowIso(),
      nowIso(),
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'patient', ?)`,
    [uid(), user.id, id],
  );
  const created = await queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', [id]);
  revalidatePath('/patients');
  return { ok: true, patient: created! };
}

export async function getPatient(id: string) {
  return queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', [id]);
}
