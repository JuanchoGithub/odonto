'use server';
import { put } from '@vercel/blob';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import {
  buildDentistIcs,
  feedPathname,
  feedWindow,
  toWebcalUrl,
  type FeedEvent,
} from '@/lib/calendar-feed';

/**
 * Per-dentist subscribable calendar feeds (iPhone calendar subscription).
 *
 * Cost model: the phone subscribes DIRECTLY to the public Blob URL
 * (webcal://), so steady-state polling costs ZERO Vercel function
 * invocations. The only invocations are the Blob overwrite on each
 * appointment write (1, piggybacked on the write action) and the one-time
 * URL lookup when the doctor taps the subscribe button.
 *
 * The token is generated ONCE per dentist and never rotated (see migration
 * 0023). The Blob pathname embeds it, so the feed URL is stable forever.
 */

function newToken(): string {
  return uid().replace(/-/g, '');
}

async function getOrCreateToken(
  dentistId: string,
): Promise<{ token: string; name: string; url: string | null } | null> {
  const row = await queryOne<{
    id: string;
    name: string;
    calendar_token: string | null;
    calendar_url: string | null;
  }>(
    'SELECT id, name, calendar_token, calendar_url FROM users WHERE id = ? LIMIT 1',
    [dentistId],
  );
  if (!row) return null;
  if (row.calendar_token) {
    return { token: row.calendar_token, name: row.name, url: row.calendar_url };
  }
  const token = newToken();
  // Only fill when still NULL — concurrent writers can't clobber each other.
  await query(
    'UPDATE users SET calendar_token = ? WHERE id = ? AND calendar_token IS NULL',
    [token, dentistId],
  );
  const after = await queryOne<{
    name: string;
    calendar_token: string;
    calendar_url: string | null;
  }>('SELECT name, calendar_token, calendar_url FROM users WHERE id = ?', [
    dentistId,
  ]);
  if (!after?.calendar_token) return null;
  return { token: after.calendar_token, name: after.name, url: after.calendar_url };
}

/**
 * Regenerate + overwrite the dentist's rolling 6-week ICS feed in Blob.
 * Best-effort: never throws (notably when BLOB_READ_WRITE_TOKEN is absent
 * in local dev). Call fire-and-forget from every appointment write path.
 */
export async function refreshDentistCalendar(dentistId: string): Promise<void> {
  try {
    const dent = await getOrCreateToken(dentistId);
    if (!dent) return;
    const { from, to } = feedWindow();
    const rows = await query<FeedEvent>(
      `SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason, a.notes,
              a.reprogram_count,
              p.first_name || ' ' || p.last_name as patient_name,
              p.phone as patient_phone,
              u.name as dentist_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN users u ON u.id = a.dentist_id
       WHERE a.dentist_id = ?
         AND datetime(a.starts_at) >= datetime(?)
         AND datetime(a.starts_at) < datetime(?)
       ORDER BY a.starts_at`,
      [dentistId, from, to],
    );
    const ics = buildDentistIcs(dent.name, rows, nowIso());
    // Fixed pathname + no random suffix: the same public URL is overwritten
    // on every write, so the subscribed phone sees updates. Short edge cache
    // (SDK 0.27 has no allowOverwrite flag; same-pathname put overwrites).
    const blob = await put(feedPathname(dentistId, dent.token), ics, {
      access: 'public',
      contentType: 'text/calendar; charset=utf-8',
      addRandomSuffix: false,
      cacheControlMaxAge: 300,
    });
    if (blob.url !== dent.url) {
      await query('UPDATE users SET calendar_url = ? WHERE id = ?', [
        blob.url,
        dentistId,
      ]);
    }
  } catch (e) {
    // Best-effort; the appointment write already succeeded. Log server-side
    // so Vercel logs show the real cause (e.g. private Blob store, bad token).
    console.error('[calendar-feed] refresh failed', dentistId, e);
  }
}

/** Fire-and-forget wrapper for call sites (avoids unhandled rejections). */
export async function refreshDentistCalendars(
  dentistIds: (string | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(dentistIds.filter((d): d is string => !!d))];
  await Promise.all(ids.map((id) => refreshDentistCalendar(id)));
}

export type CalendarSubscription =
  | { ok: true; httpsUrl: string; webcalUrl: string }
  | { error: 'forbidden' | 'not_found' | 'unavailable' };

/**
 * One-time lookup for the subscribe button (1 invocation, then the phone
 * polls the Blob URL directly — zero further invocations). Ensures the feed
 * exists so the first tap never hands out a dead URL.
 */
export async function getCalendarSubscription(
  dentistId: string,
): Promise<CalendarSubscription> {
  const user = await requireUser();
  if (!can(user.role, 'appointments:read')) return { error: 'forbidden' };
  // Dentists may only fetch their own feed; staff may fetch any dentist's.
  if (user.role === 'dentist' && user.id !== dentistId) {
    return { error: 'forbidden' };
  }
  const dent = await queryOne<{ role: string }>(
    'SELECT role FROM users WHERE id = ?',
    [dentistId],
  );
  if (!dent) return { error: 'not_found' };
  await refreshDentistCalendar(dentistId);
  const row = await queryOne<{ calendar_url: string | null }>(
    'SELECT calendar_url FROM users WHERE id = ?',
    [dentistId],
  );
  if (!row?.calendar_url) return { error: 'unavailable' };
  return {
    ok: true,
    httpsUrl: row.calendar_url,
    webcalUrl: toWebcalUrl(row.calendar_url),
  };
}
