// Minimal in-memory token bucket for public endpoints.
// Per-key (IP is typical). Sufficient for a single-instance deploy;
// swap for an external store (e.g. Upstash) if running multi-instance.

type Bucket = { tokens: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically clean expired buckets so the map doesn't grow unbounded.
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}

/**
 * Allow `capacity` requests per `windowMs` per key.
 * Returns true if allowed, false if the limit was exceeded.
 */
export function rateLimit(
  key: string,
  capacity = 60,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  cleanup(now);
  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { tokens: capacity - 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.tokens <= 0) return false;
  existing.tokens -= 1;
  return true;
}
