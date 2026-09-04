'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { query, queryOne } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import { getSlots, getClinicTimezone, wallClockInTz } from '@/lib/availability';
import { effectiveExpiryMs, linkStatus, type LinkStatus } from '@/lib/turn-picker';
export type { LinkStatus } from '@/lib/turn-picker';

const SlotMinutesSchema = z.union([z.literal(15), z.literal(30)]);

const CreateLinkSchema = z.object({
  patient_id: z.string().min(1),
  dentist_id: z.string().min(1),
  slot_minutes: z.coerce.number().pipe(SlotMinutesSchema),
  expires_in_days: z.coerce.number().int().min(1).max(60).default(14),
});

export type TurnPickerLinkRow = {
  id: string;
  token: string;
  patient_id: string;
  dentist_id: string;
  slot_minutes: number;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
};

function newToken(): string {
  return randomBytes(24).toString('base64url'); // 32 chars, 192 bits
}

export async function createTurnPickerLink(
  fd: FormData,
): Promise<
  | { ok: true; url: string }
  | { ok: false; error: 'invalid' | 'forbidden' | 'not_found' }
> {
  const user = await requireUser();
  if (!can(user.role, 'appointments:share')) return { ok: false, error: 'forbidden' };
  const parsed = CreateLinkSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const d = parsed.data;

  const [patient, dentist] = await Promise.all([
    queryOne<{ id: string }>('SELECT id FROM patients WHERE id = ?', [d.patient_id]),
    queryOne<{ id: string }>(
      `SELECT id FROM users WHERE id = ? AND role = 'dentist'`,
      [d.dentist_id],
    ),
  ]);
  if (!patient || !dentist) return { ok: false, error: 'not_found' };

  const token = newToken();
  const expiresAt = new Date(
    Date.now() + d.expires_in_days * 24 * 60 * 60 * 1000,
  ).toISOString();
  await query(
    `INSERT INTO turn_picker_links
       (id, token, patient_id, dentist_id, slot_minutes, expires_at, used_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [uid(), token, d.patient_id, d.dentist_id, d.slot_minutes, expiresAt, user.id, nowIso()],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta)
     VALUES (?, ?, 'create', 'turn_picker_link', ?, ?)`,
    [uid(), user.id, token.slice(0, 8), JSON.stringify({ patient_id: d.patient_id, dentist_id: d.dentist_id })],
  );
  revalidatePath(`/patients/${d.patient_id}`);
  return { ok: true, url: `/pick-turn/${token}` };
}

export type PublicLinkInfo = {
  ok: true;
  patientName: string;
  dentistName: string;
  slotMinutes: number;
  expiresAt: string; // effective expiry ISO
  timezone: string;
} | {
  ok: false;
  reason: 'invalid' | 'consumed' | 'expired';
};

export async function getPublicLinkInfo(token: string): Promise<PublicLinkInfo> {
  const link = await queryOne<TurnPickerLinkRow>(
    'SELECT * FROM turn_picker_links WHERE token = ?',
    [token],
  );
  if (!link) return { ok: false, reason: 'invalid' };
  const status = linkStatus(link);
  if (status !== 'active') {
    return { ok: false, reason: status === 'consumed' ? 'consumed' : 'expired' };
  }
  const [p, d, tz] = await Promise.all([
    queryOne<{ first_name: string; last_name: string }>(
      'SELECT first_name, last_name FROM patients WHERE id = ?',
      [link.patient_id],
    ),
    queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [
      link.dentist_id,
    ]),
    getClinicTimezone(),
  ]);
  return {
    ok: true,
    patientName: p ? `${p.first_name} ${p.last_name}` : '',
    dentistName: d?.name ?? '',
    slotMinutes: link.slot_minutes,
    expiresAt: new Date(effectiveExpiryMs(link)).toISOString(),
    timezone: tz,
  };
}

