'use client';

import { useAutoSync } from '@/lib/store/sync';

/**
 * App-shell background sync. Mounted once in the locale layout so every
 * page benefits: hot appointment/invoice/payment deltas every 5 min while
 * visible, full snapshots daily, instant refresh on tab foreground, and —
 * critically — flush of the queued offline writes wherever the user is.
 */
export function SyncLoop() {
  useAutoSync();
  return null;
}
