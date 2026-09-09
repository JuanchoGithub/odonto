'use client';

/**
 * Tiny pub/sub for the offline-first client store. Every view reads from the
 * local snapshots and re-renders when the store changes — no per-view server
 * refetch. Backed by useSyncExternalStore in snapshots.ts.
 */

let version = 0;
const listeners = new Set<() => void>();

export function getStoreVersion(): number {
  return version;
}

export function subscribeStore(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitStore(): void {
  version += 1;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // A single broken subscriber must not break the store.
    }
  }
}
