'use client';

import { useSyncExternalStore } from 'react';
import { emitStore, getStoreVersion, subscribeStore } from './bus';
import type { ApptRow } from '@/server/actions/appointments';
import type { PatientRow } from '@/server/actions/patients';
import type { InsurerRow } from '@/server/actions/insurers';
import type { CatalogRow } from '@/server/actions/catalog';
import type { InvoiceRow } from '@/server/actions/billing';
import type { TreatmentRow } from '@/server/actions/treatments';

/** Payment row as returned by the sync endpoint (with display joins). */
export type SyncPaymentRow = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  patient_name: string;
  paid_at: string;
  method: string;
  amount_cents: number;
  reference: string | null;
  updated_at: string;
};

/** Delta-synced kinds: incremental `updated_at > watermark` merge by id. */
export type DeltaKind =
  | 'appointments'
  | 'patients'
  | 'invoices'
  | 'payments'
  | 'treatments';

/** Fingerprint-synced kinds: tiny master tables, full replace on change. */
export type SnapshotKind = 'insurers' | 'catalog' | 'schedules';

/** Working-schedule tables for calendar shading (synced as one envelope). */
export type SchedulesSnapshot = {
  tz: string;
  businessHours: { day_of_week: number; start_time: string; end_time: string }[];
  dentistSchedules: {
    dentist_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string | null;
    effective_to: string | null;
  }[];
  dentistExceptions: {
    dentist_id: string;
    date: string;
    kind: string;
    start_time: string | null;
    end_time: string | null;
  }[];
  clinicExceptions: { date: string }[];
};

export type KindRow = {
  appointments: ApptRow;
  patients: PatientRow;
  invoices: InvoiceRow;
  payments: SyncPaymentRow;
  treatments: TreatmentRow;
  insurers: InsurerRow;
  catalog: CatalogRow;
  schedules: SchedulesSnapshot;
};

export const DELTA_KINDS: DeltaKind[] = [
  'appointments',
  'patients',
  'invoices',
  'payments',
  'treatments',
];
export const SNAPSHOT_KINDS: SnapshotKind[] = ['insurers', 'catalog', 'schedules'];

/** Hot kinds sync every 5 min; cold kinds sync daily / on demand. */
export const HOT_DELTA_KINDS: DeltaKind[] = ['appointments', 'invoices', 'payments'];
export const COLD_DELTA_KINDS: DeltaKind[] = ['patients', 'treatments'];

/** Row-count caps so a growing clinic degrades gracefully, never crashes. */
const ROW_CAPS: Record<DeltaKind | SnapshotKind, number> = {
  appointments: 2000,
  patients: 2000,
  invoices: 1000,
  payments: 2000,
  treatments: 2000,
  insurers: 500,
  catalog: 500,
  schedules: 1,
};

type DeltaEntry = { watermark: string; rows: unknown[] };
type SnapEntry = { fingerprint: string; rows: unknown[] };

export type PersistedStore = {
  v: 1;
  deltas: Record<DeltaKind, DeltaEntry>;
  snaps: Record<SnapshotKind, SnapEntry>;
  lastSyncAt: string | null;
  lastHotSyncAt: string | null;
};

const STORE_KEY = 'odonto-store-v1';

function emptyStore(): PersistedStore {
  const deltas = {} as Record<DeltaKind, DeltaEntry>;
  for (const k of DELTA_KINDS) deltas[k] = { watermark: '', rows: [] };
  const snaps = {} as Record<SnapshotKind, SnapEntry>;
  for (const k of SNAPSHOT_KINDS) snaps[k] = { fingerprint: '', rows: [] };
  return { v: 1, deltas, snaps, lastSyncAt: null, lastHotSyncAt: null };
}

