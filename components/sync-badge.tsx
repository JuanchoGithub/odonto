'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pendingCount, runSync, useStoreVersion } from '@/lib/store/sync';
import { getConflicts } from '@/lib/store/mutations';
import { cn } from '@/lib/utils';

/**
 * Manual refresh button + pending-sync indicator. Always visible so staff
 * can force an immediate refresh on demand. When the write queue is
 * non-empty it shows the pending count; tapping forces a full sync. Taps
 * also refresh even when nothing is pending (pull the latest from the DB).
 */
export function SyncBadge() {
  const t = useTranslations('common');
  useStoreVersion();
  const [syncing, setSyncing] = useState(false);
  const pending = pendingCount();
  const conflicts = getConflicts().length;

  async function force() {
    if (syncing) return;
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
      variant={conflicts > 0 ? 'destructive' : 'ghost'}
      onClick={force}
      disabled={syncing}
      data-testid="sync-badge"
      title={t('syncHint')}
      className={cn('min-h-[44px] gap-1.5', pending > 0 && 'text-amber-600')}
    >
      <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
      {syncing
        ? t('refreshing')
        : pending > 0
          ? t('syncPending', { n: pending })
          : t('refresh')}
    </Button>
  );
}
