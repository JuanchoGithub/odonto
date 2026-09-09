'use client';

import { getDeltaRows, getSnapRows, useDeltaRows, useSnapRows } from './snapshots';
import { runSync, useEnsureSeeded } from './sync';
import type { PatientOption } from '@/lib/patient-options';

export type { PatientOption };

/**
 * Store-backed option lists for pickers. These replace the per-dialog
 * `/api/patients?limit=200`, `/api/catalog`, and `/api/insurers?q=` fetches
 * with zero-invocation local reads over the synced snapshots.
 */

type PatientOpt = PatientOption & { document_id?: string | null; created_at?: string };

function toPatientOption(p: {
  id: string;
  first_name: string;
  last_name: string;
  document_id?: string | null;
  phone: string | null;
  email: string | null;
  created_at?: string;
}): PatientOpt {
  return {
    id: p.id,
    name: `${p.last_name}, ${p.first_name}`,
    phone: p.phone,
    email: p.email,
    document_id: p.document_id ?? null,
    created_at: p.created_at,
  };
}

/**
 * Relevance rank: prefix matches first (newest first — a just-created row
 * always surfaces), then substring matches. Keeps type-ahead useful as the
 * dataset grows instead of slicing alphabetically.
 */
function rank<T>(items: T[], needle: string, text: (t: T) => string, createdAt?: (t: T) => string | undefined): T[] {
  const starts: T[] = [];
  const subs: T[] = [];
  for (const it of items) {
    const hay = text(it).toLowerCase();
    if (hay.startsWith(needle)) starts.push(it);
    else if (hay.includes(needle)) subs.push(it);
  }
  const byNewest = (a: T, b: T) => {
    if (createdAt) {
      const ca = createdAt(a) ?? '';
      const cb = createdAt(b) ?? '';
      if (ca !== cb) return ca < cb ? 1 : -1;
    }
    return text(a) < text(b) ? -1 : 1;
  };
  starts.sort(byNewest);
  subs.sort(byNewest);
  return [...starts, ...subs];
}

/** All active patients as picker options (sorted, non-deleted). */
export function getPatientOptions(): PatientOpt[] {
  return getDeltaRows('patients')
    .filter((p) => !p.deleted_at)
    .map(toPatientOption)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** React hook version (re-renders on store change). */
export function usePatientOptions(): PatientOpt[] {
  useEnsureSeeded({ deltas: ['patients'] });
  const rows = useDeltaRows('patients');
  // Derive synchronously from the subscribed rows (no extra subscription).
  return rows
    .filter((p) => !p.deleted_at)
    .map(toPatientOption)
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Self-healing seed: searches await one full sync when the snapshot is
 * empty, so type-ahead works even if it fires before the mount seed lands.
 */
export async function ensurePatientsSeeded(): Promise<void> {
  if (getDeltaRows('patients').length === 0) {
    await runSync().catch(() => {});
  }
}

export async function ensureInsurersSeeded(): Promise<void> {
  if (getSnapRows('insurers').length === 0) {
    await runSync().catch(() => {});
  }
}

export async function ensureCatalogSeeded(): Promise<void> {
  if (getSnapRows('catalog').length === 0) {
    await runSync().catch(() => {});
  }
}

/** Local type-ahead over cached patients (name/document/phone/email). */
export function searchPatientsLocal(q: string, limit = 50): PatientOpt[] {
  const needle = q.trim().toLowerCase();
  const all = getPatientOptions();
  if (!needle) return all.slice(0, limit);
  const matched = all.filter((p) => {
    const extra = (p.document_id ?? '').toLowerCase();
    return (
      p.name.toLowerCase().includes(needle) ||
      (p.phone ?? '').toLowerCase().includes(needle) ||
      (p.email ?? '').toLowerCase().includes(needle) ||
      extra.includes(needle)
    );
  });
  return rank(matched, needle, (p) => p.name, (p) => p.created_at).slice(0, limit);
}

export type CatalogOptionRow = {
  id: string;
  code: string | null;
  description: string;
  default_price_cents: number;
  tax_kind: string;
  kind: string;
  is_definitive: number | boolean;
  archived_at: string | null;
};

/** Active catalog rows (non-archived). */
export function getCatalogRows(): CatalogOptionRow[] {
  return (getSnapRows('catalog') as unknown as CatalogOptionRow[]).filter(
    (c) => !c.archived_at,
  );
}

export function useCatalogRows(): CatalogOptionRow[] {
  useEnsureSeeded({ snaps: ['catalog'] });
  const rows = useSnapRows('catalog') as unknown as CatalogOptionRow[];
  return rows.filter((c) => !c.archived_at);
}

export type InsurerOptionRow = {
  id: string;
  name: string;
  plan: string | null;
  phone: string | null;
  email: string | null;
  created_at?: string;
};

export function getInsurerRows(): InsurerOptionRow[] {
  return getSnapRows('insurers') as unknown as InsurerOptionRow[];
}

export function useInsurerRows(): InsurerOptionRow[] {
  useEnsureSeeded({ snaps: ['insurers'] });
  return useSnapRows('insurers') as unknown as InsurerOptionRow[];
}

/** Local type-ahead over cached insurers (name/plan). */
export function searchInsurersLocal(q: string, limit = 50): InsurerOptionRow[] {
  const needle = q.trim().toLowerCase();
  const all = getInsurerRows();
  if (!needle) return all.slice(0, limit);
  const matched = all.filter(
    (i) =>
      i.name.toLowerCase().includes(needle) ||
      (i.plan ?? '').toLowerCase().includes(needle),
  );
  return rank(matched, needle, (i) => i.name, (i) => i.created_at).slice(0, limit);
}
