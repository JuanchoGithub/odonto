'use client';

import { useEffect } from 'react';
import {
  applyDelta,
  applySnapshot,
  getDeltaRows,
  getFingerprints,
  getLastSync,
  getSnapRows,
  getWatermarks,
  hydrateFromServer,
  removeRow,
  setLastSync,
  upsertRow,
  COLD_DELTA_KINDS,
  DELTA_KINDS,
  HOT_DELTA_KINDS,
  SNAPSHOT_KINDS,
  type DeltaKind,
  type KindRow,
  type SnapshotKind,
} from './snapshots';
import {
  addConflict,
  dropOps,
  getQueue,
  type MutationOp,
} from './mutations';
import { useStoreVersion } from './use-store-version';

export { useStoreVersion };

/**
 * Sync orchestrator. One POST /api/sync per run carries the mutation queue
 * (push) plus watermarks/fingerprints (pull). Deltas + snapshots run every
 * 15 min; the app shell owns the timer (SyncLoop). Views never sync on
 * mount — they read the store and seed-on-empty only.
 */

const HOT_MS = 15 * 60_000;

type AppliedOp = {
  opId: string;
  ok: boolean;
  row?: Record<string, unknown> | null;
  rowId?: string;
  tempRowId?: string;
  error?: string;
  conflicted?: boolean;
};

type SyncResponse = {
  ok: boolean;
  error?: string;
  applied?: AppliedOp[];
  conflicts?: { opId: string; note: string }[];
  deltas?: Partial<Record<DeltaKind, { watermark: string; rows: unknown[] }>>;
  snapshots?: Partial<Record<SnapshotKind, { fingerprint: string; rows: unknown[] }>>;
  serverTime?: string;
};

// Scope-aware in-flight slots. A 'hot' poll must never swallow a 'full'
// request (that race left cold snapshots unseeded on fresh sessions).
const inFlight: Record<'hot' | 'full', Promise<{ ok: boolean; error?: string }> | null> = {
  hot: null,
  full: null,
};

export function useSyncStatus(): number {
  return useStoreVersion();
}

export async function runSync(
  scope: 'hot' | 'full' = 'hot',
): Promise<{ ok: boolean; error?: string }> {
  if (inFlight[scope]) return inFlight[scope] as Promise<{ ok: boolean; error?: string }>;
  inFlight[scope] = doSync(scope).finally(() => {
    inFlight[scope] = null;
  });
  return inFlight[scope] as Promise<{ ok: boolean; error?: string }>;
}

