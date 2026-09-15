'use client';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

export type PendingReprogramValue = {
  reprogram_pending?: boolean;
  reprogram_link_id?: string | null;
};

/**
 * True when the turn has an outstanding reprogram link. Server lists set the
 * exact `reprogram_pending` flag (live link status); store-driven views fall
 * back to the raw `reprogram_link_id` (bounded <24h stale by the daily sweep
 * that revokes expired reprogram links).
 */
export function isPendingReprogram(a: PendingReprogramValue): boolean {
  return a.reprogram_pending ?? !!a.reprogram_link_id;
}

/** "Reschedule pending" chip shown next to the Reprogramado ×N badge. */
export function PendingReprogramChip({ value }: { value: PendingReprogramValue }) {
  const t = useTranslations('appointments');
  if (!isPendingReprogram(value)) return null;
  return (
    <Badge variant="secondary" className="shrink-0" data-testid="pending-reprogram-chip">
      {t('whatsappPendingReprogram')}
    </Badge>
  );
}
