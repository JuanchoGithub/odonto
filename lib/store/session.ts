'use client';

import { signOut } from 'next-auth/react';
import { clearStore } from './snapshots';
import { clearMutationState } from './mutations';

/**
 * Sign out and wipe all cached clinical data first (PHI hygiene — patient
 * data must not persist in the browser between sessions).
 */
export async function signOutAndClear(): Promise<void> {
  try {
    clearStore();
    clearMutationState();
  } catch {
    // Storage may be unavailable; sign out regardless.
  }
  await signOut({ callbackUrl: '/login' });
}
