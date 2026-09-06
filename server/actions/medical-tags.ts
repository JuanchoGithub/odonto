'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import {
  MEDICAL_TAG_FIELDS,
  stripPunct,
  keyOf,
  validateTagTerm,
  type MedicalTagField,
} from '@/lib/medical-tags';

export type MedicalTagRow = {
  id: string;
  field: string;
  term: string;
  created_by: string;
  created_at: string;
};

/** Terms for one field (display casing). Read: any authenticated role. */
export async function listMedicalTags(field: string): Promise<string[]> {
  await requireUser();
  const rows = await query<MedicalTagRow>(
    'SELECT term FROM medical_tags WHERE field = ? ORDER BY lower(term)',
    [field],
  );
  return rows.map((r) => r.term);
}

/** All tags grouped by field — used by the Settings manager and patient form. */
export async function listAllMedicalTags(): Promise<Record<string, string[]>> {
  await requireUser();
  const rows = await query<MedicalTagRow>('SELECT field, term FROM medical_tags');
  const byField: Record<string, string[]> = {};
  for (const f of MEDICAL_TAG_FIELDS) byField[f] = [];
  for (const r of rows) {
    if (byField[r.field]) byField[r.field].push(r.term);
  }
  for (const f of MEDICAL_TAG_FIELDS) {
    byField[f].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
  return byField;
}

export type MedicalTagResult = { ok: true; term: string } | { ok: false; error: string };

const AddSchema = z.object({ field: z.string().min(1), term: z.string().min(1) });

/** Add a term to the shared dictionary. Allowed: dentist + admin. */
export async function addMedicalTag(
  field: string,
  term: string,
): Promise<MedicalTagResult> {
  const user = await requireUser();
  if (!can(user.role, 'medical-tags:write')) {
    return { ok: false, error: 'forbidden' };
  }
  const parsed = AddSchema.safeParse({ field, term });
  if (!parsed.success) return { ok: false, error: 'Invalid tag' };
  const err = validateTagTerm(parsed.data.field, parsed.data.term);
  if (err) return { ok: false, error: err };
  const clean = stripPunct(parsed.data.term.trim());
  const key = keyOf(clean);
  const existing = await queryOne<MedicalTagRow>(
    'SELECT id FROM medical_tags WHERE field = ? AND lower(term) = ?',
    [parsed.data.field, key],
  );
  if (existing) return { ok: true, term: clean }; // idempotent
  const id = uid();
  await query(
    'INSERT INTO medical_tags (id, field, term, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, parsed.data.field, clean, user.id, nowIso()],
  );
  await query(
    "INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'create', 'medical_tag', ?, ?)",
    [uid(), user.id, id, JSON.stringify({ field: parsed.data.field, term: clean })],
  );
  revalidatePath('/settings');
  revalidatePath(`/patients`);
  return { ok: true, term: clean };
}

/** Remove a term from the dictionary. Allowed: admin + the creator. */
export async function deleteMedicalTag(
  field: string,
  term: string,
): Promise<MedicalTagResult> {
  const user = await requireUser();
  if (!can(user.role, 'medical-tags:write')) {
    return { ok: false, error: 'forbidden' };
  }
  const clean = stripPunct(term.trim());
  const existing = await queryOne<MedicalTagRow>(
    'SELECT * FROM medical_tags WHERE field = ? AND lower(term) = ?',
    [field, keyOf(clean)],
  );
  if (!existing) return { ok: false, error: 'not-found' };
  if (user.role !== 'admin' && existing.created_by !== user.id) {
    return { ok: false, error: 'forbidden' };
  }
  await query('DELETE FROM medical_tags WHERE id = ?', [existing.id]);
  await query(
    "INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'delete', 'medical_tag', ?, ?)",
    [uid(), user.id, existing.id, JSON.stringify({ field, term: existing.term })],
  );
  revalidatePath('/settings');
  revalidatePath(`/patients`);
  return { ok: true, term: existing.term };
}