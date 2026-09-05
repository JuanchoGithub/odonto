'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { can, requireUser } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';

const CondSchema = z.object({
  tooth_number: z.coerce.number().int().min(1).max(85),
  surface: z.enum(['occlusal', 'buccal', 'lingual', 'mesial', 'distal', 'root', 'whole']),
  condition: z.enum([
    'caries',
    'restoration',
    'missing',
    'crown',
    'to_extract',
    'perno',
    'sealant',
    'conduct_todo',
    'conduct_done',
  ]),
  note: z.string().optional().nullable(),
});

const ClearSchema = z.object({
  tooth_number: z.coerce.number().int().min(1).max(85),
  surface: z.enum(['occlusal', 'buccal', 'lingual', 'mesial', 'distal', 'root', 'whole']),
});

function forbid() {
  return { error: 'Forbidden' as const };
}

export async function setToothCondition(patientId: string, fd: FormData) {
  const user = await requireUser();
  if (!can(user.role, 'odontogram:write')) return forbid();
  const parsed = CondSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' };
  const data = parsed.data;

  let chart = await queryOne<{ id: string }>(
    'SELECT id FROM teeth_chart WHERE patient_id = ? AND tooth_number = ?',
    [patientId, data.tooth_number],
  );
  if (!chart) {
    const id = uid();
    await query(
      'INSERT INTO teeth_chart (id, patient_id, tooth_number, updated_at) VALUES (?, ?, ?, ?)',
      [id, patientId, data.tooth_number, nowIso()],
    );
    chart = { id };
  }

  await query('DELETE FROM tooth_conditions WHERE tooth_chart_id = ? AND surface = ?', [
    chart.id,
    data.surface,
  ]);
  await query(
    `INSERT INTO tooth_conditions (id, tooth_chart_id, surface, condition, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uid(), chart.id, data.surface, data.condition, data.note || null, nowIso()],
  );
  await query(`UPDATE teeth_chart SET updated_at = ? WHERE id = ?`, [
    nowIso(),
    chart.id,
  ]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'tooth_condition', ?, ?)`,
    [uid(), user.id, chart.id, JSON.stringify(data)],
  );
  revalidatePath(`/patients/${patientId}`);
  return { ok: true };
}

export async function clearToothSurface(patientId: string, fd: FormData) {
  const user = await requireUser();
  if (!can(user.role, 'odontogram:write')) return forbid();
  const parsed = ClearSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' };
  const data = parsed.data;

  const chart = await queryOne<{ id: string }>(
    'SELECT id FROM teeth_chart WHERE patient_id = ? AND tooth_number = ?',
    [patientId, data.tooth_number],
  );
  if (!chart) return { ok: true };

  await query(
    'DELETE FROM tooth_conditions WHERE tooth_chart_id = ? AND surface = ?',
    [chart.id, data.surface],
  );
  await query(`UPDATE teeth_chart SET updated_at = ? WHERE id = ?`, [
    nowIso(),
    chart.id,
  ]);
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'delete', 'tooth_condition', ?, ?)`,
    [uid(), user.id, chart.id, JSON.stringify({ surface: data.surface })],
  );
  revalidatePath(`/patients/${patientId}`);
  return { ok: true };
}

export type ToothRow = {
  tooth_number: number;
  conditions: {
    surface: string;
    condition: string;
    note: string | null;
  }[];
};

export type OdontogramMode =
  | { kind: 'kid' }
  | { kind: 'adult' }
  | { kind: 'both'; order: 'kid-then-adult' | 'adult-then-kid' };

/**
 * Decides which odontogram(s) to show for a patient based on age and
 * whether the kid odontogram has any history in the database.
 *
 *   age < 10  -> kid only
 *   10 <= age <= 12  -> both, kid first
 *   age > 12  -> adult only
 *   age > 12 but the kid odontogram has a record -> adult first, kid second
 */
export async function getOdontogramMode(patientId: string): Promise<OdontogramMode> {
  const patient = await queryOne<{ birth_date: string | null }>(
    'SELECT birth_date FROM patients WHERE id = ?',
    [patientId],
  );
  const now = new Date();
  const age = patient?.birth_date
    ? Math.floor(
        (now.getTime() - new Date(patient.birth_date).getTime()) /
          (365.25 * 86400_000),
      )
    : null;

  // Count kid teeth (51-85) that have any conditions recorded.
  const kidHistory = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM teeth_chart tc
     JOIN tooth_conditions c ON c.tooth_chart_id = tc.id
     WHERE tc.patient_id = ? AND tc.tooth_number BETWEEN 51 AND 85`,
    [patientId],
  );
  const hasKidHistory = (kidHistory?.c ?? 0) > 0;

  if (age == null) {
    // Unknown age -> default to adult only
    return { kind: 'adult' };
  }
  if (age < 10) {
    return { kind: 'kid' };
  }
  if (age <= 12) {
    return { kind: 'both', order: 'kid-then-adult' };
  }
  if (hasKidHistory) {
    return { kind: 'both', order: 'adult-then-kid' };
  }
  return { kind: 'adult' };
}

export async function getOdontogram(patientId: string) {
  const rows = await query<{
    tooth_number: number;
    surface: string;
    condition: string;
    note: string | null;
  }>(
    `SELECT tc.tooth_number, c.surface, c.condition, c.note
     FROM teeth_chart tc
     LEFT JOIN tooth_conditions c ON c.tooth_chart_id = tc.id
     WHERE tc.patient_id = ?
     ORDER BY tc.tooth_number`,
    [patientId],
  );
  const byTooth: Record<number, ToothRow> = {};
  for (const r of rows) {
    if (!byTooth[r.tooth_number]) {
      byTooth[r.tooth_number] = { tooth_number: r.tooth_number, conditions: [] };
    }
    if (r.surface) {
      byTooth[r.tooth_number].conditions.push({
        surface: r.surface,
        condition: r.condition,
        note: r.note,
      });
    }
  }
  return Object.values(byTooth);
}
