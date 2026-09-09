import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { query, queryOne } from '@/lib/db';
import { nowIso } from '@/lib/utils';
import {
  insertPatientWithAudit,
  updatePatientCore,
  deletePatientCore,
  type PatientRow,
} from '@/server/actions/patients';
import {
  createInsurerCore,
  updateInsurerCore,
  deleteInsurerCore,
  type InsurerRow,
} from '@/server/actions/insurers';
import {
  upsertCatalogEntryCore,
  markCatalogDefinitiveCore,
  archiveCatalogEntryCore,
  type CatalogRow,
} from '@/server/actions/catalog';
import {
  createTreatmentCore,
  updateTreatmentStatusCore,
  type TreatmentRow,
} from '@/server/actions/treatments';
import {
  PatientSchema,
  InsurerSchema,
  CatalogSchema,
  TreatmentSchema,
  TreatmentStatusSchema,
} from '@/lib/schemas/entities';

/**
 * Offline-first sync endpoint. One invocation per run:
 *   1. Push — replay the client's queued low-risk mutations (patients,
 *      insurers, catalog, treatments) with per-op conflict detection.
 *   2. Pull — incremental `updated_at > watermark` deltas for hot entities,
 *      fingerprint-checked full snapshots for tiny master tables.
 */

type DeltaKind = 'appointments' | 'patients' | 'invoices' | 'payments' | 'treatments';
type SnapshotKind = 'insurers' | 'catalog';

type MutationOp = {
  id: string;
  entity: 'patient' | 'insurer' | 'catalog' | 'treatment';
  action: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  rowId: string;
  baseVersion: string | null;
  at: string;
};

const VERSION_TABLE: Record<MutationOp['entity'], string> = {
  patient: 'patients',
  insurer: 'insurers',
  catalog: 'treatment_catalog',
  treatment: 'treatments',
};

async function currentVersion(
  entity: MutationOp['entity'],
  id: string,
): Promise<string | null> {
  const row = await queryOne<{ updated_at: string }>(
    `SELECT updated_at FROM ${VERSION_TABLE[entity]} WHERE id = ?`,
    [id],
  );
  return row?.updated_at ?? null;
}

