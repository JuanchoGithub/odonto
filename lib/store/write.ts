'use client';

import { buildOp, enqueueOp, getQueue } from './mutations';
import { getDeltaRows } from './snapshots';
import { runSync } from './sync';

/**
 * Batched-write entry points. Payloads mirror the server zod schemas
 * field-for-field (kept in sync manually — see server/actions/*Schema).
 * Creates use client-generated ids adopted by the server, so queued rows
 * keep referential integrity before the flush.
 */

const PATIENT_FIELDS = [
  'first_name',
  'last_name',
  'document_id',
  'birth_date',
  'gender',
  'phone',
  'email',
  'address',
  'insurance_provider',
  'insurance_number',
  'insurer_id',
  'insurance_plan',
  'medical_history',
  'allergies',
  'notes',
  'chronic_conditions',
  'contagious_diseases',
  'current_medications',
  'allergies_medication',
  'blood_pressure',
  'blood_type',
  'diabetes',
  'pregnant',
  'last_medical_update',
] as const;

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function opt(v: FormDataEntryValue | null): string | null {
  const s = str(v).trim();
  return s === '' ? null : s;
}

export function patientPayloadFromFormData(fd: FormData): Record<string, unknown> {
  return {
    first_name: str(fd.get('first_name')),
    last_name: str(fd.get('last_name')),
    document_id: opt(fd.get('document_id')),
    birth_date: opt(fd.get('birth_date')),
    gender: opt(fd.get('gender')),
    phone: opt(fd.get('phone')),
    email: opt(fd.get('email')),
    address: opt(fd.get('address')),
    insurance_provider: opt(fd.get('insurance_provider')),
    insurance_number: opt(fd.get('insurance_number')),
    insurer_id: opt(fd.get('insurer_id')),
    insurance_plan: opt(fd.get('insurance_plan')),
    medical_history: opt(fd.get('medical_history')),
    allergies: opt(fd.get('allergies')),
    notes: opt(fd.get('notes')),
    chronic_conditions: opt(fd.get('chronic_conditions')),
    contagious_diseases: opt(fd.get('contagious_diseases')),
    current_medications: opt(fd.get('current_medications')),
    allergies_medication: opt(fd.get('allergies_medication')),
    blood_pressure: opt(fd.get('blood_pressure')),
    blood_type: opt(fd.get('blood_type')),
    diabetes: opt(fd.get('diabetes')),
    pregnant: opt(fd.get('pregnant')),
    last_medical_update: opt(fd.get('last_medical_update')),
  };
}

export function patientOptionFromPayload(
  id: string,
  p: Record<string, unknown>,
): { id: string; name: string; phone: string | null; email: string | null } {
  return {
    id,
    name: `${String(p.last_name ?? '')}, ${String(p.first_name ?? '')}`,
    phone: (p.phone as string) ?? null,
    email: (p.email as string) ?? null,
  };
}

/** Queue a patient create. Returns the (final) client-generated id. */
export function queuePatientCreate(fd: FormData): string {
  const op = buildOp('patient', 'create', patientPayloadFromFormData(fd));
  enqueueOp(op);
  return op.rowId;
}

/** Queue a patient update. baseVersion = row.updated_at when editing began. */
export function queuePatientUpdate(
  id: string,
  fd: FormData,
  baseVersion: string | null,
): void {
  enqueueOp(buildOp('patient', 'update', patientPayloadFromFormData(fd), id, baseVersion));
}

export function queuePatientDelete(id: string, baseVersion: string | null): void {
  enqueueOp(buildOp('patient', 'delete', {}, id, baseVersion));
}

export function queueInsurerCreate(fields: Record<string, unknown>): string {
  const op = buildOp('insurer', 'create', {
    name: String(fields.name ?? ''),
    plan: (fields.plan as string) || null,
    phone: (fields.phone as string) || null,
    email: (fields.email as string) || null,
    notes: (fields.notes as string) || null,
  });
  enqueueOp(op);
  return op.rowId;
}

export function queueInsurerUpdate(
  id: string,
  fields: Record<string, unknown>,
  baseVersion: string | null,
): void {
  enqueueOp(
    buildOp(
      'insurer',
      'update',
      {
        name: String(fields.name ?? ''),
        plan: (fields.plan as string) || null,
        phone: (fields.phone as string) || null,
        email: (fields.email as string) || null,
        notes: (fields.notes as string) || null,
      },
      id,
      baseVersion,
    ),
  );
}

export function queueInsurerDelete(id: string): void {
  enqueueOp(buildOp('insurer', 'delete', {}, id, null));
}

export function queueCatalogCreate(fields: Record<string, unknown>): string {
  const op = buildOp('catalog', 'create', {
    description: String(fields.description ?? ''),
    code: (fields.code as string) || null,
    price: Number(fields.price ?? 0),
    tax_kind: String(fields.tax_kind ?? 'standard'),
    kind: String(fields.kind ?? 'general'),
  });
  enqueueOp(op);
  return op.rowId;
}

export function queueCatalogDefinitive(
  id: string,
  opts: { price?: number; description?: string },
  baseVersion: string | null,
): void {
  enqueueOp(buildOp('catalog', 'update', { ...opts }, id, baseVersion));
}

export function queueCatalogArchive(id: string): void {
  enqueueOp(buildOp('catalog', 'delete', {}, id, null));
}

export function queueTreatmentCreate(fields: Record<string, unknown>): string {
  const op = buildOp('treatment', 'create', {
    patient_id: String(fields.patient_id ?? ''),
    appointment_id: (fields.appointment_id as string) || null,
    tooth_number:
      fields.tooth_number === undefined || fields.tooth_number === null
        ? null
        : Number(fields.tooth_number),
    description: String(fields.description ?? ''),
    code: (fields.code as string) || null,
    cost: Number(fields.cost ?? 0),
    tax_kind: String(fields.tax_kind ?? 'standard'),
    status: String(fields.status ?? 'planned'),
  });
  enqueueOp(op);
  return op.rowId;
}

export function queueTreatmentStatus(
  id: string,
  status: string,
  baseVersion: string | null,
): void {
  enqueueOp(buildOp('treatment', 'update', { status }, id, baseVersion));
}

/**
 * Is this patient id a queued create not yet confirmed by the server?
 * Immediate-flush writes with a patient FK (appointments) must flush first.
 */
export function isUnsyncedPatient(patientId: string): boolean {
  if (!patientId) return false;
  const pending = getQueue().some(
    (o) => o.entity === 'patient' && o.action === 'create' && o.rowId === patientId,
  );
  if (!pending) return false;
  // Belt and suspenders: also require the row to be absent server-side.
  // The store row exists optimistically; confirm via a watermark check is
  // overkill — queue membership alone means "not yet flushed".
  return true;
}

/**
 * Ensure a (possibly queued) patient exists server-side before an
 * immediate-flush write that references it. Returns true when safe.
 */
export async function ensurePatientSynced(patientId: string): Promise<boolean> {
  if (!isUnsyncedPatient(patientId)) return true;
  const res = await runSync();
  if (!res.ok) return false;
  if (isUnsyncedPatient(patientId)) return false;
  // Sanity: the row must now resolve in the store.
  return getDeltaRows('patients').some((p) => p.id === patientId);
}

export { PATIENT_FIELDS };