let mem: PersistedStore | null = null;

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function load(): PersistedStore {
  if (mem) return mem;
  if (!isClient()) return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedStore;
      if (parsed && parsed.v === 1 && parsed.deltas && parsed.snaps) {
        // Forward-fill kinds added after the cache was written (no wipe).
        for (const k of DELTA_KINDS) {
          if (!parsed.deltas[k]) parsed.deltas[k] = { watermark: '', rows: [] };
        }
        for (const k of SNAPSHOT_KINDS) {
          if (!(parsed.snaps as Record<string, SnapEntry>)[k]) {
            (parsed.snaps as Record<string, SnapEntry>)[k] = { fingerprint: '', rows: [] };
          }
        }
        mem = parsed;
        return mem;
      }
    }
  } catch {
    // Corrupt or unavailable storage: fall through to empty.
  }
  mem = emptyStore();
  return mem;
}

function save(): void {
  if (!isClient() || !mem) return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(mem));
  } catch {
    // Quota exceeded: drop the largest delta payload and retry once.
    try {
      if (mem) {
        mem.deltas.appointments.rows = mem.deltas.appointments.rows.slice(-500);
        window.localStorage.setItem(STORE_KEY, JSON.stringify(mem));
      }
    } catch {
      // Storage unusable; in-memory state still works for this tab.
    }
  }
}

type RowWithId = { id: string; updated_at?: string };

/** Merge delta rows by id; advance the watermark to the max updated_at seen. */
export function applyDelta<K extends DeltaKind>(
  kind: K,
  watermark: string,
  rows: KindRow[K][],
): void {
  const s = load();
  const entry = s.deltas[kind];
  const byId = new Map<string, unknown>();
  for (const r of entry.rows as RowWithId[]) byId.set(r.id, r);
  let maxSeen = entry.watermark;
  for (const r of rows as RowWithId[]) {
    byId.set(r.id, r);
    if (typeof r.updated_at === 'string' && r.updated_at > maxSeen) {
      maxSeen = r.updated_at;
    }
  }
  let merged = [...byId.values()];
  // Prune appointments that aged out of the 30-day window.
  if (kind === 'appointments') {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    merged = merged.filter((r) => {
      const a = r as ApptRow;
      return typeof a.starts_at !== 'string' || a.starts_at.slice(0, 10) >= cutoff;
    });
  }
  const cap = ROW_CAPS[kind];
  if (merged.length > cap) merged = merged.slice(-cap);
  entry.rows = merged;
  if (watermark && watermark > entry.watermark) entry.watermark = watermark;
  if (maxSeen > entry.watermark) entry.watermark = maxSeen;
  save();
  emitStore();
}

/** Replace a fingerprint snapshot wholesale (tiny master tables). */
export function applySnapshot<K extends SnapshotKind>(
  kind: K,
  fingerprint: string,
  rows: KindRow[K][],
): void {
  const s = load();
  s.snaps[kind] = { fingerprint, rows: rows.slice(-ROW_CAPS[kind]) };
  save();
  emitStore();
}

/** Remove a row by id (e.g. confirmed temp rows, hard-deleted masters). */
export function removeRow(kind: DeltaKind | SnapshotKind, id: string): void {
  const s = load();
  if ((DELTA_KINDS as string[]).includes(kind)) {
    const e = s.deltas[kind as DeltaKind];
    e.rows = (e.rows as RowWithId[]).filter((r) => r.id !== id);
  } else {
    const e = s.snaps[kind as SnapshotKind];
    e.rows = (e.rows as RowWithId[]).filter((r) => r.id !== id);
  }
  save();
  emitStore();
}

/** Upsert a single row (optimistic writes, replay reconciliation). */
export function upsertRow<K extends DeltaKind | SnapshotKind>(
  kind: K,
  row: KindRow[K],
): void {
  const s = load();
  const list = ((DELTA_KINDS as string[]).includes(kind)
    ? (s.deltas[kind as DeltaKind].rows as RowWithId[])
    : (s.snaps[kind as SnapshotKind].rows as RowWithId[])) as RowWithId[];
  const idx = list.findIndex((r) => r.id === (row as RowWithId).id);
  if (idx >= 0) list[idx] = row as RowWithId;
  else list.push(row as RowWithId);
  save();
  emitStore();
}

export function getDeltaRows<K extends DeltaKind>(kind: K): KindRow[K][] {
  return load().deltas[kind].rows as KindRow[K][];
}

