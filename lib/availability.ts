import { query, queryOne } from './db';

/**
 * Slot availability, single source of truth.
 *
 * A dentist's bookable window on a date is resolved in this order:
 *   1. clinic_exceptions row for that date            -> closed (no slots).
 *   2. dentist_exceptions row for (dentist, date):
 *        kind='time_off'     -> closed (no slots).
 *        kind='custom_hours' -> the exception's window replaces the schedule.
 *   3. dentist_schedules rows for the weekday (within effective range).
 *   4. Fallback: clinic_business_hours rows for the weekday.
 * If nothing matches, there are no slots that day.
 */

export type Slot = {
  start: string; // ISO 8601
  end: string; // ISO 8601
  date: string; // YYYY-MM-DD (clinic-local)
};

export type WorkingWindow = {
  startMin: number; // minutes since midnight, clinic-local
  endMin: number;
};

type ApptRow = { starts_at: string; ends_at: string };

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minToHHMM(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

function datesBetween(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const d = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  while (d <= end) {
    out.push(
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Resolve the working windows (minutes since midnight) for one date. */
function resolveWindowsForDate(
  date: string,
  weekday: number, // 0=Sun..6=Sat, clinic-local
  clinicExceptionDates: Set<string>,
  dentistExceptions: Map<string, { kind: string; start_time: string | null; end_time: string | null }>,
  /** null = dentist has no schedule rows at all → fall back to business hours. */
  schedules: Map<number, { start_time: string; end_time: string }[]> | null,
  businessHours: Map<number, { start_time: string; end_time: string }[]>,
): { windows: WorkingWindow[]; source: 'custom_hours' | 'schedule' | 'business_hours' | null } {
  if (clinicExceptionDates.has(date)) return { windows: [], source: null };

  const ex = dentistExceptions.get(date);
  if (ex) {
    if (ex.kind === 'time_off') return { windows: [], source: null };
    if (ex.kind === 'custom_hours' && ex.start_time && ex.end_time) {
      return {
        windows: [
          { startMin: hhmmToMin(ex.start_time), endMin: hhmmToMin(ex.end_time) },
        ],
        source: 'custom_hours',
      };
    }
  }

  // Schedule-level fallback: only when the dentist has NO schedule rows at all.
  const source = schedules === null ? businessHours : schedules;
  const label = schedules === null ? 'business_hours' : 'schedule';
  const rows = source.get(weekday);
  if (rows && rows.length > 0) {
    return {
      windows: rows.map((r) => ({
        startMin: hhmmToMin(r.start_time),
        endMin: hhmmToMin(r.end_time),
      })),
      source: label,
    };
  }
  return { windows: [], source: null };
}

export async function getClinicTimezone(): Promise<string> {
  const row = await queryOne<{ timezone: string }>(
    'SELECT timezone FROM clinics LIMIT 1',
  );
  return row?.timezone ?? 'UTC';
}

/**
 * All bookable slots for a dentist in [fromDate, toDate] (clinic-local dates),
 * minus existing non-terminal appointments.
 */
export async function getSlots(
  dentistId: string,
  fromDate: string, // YYYY-MM-DD, clinic-local
  toDate: string, // YYYY-MM-DD, clinic-local
  slotMinutes: number,
): Promise<Slot[]> {
  const [clinicExceptions, dentistExceptions, schedules, businessHours, appts] =
    await Promise.all([
      query<{ date: string }>(
        `SELECT date FROM clinic_exceptions WHERE date BETWEEN ? AND ?`,
        [fromDate, toDate],
      ),
      query<{
        date: string;
        kind: string;
        start_time: string | null;
        end_time: string | null;
      }>(
        `SELECT date, kind, start_time, end_time FROM dentist_exceptions
         WHERE dentist_id = ? AND date BETWEEN ? AND ?`,
        [dentistId, fromDate, toDate],
      )
        .then((rows) => new Map(rows.map((r) => [r.date, r]))),
      query<{
        day_of_week: number;
        start_time: string;
        end_time: string;
        effective_from: string | null;
        effective_to: string | null;
      }>(
        `SELECT day_of_week, start_time, end_time, effective_from, effective_to
         FROM dentist_schedules WHERE dentist_id = ?
           AND (effective_from IS NULL OR effective_from <= ?)
           AND (effective_to IS NULL OR effective_to >= ?)`,
        [dentistId, toDate, fromDate],
      ).then((rows) => {
        if (rows.length === 0) return null; // dentist never configured a schedule
        const m = new Map<number, { start_time: string; end_time: string }[]>();
        for (const r of rows) {
          const list = m.get(r.day_of_week) ?? [];
          list.push({ start_time: r.start_time, end_time: r.end_time });
          m.set(r.day_of_week, list);
        }
        return m;
      }),
      query<{ day_of_week: number; start_time: string; end_time: string }>(
        `SELECT day_of_week, start_time, end_time FROM clinic_business_hours`,
      ).then((rows) => {
        const m = new Map<number, { start_time: string; end_time: string }[]>();
        for (const r of rows) {
          const list = m.get(r.day_of_week) ?? [];
          list.push({ start_time: r.start_time, end_time: r.end_time });
          m.set(r.day_of_week, list);
        }
        return m;
      }),
      query<ApptRow>(
        `SELECT starts_at, ends_at FROM appointments
         WHERE dentist_id = ?
           AND status NOT IN ('cancelled','completed','no_show')
           AND datetime(starts_at) < datetime(?) AND datetime(ends_at) > datetime(?)`,
        [dentistId, toDate + 'T23:59:59.999Z', fromDate + 'T00:00:00.000Z'],
      ),
    ]);

  const clinicExceptionDates = new Set(clinicExceptions.map((r) => r.date));
  const busy = appts.map((a) => ({
    start: new Date(a.starts_at).getTime(),
    end: new Date(a.ends_at).getTime(),
  }));

  const slots: Slot[] = [];
  for (const date of datesBetween(fromDate, toDate)) {
    const weekday = new Date(date + 'T00:00:00').getDay();
    const { windows } = resolveWindowsForDate(
      date,
      weekday,
      clinicExceptionDates,
      dentistExceptions,
      schedules,
      businessHours,
    );
    for (const w of windows) {
      for (
        let startMin = w.startMin;
        startMin + slotMinutes <= w.endMin;
        startMin += slotMinutes
      ) {
        // Interpret the date+HH:MM in the server/clinic local timeline.
        // Stored as ISO with explicit offset.
        const start = new Date(`${date}T${minToHHMM(startMin)}:00`);
        const end = new Date(
          `${date}T${minToHHMM(startMin + slotMinutes)}:00`,
        );
        const overlaps = busy.some(
          (b) => !(end.getTime() <= b.start || start.getTime() >= b.end),
        );
        if (!overlaps) {
          slots.push({ start: start.toISOString(), end: end.toISOString(), date });
        }
      }
    }
  }
  return slots;
}

/**
 * Returns true if the exact [startsAt, endsAt] interval is covered by the
 * resolved working windows for that date (schedule / exception / fallback),
 * regardless of slot alignment and existing appointments.
 */
export async function isWithinWorkingHours(
  dentistId: string,
  startsAtIso: string,
  endsAtIso: string,
): Promise<boolean> {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;

  const [clinicEx, dentistEx, dentistHasSchedule, schedRows, bizRows] = await Promise.all([
    queryOne<{ date: string }>(
      `SELECT date FROM clinic_exceptions WHERE date = ?`,
      [date],
    ),
    queryOne<{
      kind: string;
      start_time: string | null;
      end_time: string | null;
    }>(
      `SELECT kind, start_time, end_time FROM dentist_exceptions
       WHERE dentist_id = ? AND date = ?`,
      [dentistId, date],
    ),
    queryOne<{ n: number }>(
      `SELECT COUNT(*) as n FROM dentist_schedules WHERE dentist_id = ?
         AND (effective_from IS NULL OR effective_from <= ?)
         AND (effective_to IS NULL OR effective_to >= ?)`,
      [dentistId, date, date],
    ),
    query<{ start_time: string; end_time: string }>(
      `SELECT start_time, end_time FROM dentist_schedules
       WHERE dentist_id = ? AND day_of_week = ?
         AND (effective_from IS NULL OR effective_from <= ?)
         AND (effective_to IS NULL OR effective_to >= ?)`,
      [dentistId, start.getDay(), date, date],
    ),
    query<{ start_time: string; end_time: string }>(
      `SELECT bh.start_time, bh.end_time FROM clinic_business_hours bh
       WHERE bh.day_of_week = ?`,
      [start.getDay()],
    ),
  ]);

  if (clinicEx) return false;

  let windows: { start_time: string; end_time: string }[] = [];
  if (dentistEx) {
    if (dentistEx.kind === 'time_off') return false;
    if (dentistEx.kind === 'custom_hours' && dentistEx.start_time && dentistEx.end_time) {
      windows = [{ start_time: dentistEx.start_time, end_time: dentistEx.end_time }];
    }
  } else if (dentistHasSchedule && dentistHasSchedule.n > 0) {
    // Dentist configured their own hours; no per-day fallback.
    windows = schedRows;
  } else {
    windows = bizRows;
  }

  if (windows.length === 0) return false;

  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  // Same-day appointments only.
  if (end.getDate() !== start.getDate()) return false;
  return windows.some(
    (w) => startMin >= hhmmToMin(w.start_time) && endMin <= hhmmToMin(w.end_time),
  );
}
