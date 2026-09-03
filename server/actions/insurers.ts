'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';

const InsurerSchema = z.object({
  name: z.string().min(1),
  plan: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
});

export type InsurerFormState = { error?: string; ok?: boolean; id?: string };

export async function createInsurer(
  _prev: InsurerFormState,
  fd: FormData,
): Promise<InsurerFormState> {
  const user = await requireUser();
  const parsed = InsurerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  }
  const d = parsed.data;
  const id = uid();
  try {
    await query(
      `INSERT INTO insurers (id, name, plan, phone, email, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        d.name.trim(),
        d.plan || null,
        d.phone || null,
        d.email || null,
        d.notes || null,
        nowIso(),
        nowIso(),
      ],
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('UNIQUE')) return { error: 'An insurer with that name already exists' };
    throw e;
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'insurer', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath('/insurers');
  redirect(`/insurers/${id}`);
}

export async function updateInsurer(
  id: string,
  _prev: InsurerFormState,
  fd: FormData,
): Promise<InsurerFormState> {
  const user = await requireUser();
  const parsed = InsurerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  }
  const d = parsed.data;
  try {
    await query(
      `UPDATE insurers SET name=?, plan=?, phone=?, email=?, notes=?, updated_at=? WHERE id=?`,
      [
        d.name.trim(),
        d.plan || null,
        d.phone || null,
        d.email || null,
        d.notes || null,
        nowIso(),
        id,
      ],
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('UNIQUE')) return { error: 'An insurer with that name already exists' };
    throw e;
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'update', 'insurer', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath('/insurers');
  revalidatePath(`/insurers/${id}`);
  return { ok: true };
}

export async function deleteInsurer(id: string) {
  await requireRole(['admin']);
  await query('DELETE FROM insurers WHERE id = ?', [id]);
  revalidatePath('/insurers');
  redirect('/insurers');
}

export type InsurerRow = {
  id: string;
  name: string;
  plan: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient_count?: number;
};

export async function listInsurers(q?: string): Promise<InsurerRow[]> {
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    return query<InsurerRow>(
      `SELECT i.*, (SELECT COUNT(*) FROM patients WHERE insurer_id = i.id) as patient_count
       FROM insurers i
       WHERE i.name LIKE ? OR IFNULL(i.plan,'') LIKE ?
       ORDER BY i.name
       LIMIT 200`,
      [like, like],
    );
  }
  return query<InsurerRow>(
    `SELECT i.*, (SELECT COUNT(*) FROM patients WHERE insurer_id = i.id) as patient_count
     FROM insurers i
     ORDER BY i.name
     LIMIT 200`,
  );
}

export async function getInsurer(id: string): Promise<InsurerRow | null> {
  const row = await queryOne<InsurerRow>(
    `SELECT i.*, (SELECT COUNT(*) FROM patients WHERE insurer_id = i.id) as patient_count
     FROM insurers i WHERE i.id = ?`,
    [id],
  );
  return row ?? null;
}

export type CreateInsurerResult =
  | { ok: true; insurer: InsurerRow }
  | { ok: false; error: string };

export async function createInsurerJson(body: unknown): Promise<CreateInsurerResult> {
  const user = await requireUser();
  const parsed = InsurerSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'invalid' };
  const d = parsed.data;
  const id = uid();
  try {
    await query(
      `INSERT INTO insurers (id, name, plan, phone, email, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        d.name.trim(),
        d.plan || null,
        d.phone || null,
        d.email || null,
        d.notes || null,
        nowIso(),
        nowIso(),
      ],
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('UNIQUE')) return { ok: false, error: 'duplicate' };
    throw e;
  }
  const created = await queryOne<InsurerRow>('SELECT * FROM insurers WHERE id = ?', [id]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'insurer', ?)`,
    [uid(), user.id, id],
  );
  revalidatePath('/insurers');
  return { ok: true, insurer: created! };
}