export function getSnapRows<K extends SnapshotKind>(kind: K): KindRow[K][] {
  return load().snaps[kind].rows as KindRow[K][];
}

export function getWatermarks(): Record<DeltaKind, string> {
  const s = load();
  return {
    appointments: s.deltas.appointments.watermark,
    patients: s.deltas.patients.watermark,
    invoices: s.deltas.invoices.watermark,
    payments: s.deltas.payments.watermark,
    treatments: s.deltas.treatments.watermark,
  };
}

export function getFingerprints(): Record<SnapshotKind, string> {
  const s = load();
  return {
    insurers: s.snaps.insurers.fingerprint,
    catalog: s.snaps.catalog.fingerprint,
    schedules: (s.snaps as Record<string, SnapEntry>).schedules?.fingerprint ?? '',
  };
}

export function setLastSync(at: string, hot: boolean): void {
  const s = load();
  s.lastSyncAt = at;
  if (hot) s.lastHotSyncAt = at;
  save();
}

export function getLastSync(): { lastSyncAt: string | null; lastHotSyncAt: string | null } {
  const s = load();
  return { lastSyncAt: s.lastSyncAt, lastHotSyncAt: s.lastHotSyncAt };
}

/**
 * Seed the store from SSR-provided initial data. Only fills kinds that are
 * currently empty so a fresh server snapshot never clobbers newer local state.
 */
export function hydrateFromServer(initial: {
  deltas?: Partial<Record<DeltaKind, { watermark: string; rows: unknown[] }>>;
  snaps?: Partial<Record<SnapshotKind, { fingerprint: string; rows: unknown[] }>>;
}): void {
  const s = load();
  let changed = false;
  if (initial.deltas) {
    for (const k of DELTA_KINDS) {
      const inc = initial.deltas[k];
      if (inc && s.deltas[k].rows.length === 0 && inc.rows.length > 0) {
        s.deltas[k] = { watermark: inc.watermark, rows: inc.rows.slice(-ROW_CAPS[k]) };
        changed = true;
      }
    }
  }
  if (initial.snaps) {
    for (const k of SNAPSHOT_KINDS) {
      const inc = initial.snaps[k];
      if (inc && s.snaps[k].rows.length === 0 && inc.rows.length > 0) {
        s.snaps[k] = { fingerprint: inc.fingerprint, rows: inc.rows.slice(-ROW_CAPS[k]) };
        changed = true;
      }
    }
  }
  if (changed) {
    save();
    emitStore();
  }
}

/** Wipe all cached clinical data (call on sign-out — PHI hygiene). */
export function clearStore(): void {
  mem = emptyStore();
  if (isClient()) {
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      // ignore
    }
  }
  emitStore();
}

/** Cross-tab: another tab wrote the store → reload and re-render. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) {
      mem = null;
      load();
      emitStore();
    }
    if (e.key === MUTATION_KEY || e.key === CONFLICT_KEY) {
      emitStore();
    }
  });
}

// Re-exported here (instead of importing mutations.ts) to avoid a cycle:
// mutations.ts imports upsertRow/removeRow from this module.
export const MUTATION_KEY = 'odonto-mutations-v1';
export const CONFLICT_KEY = 'odonto-conflicts-v1';

const STABLE_SNAPSHOT = 0;

/** React hook: subscribe to a delta kind. */
export function useDeltaRows<K extends DeltaKind>(kind: K): KindRow[K][] {
  useSyncExternalStore(
    subscribeStoreExternal,
    () => getStoreVersion(),
    () => STABLE_SNAPSHOT,
  );
  return getDeltaRows(kind);
}

/** React hook: subscribe to a fingerprint snapshot kind. */
export function useSnapRows<K extends SnapshotKind>(kind: K): KindRow[K][] {
  useSyncExternalStore(
    subscribeStoreExternal,
    () => getStoreVersion(),
    () => STABLE_SNAPSHOT,
  );
  return getSnapRows(kind);
}

function subscribeStoreExternal(fn: () => void): () => void {
  return subscribeStore(fn);
}