async function doSync(scope: 'hot' | 'full'): Promise<{ ok: boolean; error?: string }> {
  const watermarks = getWatermarks();
  const fingerprints = getFingerprints();
  const mutations = getQueue();
  // Every sync checks ALL delta watermarks + snapshot fingerprints: ~7 tiny
  // indexed queries, rows transferred only on change. Cross-device freshness
  // is 15 min for every kind with no extra invocations. The scope param is
  // kept for call-site compatibility.
  void scope;
  const kinds = [...DELTA_KINDS];
  const snaps = [...SNAPSHOT_KINDS];

  let res: Response;
  try {
    res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ watermarks, fingerprints, mutations, kinds, snaps }),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'auth' };
  }
  if (!res.ok) {
    return { ok: false, error: `http-${res.status}` };
  }
  let data: SyncResponse;
  try {
    data = (await res.json()) as SyncResponse;
  } catch {
    return { ok: false, error: 'parse' };
  }
  if (!data.ok) return { ok: false, error: data.error ?? 'server' };

  // 1. Push results: drop confirmed temp rows, merge authoritative rows.
  const confirmed: string[] = [];
  for (const a of data.applied ?? []) {
    confirmed.push(a.opId);
    const op = mutations.find((m) => m.id === a.opId);
    if (a.ok && op) {
      if (a.tempRowId && a.tempRowId !== a.rowId) {
        // Create confirmed: temp row → server row.
        if (op.entity === 'patient') removeRow('patients', a.tempRowId);
        else if (op.entity === 'insurer') removeRow('insurers', a.tempRowId);
        else if (op.entity === 'catalog') removeRow('catalog', a.tempRowId);
        else if (op.entity === 'treatment') removeRow('treatments', a.tempRowId);
      }
      if (a.row) {
        if (op.entity === 'patient') upsertRow('patients', a.row as KindRow['patients']);
        else if (op.entity === 'insurer') upsertRow('insurers', a.row as KindRow['insurers']);
        else if (op.entity === 'catalog') upsertRow('catalog', a.row as KindRow['catalog']);
        else if (op.entity === 'treatment')
          upsertRow('treatments', a.row as KindRow['treatments']);
      }
      if (a.conflicted) {
        addConflict({
          opId: a.opId,
          entity: op.entity,
          action: op.action,
          rowId: a.rowId ?? op.rowId,
          at: data.serverTime ?? new Date().toISOString(),
          note: 'Overwritten by a newer server change (last-write-wins).',
        });
      }
    }
  }
  dropOps(confirmed);
  for (const c of data.conflicts ?? []) {
    const op = mutations.find((m) => m.id === c.opId);
    if (op) {
      addConflict({
        opId: c.opId,
        entity: op.entity,
        action: op.action,
        rowId: op.rowId,
        at: data.serverTime ?? new Date().toISOString(),
        note: c.note,
      });
    }
  }

  // 2. Pull: merge deltas + snapshots (includes our just-pushed writes).
  if (data.deltas) {
    for (const k of DELTA_KINDS) {
      const d = data.deltas[k];
      if (d) applyDelta(k, d.watermark, d.rows as KindRow[typeof k][]);
    }
  }
  if (data.snapshots) {
    for (const k of SNAPSHOT_KINDS) {
      const s = data.snapshots[k];
      if (s) applySnapshot(k, s.fingerprint, s.rows as KindRow[typeof k][]);
    }
  }
  setLastSync(data.serverTime ?? new Date().toISOString(), true);
  return { ok: true };
}

/** Seed the store from SSR initial data (first paint, zero extra calls). */
export function hydrateStore(initial: Parameters<typeof hydrateFromServer>[0]): void {
  hydrateFromServer(initial);
}

/**
 * Auto-sync hook. One incremental sync every 15 min while visible (all
 * watermarks + fingerprints checked, rows only on change), plus a gated
 * sync on tab foreground (skipped when the last sync is fresh, unless
 * queued mutations are waiting to flush). No sync on mount, no polling
 * while hidden. Mount exactly once (SyncLoop in the app shell).
 */
export function useAutoSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const shouldSync = () => {
      if (getQueue().length > 0) return true;
      const { lastHotSyncAt } = getLastSync();
      return !lastHotSyncAt || Date.now() - Date.parse(lastHotSyncAt) > HOT_MS;
    };

    const tick = () => {
      if (!mounted || document.hidden) return;
      if (shouldSync()) void runSync();
    };
    const onVis = () => {
      if (!document.hidden && shouldSync()) void runSync();
    };

    timer = setInterval(tick, HOT_MS);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Seed-on-empty: when a view mounts and its snapshot kinds are empty (fresh
 * session, first login), run the minimal sync once so the UI populates.
 * Steady state is unaffected — non-empty stores never trigger this.
 */
export function useEnsureSeeded(opts: {
  deltas?: DeltaKind[];
  snaps?: SnapshotKind[];
}): void {
  const d = (opts.deltas ?? []).join(',');
  const s = (opts.snaps ?? []).join(',');
  useEffect(() => {
    let needHot = false;
    let needFull = false;
    for (const k of opts.deltas ?? []) {
      if (getDeltaRows(k).length === 0) {
        if ((HOT_DELTA_KINDS as string[]).includes(k)) needHot = true;
        else needFull = true;
      }
    }
    for (const k of opts.snaps ?? []) {
      if (getSnapRows(k).length === 0) needFull = true;
    }
    if (needFull || needHot) void runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, s]);
}

/** Pending mutation count for the sync badge. */
export function pendingCount(): number {
  return getQueue().length;
}

export function coldDeltaKinds(): DeltaKind[] {
  return [...COLD_DELTA_KINDS];
}

export type { MutationOp };
export { getDeltaRows };
