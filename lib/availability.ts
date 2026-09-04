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

/** Weekday index for a clinic-local calendar date in the clinic's TZ. */
function weekdayInTz(date: string, tz: string): number {
  // Use noon to avoid any DST edge at midnight.
  const utc = zonedDate(date, '12:00', tz);
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    timeZoneName: 'short',
  })
    .formatToParts(utc)
    .find((p) => p.type === 'weekday')?.value;
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[wd ?? 'Sun'] ?? 0;
}

/**
 * Return the UTC `Date` for the wall-clock moment `${date} ${hhmm}` in `tz`.
 * Handles DST correctly by probing Intl with the UTC guess and correcting.
 */
function zonedDate(date: string, hhmm: string, tz: string): Date {
  const offsetMin = tzOffsetMinutes(date, hhmm, tz);
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, 0) - offsetMin * 60000);
}

/** Offset (minutes from UTC) of the given wall-clock in tz. Positive = east of UTC. */
function tzOffsetMinutes(date: string, hhmm: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, m, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const tzH = get('hour') === 24 ? 0 : get('hour');
  const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), tzH, get('minute'), 0);
  // `tzAsUtc` is the UTC instant whose wall-clock (in tz) matches `utcGuess`.
  // The offset is how much tz wall-clock is *behind* UTC: tzAsUtc - utcGuess.
  // Example: tz=America/Argentina/Buenos_Aires, date=2026-09-07, hhmm=09:00
  //   utcGuess = 2026-09-07T09:00:00Z
  //   tzAsUtc  = 2026-09-07T06:00:00Z (because 09:00 UTC falls at 06:00 ART)
  //   offset   = -180 minutes (ART is 3h behind UTC)
  return (tzAsUtc - utcGuess) / 60_000;
}

function datesBetween(fromDate: string, toDate: string): string[] {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const out: string[] = [];
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    out.push(
      `${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}-${pad2(cur.getUTCDate())}`,
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
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
  const tz = await getClinicTimezone();
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
    const weekday = weekdayInTz(date, tz);
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
        // Interpret the date+HH:MM in the clinic's timezone (DST-aware),
        // not the server's local timezone.
        const start = zonedDate(date, minToHHMM(startMin), tz);
        const end = zonedDate(date, minToHHMM(startMin + slotMinutes), tz);
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
  const tz = await getClinicTimezone();
  const startWall = wallClockInTz(startsAtIso, tz);
  const endWall = wallClockInTz(endsAtIso, tz);

  // Same-day appointments only, measured in clinic TZ.
  if (startWall.date !== endWall.date) return false;

  const date = startWall.date;
  const weekday = startWall.dayOfWeek;

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
      [dentistId, weekday, date, date],
    ),
    query<{ start_time: string; end_time: string }>(
      `SELECT bh.start_time, bh.end_time FROM clinic_business_hours bh
       WHERE bh.day_of_week = ?`,
      [weekday],
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

  return windows.some(
    (w) =>
      startWall.minutes >= hhmmToMin(w.start_time) &&
      endWall.minutes <= hhmmToMin(w.end_time),
  );
}

/** Convert an ISO instant to clinic-local wall-clock parts. */
export function wallClockInTz(iso: string, tz: string): {
  date: string;
  hhmm: string;
  minutes: number;
  dayOfWeek: number;
} {
  const d = new Date(iso);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = get('hour') === '24' ? 0 : Number(get('hour'));
  const minute = Number(get('minute'));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayMap[get('weekday')] ?? 0;
  return {
    date: `${year}-${pad2(month)}-${pad2(day)}`,
    hhmm: `${pad2(hour)}:${pad2(minute)}`,
    minutes: hour * 60 + minute,
    dayOfWeek: weekday,
  };
}
