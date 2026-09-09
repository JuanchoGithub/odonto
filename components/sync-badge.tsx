'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pendingCount, runSync, useStoreVersion } from '@/lib/store/sync';
import { getConflicts } from '@/lib/store/mutations';
import { cn } from '@/lib/utils';

/**
 * Pending-sync indicator. Offline-first writes sit in a local queue until
 * the next sync — staff must see unsynced work. Tapping forces a full sync.
 * Hidden when the queue is empty.
 */
export function SyncBadge() {
  const t = useTranslations('common');
  useStoreVersion();
  const [syncing, setSyncing] = useState(false);
  const pending = pendingCount();
  if (pending === 0) return null;
  const conflicts = getConflicts().length;

  async function force() {
    setSyncing(true);
    try {
      await runSync();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={conflicts > 0 ? 'destructive' : 'outline'}
      onClick={force}
      disabled={syncing}
      data-testid="sync-badge"
      title={t('syncHint')}
      className={cn('min-h-[44px] gap-1.5')}
    >
      <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
      {t('syncPending', { n: pending })}
    </Button>
  );
}