function conflicted(base: string | null, current: string | null): boolean {
  return !!base && !!current && current > base;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: 'auth' }, { status: 401 });
  const user = session.user;
  const role = user.role;

  let body: {
    watermarks?: Record<string, string>;
    fingerprints?: Record<string, string>;
    mutations?: MutationOp[];
    kinds?: DeltaKind[];
    snaps?: SnapshotKind[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad-request' }, { status: 400 });
  }
  const watermarks = body.watermarks ?? {};
  const fingerprints = body.fingerprints ?? {};
  const mutations = Array.isArray(body.mutations) ? body.mutations.slice(0, 200) : [];
  const kinds = Array.isArray(body.kinds) ? body.kinds : [];
  const snaps = Array.isArray(body.snaps) ? body.snaps : [];
  const serverTime = nowIso();

  // ---- 1. Push: replay queued mutations ----
  const applied: {
    opId: string;
    ok: boolean;
    row?: unknown;
    rowId?: string;
    tempRowId?: string;
    error?: string;
    conflicted?: boolean;
  }[] = [];

  for (const op of mutations) {
    try {
      if (op.entity === 'patient') {
        if (!can(role, 'patients:write')) {
          applied.push({ opId: op.id, ok: false, error: 'forbidden' });
          continue;
        }
        if (op.action === 'create') {
          const parsed = PatientSchema.safeParse(op.payload);
          if (!parsed.success) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const id = await insertPatientWithAudit(parsed.data, user.id, op.rowId);
          const row = await queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', [id]);
          applied.push({ opId: op.id, ok: true, row, rowId: id, tempRowId: op.rowId });
        } else if (op.action === 'update') {
          const parsed = PatientSchema.safeParse(op.payload);
          if (!parsed.success) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const cur = await currentVersion('patient', op.rowId);
          if (!cur) {
            applied.push({ opId: op.id, ok: false, error: 'not_found' });
            continue;
          }
          await updatePatientCore(op.rowId, parsed.data, user.id);
          const row = await queryOne<PatientRow>('SELECT * FROM patients WHERE id = ?', [op.rowId]);
          applied.push({
            opId: op.id, ok: true, row, rowId: op.rowId,
            conflicted: conflicted(op.baseVersion, cur) || undefined,
          });
        } else {
          const cur = await currentVersion('patient', op.rowId);
          if (!cur) {
            applied.push({ opId: op.id, ok: false, error: 'not_found' });
            continue;
          }
          await deletePatientCore(op.rowId, user.id);
          applied.push({
            opId: op.id, ok: true, rowId: op.rowId,
            conflicted: conflicted(op.baseVersion, cur) || undefined,
          });
        }
      } else if (op.entity === 'insurer') {
        if (!can(role, 'insurers:write')) {
          applied.push({ opId: op.id, ok: false, error: 'forbidden' });
          continue;
        }
        if (op.action === 'create') {
          const parsed = InsurerSchema.safeParse(op.payload);
          if (!parsed.success) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const res = await createInsurerCore(parsed.data, user.id, op.rowId);
          if (!res.ok) {
            applied.push({ opId: op.id, ok: false, error: res.error });
            continue;
          }
          const row = await queryOne<InsurerRow>('SELECT * FROM insurers WHERE id = ?', [res.id]);
          applied.push({ opId: op.id, ok: true, row, rowId: res.id, tempRowId: op.rowId });
        } else if (op.action === 'update') {
          const parsed = InsurerSchema.safeParse(op.payload);
          if (!parsed.success) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const cur = await currentVersion('insurer', op.rowId);
          if (!cur) {
            applied.push({ opId: op.id, ok: false, error: 'not_found' });
            continue;
          }
          const res = await updateInsurerCore(op.rowId, parsed.data, user.id);
          if (!res.ok) {
            applied.push({ opId: op.id, ok: false, error: res.error });
            continue;
          }
          const row = await queryOne<InsurerRow>('SELECT * FROM insurers WHERE id = ?', [op.rowId]);
          applied.push({
            opId: op.id, ok: true, row, rowId: op.rowId,
            conflicted: conflicted(op.baseVersion, cur) || undefined,
          });
        } else {
          if (role !== 'admin') {
            applied.push({ opId: op.id, ok: false, error: 'forbidden' });
            continue;
          }
          await deleteInsurerCore(op.rowId);
          applied.push({ opId: op.id, ok: true, rowId: op.rowId });
        }
      } else if (op.entity === 'catalog') {
        if (op.action === 'create') {
          if (!can(role, 'catalog:propose') && !can(role, 'catalog:write')) {
            applied.push({ opId: op.id, ok: false, error: 'forbidden' });
            continue;
          }
          const parsed = CatalogSchema.safeParse(op.payload);
          if (!parsed.success) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const res = await upsertCatalogEntryCore(parsed.data, user.id, role, op.rowId);
          if (!res.ok) {
            applied.push({ opId: op.id, ok: false, error: res.error });
            continue;
          }
          const row = await queryOne<CatalogRow>(
            'SELECT * FROM treatment_catalog WHERE id = ?',
            [res.id],
          );
          applied.push({ opId: op.id, ok: true, row, rowId: res.id, tempRowId: op.rowId });
        } else {
          if (!can(role, 'catalog:write')) {
            applied.push({ opId: op.id, ok: false, error: 'forbidden' });
            continue;
          }
          if (op.action === 'update') {
            const cur = await currentVersion('catalog', op.rowId);
            if (!cur) {
              applied.push({ opId: op.id, ok: false, error: 'not_found' });
              continue;
            }
            const price =
              typeof op.payload.price === 'number' ? op.payload.price : undefined;
            const description =
              typeof op.payload.description === 'string' ? op.payload.description : undefined;
            const res = await markCatalogDefinitiveCore(op.rowId, user.id, { price, description });
            if (!res.ok) {
              applied.push({ opId: op.id, ok: false, error: res.error });
              continue;
            }
            const row = await queryOne<CatalogRow>(
              'SELECT * FROM treatment_catalog WHERE id = ?',
              [op.rowId],
            );
            applied.push({
              opId: op.id, ok: true, row, rowId: op.rowId,
              conflicted: conflicted(op.baseVersion, cur) || undefined,
            });
          } else {
            const res = await archiveCatalogEntryCore(op.rowId);
            if (!res.ok) {
              applied.push({ opId: op.id, ok: false, error: res.error });
              continue;
            }
            const row = await queryOne<CatalogRow>(
              'SELECT * FROM treatment_catalog WHERE id = ?',
              [op.rowId],
            );
            applied.push({ opId: op.id, ok: true, row, rowId: op.rowId });
          }
        }
      } else if (op.entity === 'treatment') {
        if (!can(role, 'treatments:write')) {
          applied.push({ opId: op.id, ok: false, error: 'forbidden' });
          continue;
        }
        if (op.action === 'create') {
          const parsed = TreatmentSchema.safeParse(op.payload);
          if (!parsed.success) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const res = await createTreatmentCore(parsed.data, user.id, role, op.rowId);
          const row = await queryOne<TreatmentRow>(
            `SELECT t.*, p.first_name || ' ' || p.last_name as patient_name
             FROM treatments t JOIN patients p ON p.id = t.patient_id WHERE t.id = ?`,
            [res.id],
          );
          applied.push({ opId: op.id, ok: true, row, rowId: res.id, tempRowId: op.rowId });
        } else {
          // update/delete both funnel through status (delete == cancelled).
          const status =
            op.action === 'delete'
              ? 'cancelled'
              : TreatmentStatusSchema.safeParse(op.payload.status).success
                ? (op.payload.status as 'planned' | 'in_progress' | 'done' | 'cancelled')
                : null;
          if (!status) {
            applied.push({ opId: op.id, ok: false, error: 'invalid' });
            continue;
          }
          const cur = await currentVersion('treatment', op.rowId);
          if (!cur) {
            applied.push({ opId: op.id, ok: false, error: 'not_found' });
            continue;
          }
          await updateTreatmentStatusCore(op.rowId, status, user.id);
          const row = await queryOne<TreatmentRow>(
            `SELECT t.*, p.first_name || ' ' || p.last_name as patient_name
             FROM treatments t JOIN patients p ON p.id = t.patient_id WHERE t.id = ?`,
            [op.rowId],
          );
          applied.push({
            opId: op.id, ok: true, row, rowId: op.rowId,
            conflicted: conflicted(op.baseVersion, cur) || undefined,
          });
        }
      } else {
        applied.push({ opId: (op as MutationOp).id, ok: false, error: 'unknown-entity' });
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      applied.push({
        opId: op.id,
        ok: false,
        error: msg.includes('UNIQUE') ? 'duplicate' : 'server',
      });
    }
  }

  // ---- 2. Pull: deltas + snapshots, gated per kind ----
  const deltas: Record<string, { watermark: string; rows: unknown[] }> = {};
  const snapshots: Record<string, { fingerprint: string; rows: unknown[] }> = {};

  const windowCutoff = new Date(Date.now() - 30 * 86400_000).toISOString();

  if (kinds.includes('appointments') && can(role, 'appointments:read')) {
    const wm = watermarks.appointments ?? '';
    const rows = await query(
      `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name,
              p.phone as patient_phone, p.email as patient_email,
              u.name as dentist_name, u.color as dentist_color,
              cu.name as creator_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN users u ON u.id = a.dentist_id
       LEFT JOIN users cu ON cu.id = a.created_by
       WHERE COALESCE(a.updated_at,'') > ? AND a.starts_at >= ?
       ORDER BY a.updated_at ASC LIMIT 500`,
      [wm, windowCutoff],
    );
    let max = wm;
    for (const r of rows as { updated_at?: string }[]) {
      if (typeof r.updated_at === 'string' && r.updated_at > max) max = r.updated_at;
    }
    deltas.appointments = { watermark: max, rows };
  }

  if (kinds.includes('patients') && can(role, 'patients:read')) {
    const wm = watermarks.patients ?? '';
    const rows = await query<PatientRow>(
      `SELECT * FROM patients WHERE COALESCE(updated_at,'') > ? ORDER BY updated_at ASC LIMIT 500`,
      [wm],
    );
    let max = wm;
    for (const r of rows) {
      if (r.updated_at > max) max = r.updated_at;
    }
    deltas.patients = { watermark: max, rows };
  }

  if (kinds.includes('invoices') && can(role, 'billing:read')) {
    const wm = watermarks.invoices ?? '';
    const rows = await query(
      `SELECT i.*, p.first_name || ' ' || p.last_name as patient_name,
              (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE invoice_id = i.id) as paid_cents
       FROM invoices i JOIN patients p ON p.id = i.patient_id
       WHERE COALESCE(i.updated_at,'') > ? ORDER BY i.updated_at ASC LIMIT 500`,
      [wm],
    );
    let max = wm;
    for (const r of rows as { updated_at?: string }[]) {
      if (typeof r.updated_at === 'string' && r.updated_at > max) max = r.updated_at;
    }
    deltas.invoices = { watermark: max, rows };
  }

  if (kinds.includes('payments') && can(role, 'billing:read')) {
    const wm = watermarks.payments ?? '';
    const rows = await query(
      `SELECT pay.*, i.number as invoice_number,
              p.first_name || ' ' || p.last_name as patient_name
       FROM payments pay
       JOIN invoices i ON i.id = pay.invoice_id
       JOIN patients p ON p.id = i.patient_id
       WHERE COALESCE(pay.updated_at,'') > ? ORDER BY pay.updated_at ASC LIMIT 500`,
      [wm],
    );
    let max = wm;
    for (const r of rows as { updated_at?: string }[]) {
      if (typeof r.updated_at === 'string' && r.updated_at > max) max = r.updated_at;
    }
    deltas.payments = { watermark: max, rows };
  }

  if (kinds.includes('treatments') && can(role, 'treatments:read')) {
    const wm = watermarks.treatments ?? '';
    const rows = await query(
      `SELECT t.*, p.first_name || ' ' || p.last_name as patient_name
       FROM treatments t JOIN patients p ON p.id = t.patient_id
       WHERE COALESCE(t.updated_at,'') > ? ORDER BY t.updated_at ASC LIMIT 500`,
      [wm],
    );
    let max = wm;
    for (const r of rows as { updated_at?: string }[]) {
      if (typeof r.updated_at === 'string' && r.updated_at > max) max = r.updated_at;
    }
    deltas.treatments = { watermark: max, rows };
  }

  if (snaps.includes('insurers') && can(role, 'insurers:read')) {
    const fp = await queryOne<{ m: string | null; n: number }>(
      `SELECT MAX(updated_at) as m, COUNT(*) as n FROM insurers`,
    );
    const fingerprint = `${fp?.m ?? ''}|${fp?.n ?? 0}`;
    if (fingerprint !== (fingerprints.insurers ?? '')) {
      const rows = await query<InsurerRow>(
        `SELECT * FROM insurers ORDER BY name LIMIT 500`,
      );
      snapshots.insurers = { fingerprint, rows };
    }
  }

  if (
    snaps.includes('catalog') &&
    (can(role, 'catalog:read') || can(role, 'treatments:read'))
  ) {
    const fp = await queryOne<{ m: string | null; n: number }>(
      `SELECT MAX(updated_at) as m, COUNT(*) as n FROM treatment_catalog`,
    );
    const fingerprint = `${fp?.m ?? ''}|${fp?.n ?? 0}`;
    if (fingerprint !== (fingerprints.catalog ?? '')) {
      const rows = await query<CatalogRow>(
        `SELECT * FROM treatment_catalog ORDER BY kind DESC, description ASC LIMIT 500`,
      );
      snapshots.catalog = { fingerprint, rows };
    }
  }

  return NextResponse.json({ ok: true, applied, deltas, snapshots, serverTime });
}
