/**
 * Per-dentist ICS calendar feed builder (pure functions, no I/O).
 *
 * Rolling window: last 28 days + next 14 days (6 weeks total), computed at
 * generation time so old history falls off automatically. Cancelled / no-show
 * appointments are kept with STATUS:CANCELLED so the phone shows them struck
 * through instead of silently vanishing.
 */

export type FeedEvent = {
  id: string;
  starts_at: string; // tz-aware ISO
  ends_at: string; // tz-aware ISO
  status: string;
  reason: string | null;
  notes: string | null;
  reprogram_count: number | null;
  patient_name: string;
  patient_phone: string | null;
  dentist_name: string;
};

/** Rolling 6-week window bounds as ISO strings. */
export function feedWindow(nowMs = Date.now()): { from: string; to: string } {
  return {
    from: new Date(nowMs - 28 * 86400_000).toISOString(),
    to: new Date(nowMs + 14 * 86400_000).toISOString(),
  };
}

/** UTC basic format for ICS: YYYYMMDDTHHMMSSZ. */
export function icsDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Escape ICS TEXT values (RFC 5545 §3.3.11). */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line to ≤75 octets (all ASCII here, so chars). */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    out += '\r\n ' + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

const CANCELLED_STATUSES = new Set(['cancelled', 'no_show']);

export function eventSummary(e: FeedEvent): string {
  const reason = (e.reason ?? '').trim();
  return reason ? `${e.patient_name} — ${reason}` : e.patient_name;
}

export function eventDescription(e: FeedEvent): string {
  const parts = [`Odontólogo: ${e.dentist_name}`, `Estado: ${e.status}`];
  if (e.patient_phone) parts.push(`Tel: ${e.patient_phone}`);
  const notes = (e.notes ?? '').trim();
  if (notes) parts.push(notes);
  return parts.join('\n');
}

export function buildDentistIcs(
  dentistName: string,
  events: FeedEvent[],
  nowIsoStr = new Date().toISOString(),
): string {
  const dtstamp = icsDate(nowIsoStr);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Odonto//Dentist Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(`Turnos — ${dentistName}`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  const sorted = [...events].sort((a, b) =>
    a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0,
  );
  for (const e of sorted) {
    const cancelled = CANCELLED_STATUSES.has(e.status);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@odonto`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${icsDate(e.starts_at)}`,
      `DTEND:${icsDate(e.ends_at)}`,
      `SUMMARY:${escapeIcsText(eventSummary(e))}`,
      `DESCRIPTION:${escapeIcsText(eventDescription(e))}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE',
      `SEQUENCE:${e.reprogram_count ?? 0}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Blob pathname for a dentist feed. The token IS the secret: unguessable,
 *  generated once, never rotated — the URL stays stable forever. */
export function feedPathname(dentistId: string, token: string): string {
  const safeId = dentistId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, '');
  return `calendars/${safeId}-${safeToken}.ics`;
}

/** Convert an https:// Blob URL to the webcal:// URL iOS subscribes to. */
export function toWebcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//i, 'webcal://');
}
