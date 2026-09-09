'use client';

import { useSyncExternalStore } from 'react';
import { getStoreVersion, subscribeStore } from './bus';

/** Re-render the caller whenever the store changes. */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribeStore, getStoreVersion, () => 0);
}
