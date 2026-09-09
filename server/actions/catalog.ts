'use server';
import { revalidatePath } from 'next/cache';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import type { Role } from '@/lib/schemas/common';
import { uid, nowIso, amountToCents } from '@/lib/utils';

export type CatalogRow = {
  id: string;
  code: string | null;
  description: string;
  default_price_cents: number;
  tax_kind: string;
  kind: string;
  is_definitive: number;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
};

export async function listCatalog(opts?: { includeArchived?: boolean }) {
  const user = await requireUser();
  if (!can(user.role, 'catalog:read') && !can(user.role, 'treatments:read')) return [];
  const rows = await query<CatalogRow>(
    `SELECT * FROM treatment_catalog ${opts?.includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY kind DESC, description ASC LIMIT 200`,
  );
  return rows;
}

export async function searchCatalog(q: string) {
  const user = await requireUser();
  if (!can(user.role, 'catalog:read') && !can(user.role, 'treatments:read')) return [];
  const like = `%${q.trim().toLowerCase()}%`;
  return query<CatalogRow>(
    `SELECT * FROM treatment_catalog
      WHERE archived_at IS NULL AND (lower(description) LIKE ? OR lower(COALESCE(code,'')) LIKE ?)
      ORDER BY is_definitive DESC, description ASC LIMIT 20`,
    [like, like],
  );
}

export async function getConsultaCatalog(): Promise<CatalogRow | null> {
  return queryOne<CatalogRow>(
    `SELECT * FROM treatment_catalog WHERE kind = 'consulta' AND archived_at IS NULL AND is_definitive = 1 ORDER BY created_at ASC LIMIT 1`,
  );
}

import { CatalogSchema, type CatalogData } from '@/lib/schemas/entities';

/**
 * Replayable core (also used by the offline sync flush). No revalidation.
 * `role` drives definitive-vs-provisional so the sync can replay as the user.
 */
export async function upsertCatalogEntryCore(
  d: CatalogData,
  userId: string,
  role: Role,
  clientId?: string,
): Promise<{ ok: true; id: string; deduped?: true } | { ok: false; error: string }> {
  const definitive = can(role, 'catalog:write') ? 1 : 0;
  if (!definitive && !can(role, 'catalog:propose'))
    return { ok: false, error: 'Forbidden' };
  // Dedup on normalized description (case-insensitive) to avoid near-duplicates.
  const existing = await queryOne<CatalogRow>(
    `SELECT * FROM treatment_catalog WHERE lower(trim(description)) = lower(trim(?)) AND archived_at IS NULL LIMIT 1`,
    [d.description.trim()],
  );
  if (existing) return { ok: true, id: existing.id, deduped: true };
  const id =
    clientId && /^[0-9a-fA-F-]{8,64}$/.test(clientId) ? clientId : uid();
  await query(
    `INSERT INTO treatment_catalog (id, code, description, default_price_cents, tax_kind, kind, is_definitive, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      d.code?.trim() || null,
      d.description.trim(),
      amountToCents(d.price),
      d.tax_kind,
      // Only one definitive consulta is supported for now; force general for new rows
      // unless caller is definitive-capable and explicitly asked for consulta.
      d.kind === 'consulta' && definitive ? 'consulta' : 'general',
      definitive,
      userId,
      nowIso(),
      nowIso(),
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'treatment_catalog', ?)`,
    [uid(), userId, id],
  );
  return { ok: true, id };
}

/** Admin/secretary create a definitive entry (or dentist proposes → provisional). */
export async function upsertCatalogEntry(fd: FormData) {
  const user = await requireUser();
  const parsed = CatalogSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' as const };
  const res = await upsertCatalogEntryCore(parsed.data, user.id, user.role);
  if (!res.ok) return { error: res.error as 'Forbidden' | 'Invalid' };
  revalidatePath('/settings');
  revalidatePath('/treatments');
  return res;
}

/** Replayable core (also used by the offline sync flush). No revalidation. */
export async function markCatalogDefinitiveCore(
  id: string,
  userId: string,
  opts?: { price?: number; description?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await queryOne<CatalogRow>(
    `SELECT * FROM treatment_catalog WHERE id = ?`,
    [id],
  );
  if (!existing) return { ok: false, error: 'Not found' };
  const priceCents =
    opts?.price != null && Number.isFinite(opts.price)
      ? amountToCents(opts.price)
      : existing.default_price_cents;
  const description = opts?.description?.trim() || existing.description;
  await query(
    `UPDATE treatment_catalog SET is_definitive = 1, default_price_cents = ?, description = ?, updated_at = ? WHERE id = ?`,
    [priceCents, description, nowIso(), id],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'treatment_catalog', ?, ?)`,
    [uid(), userId, id, JSON.stringify({ is_definitive: 1 })],
  );
  return { ok: true };
}

/** Secretary/admin marks a provisional entry definitive (or edits price). */
export async function markCatalogDefinitive(
  id: string,
  opts?: { price?: number; description?: string },
) {
  const user = await requireUser();
  if (!can(user.role, 'catalog:write')) return { error: 'Forbidden' as const };
  const res = await markCatalogDefinitiveCore(id, user.id, opts);
  if (!res.ok) return { error: res.error as 'Not found' };
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function archiveCatalogEntry(id: string) {
  const user = await requireUser();
  if (!can(user.role, 'catalog:write')) return { error: 'Forbidden' as const };
  // Never archive the single definitive consulta — it is the default attach.
  const res = await archiveCatalogEntryCore(id);
  if (!res.ok) return { error: res.error as 'Not found' | 'Cannot archive the consulta entry' };
  revalidatePath('/settings');
  return { ok: true as const };
}

/** Replayable core (also used by the offline sync flush). No revalidation. */
export async function archiveCatalogEntryCore(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await queryOne<CatalogRow>(
    `SELECT * FROM treatment_catalog WHERE id = ?`,
    [id],
  );
  if (!existing) return { ok: false, error: 'Not found' };
  if (existing.kind === 'consulta' && existing.is_definitive) {
    return { ok: false, error: 'Cannot archive the consulta entry' };
  }
  await query(`UPDATE treatment_catalog SET archived_at = ?, updated_at = ? WHERE id = ?`, [nowIso(), nowIso(), id]);
  return { ok: true };
}
