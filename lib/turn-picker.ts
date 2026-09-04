import { TURN_PICKER_IDLE_MS } from './config';

export type LinkStatus = 'active' | 'consumed' | 'expired';

/** Effective expiry = min(expires_at, created_at + idle window). */
export function effectiveExpiryMs(link: {
  expires_at: string;
  created_at: string;
}): number {
  const idleCap = new Date(link.created_at).getTime() + TURN_PICKER_IDLE_MS;
  return Math.min(new Date(link.expires_at).getTime(), idleCap);
}

export function linkStatus(
  link: { used_at: string | null; expires_at: string; created_at: string },
  now = Date.now(),
): LinkStatus {
  if (link.used_at) return 'consumed';
  if (now > effectiveExpiryMs(link)) return 'expired';
  return 'active';
}