export async function getAvailability(
  token: string,
  fromDate: string,
  toDate: string,
): Promise<{ ok: true; slots: { start: string; end: string; date: string }[] } | { ok: false }> {
  const link = await queryOne<TurnPickerLinkRow>(
    'SELECT * FROM turn_picker_links WHERE token = ?',
    [token],
  );
  if (!link) return { ok: false };
  if (linkStatus(link) !== 'active') return { ok: false };
  const slots = await getSlots(link.dentist_id, fromDate, toDate, link.slot_minutes);
  const nowIsoStr = new Date().toISOString();
  return {
    ok: true,
    slots: slots.filter((s) => s.start > nowIsoStr),
  };
}

export type BookResult =
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; reason: 'invalid' | 'consumed' | 'expired' | 'slot_unavailable' | 'conflict' };

export async function bookViaPicker(
  token: string,
  slotStartIso: string,
): Promise<BookResult> {
  const link = await queryOne<TurnPickerLinkRow>(
    'SELECT * FROM turn_picker_links WHERE token = ?',
    [token],
  );
  if (!link) return { ok: false, reason: 'invalid' };
  const status = linkStatus(link);
  if (status !== 'active') {
    return { ok: false, reason: status === 'consumed' ? 'consumed' : 'expired' };
  }

  const start = new Date(slotStartIso);
  const end = new Date(start.getTime() + link.slot_minutes * 60_000);

  // Defensive: re-check the slot is still available (handles stale pages & races).
  // Use the clinic timezone so late-evening slots aren't misattributed to tomorrow.
  const tz = await getClinicTimezone();
  const date = wallClockInTz(slotStartIso, tz).date;
  const slots = await getSlots(link.dentist_id, date, date, link.slot_minutes);
  const stillAvailable = slots.some(
    (s) => Math.abs(new Date(s.start).getTime() - start.getTime()) < 60_000,
  );
  if (!stillAvailable) return { ok: false, reason: 'slot_unavailable' };

  // Atomic consume: flip used_at only if still NULL.
  const res = await query(
    `UPDATE turn_picker_links SET used_at = datetime('now')
     WHERE id = ? AND used_at IS NULL`,
    [link.id],
  );
  // query() discards rowsAffected; re-check via SELECT.
  const after = await queryOne<{ used_at: string | null }>(
    'SELECT used_at FROM turn_picker_links WHERE id = ?',
    [link.id],
  );
  if (!after?.used_at) {
    // Should not happen — but if we couldn't consume, don't create the appt.
    void res;
    return { ok: false, reason: 'consumed' };
  }

  const apptId = uid();
  await query(
    `INSERT INTO appointments
       (id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes, created_at)
     VALUES (?, ?, ?, ?, ?, 'scheduled', ?, NULL, ?)`,
    [
      apptId,
      link.patient_id,
      link.dentist_id,
      start.toISOString(),
      end.toISOString(),
      'self-booked',
      nowIso(),
    ],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta)
     VALUES (?, ?, 'book_via_picker', 'appointment', ?, ?)`,
    [
      uid(),
      link.created_by,
      apptId,
      JSON.stringify({ token_prefix: link.token.slice(0, 8), patient_id: link.patient_id }),
    ],
  );
  return { ok: true, startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export type TurnPickerLinkListItem = TurnPickerLinkRow & {
  status: LinkStatus;
  dentist_name: string;
};

export async function listLinksForPatient(
  patientId: string,
): Promise<TurnPickerLinkListItem[]> {
  await requireUser();
  const rows = await query<TurnPickerLinkRow & { dentist_name: string }>(
    `SELECT l.*, u.name as dentist_name
     FROM turn_picker_links l
     JOIN users u ON u.id = l.dentist_id
     WHERE l.patient_id = ?
     ORDER BY l.created_at DESC
     LIMIT 50`,
    [patientId],
  );
  return rows.map((r) => ({
    ...r,
    status: linkStatus(r),
  }));
}

export async function listDentists(): Promise<{ id: string; name: string }[]> {
  await requireUser();
  return query<{ id: string; name: string }>(
    `SELECT id, name FROM users WHERE role = 'dentist' ORDER BY name`,
  );
}
