'use client';

import { useMemo } from 'react';
import { useSnapRows, type SchedulesSnapshot } from './snapshots';
import { wallClock } from './time';

/**
 * Pure client-side working-window projector. Mirrors
 * lib/availability.ts::resolveWindowsForDate so calendar shading renders
 * from the synced `schedules` snapshot with zero function invocations.
 */

export type WorkingWindow = {
  startMin: number; // minutes since midnight, clinic-local
  endMin: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

function tzOffsetMinutes(date: string, hhmm: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, m, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const tzH = get('hour') === 24 ? 0 : get('hour');
  const tzAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), tzH, get('minute'), 0);
  return (tzAsUtc - utcGuess) / 60_000;
}

function zonedDate(date: string, hhmm: string, tz: string): Date {
  const offsetMin = tzOffsetMinutes(date, hhmm, tz);
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, 0) - offsetMin * 60000);
}

/** Weekday index for a clinic-local calendar date in the clinic's TZ. */
function weekdayInTz(date: string, tz: string): number {
  const utc = zonedDate(date, '12:00', tz);
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    timeZoneName: 'short',
  })
    .formatToParts(utc)
    .find((p) => p.type === 'weekday')?.value;
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd ?? 'Sun'] ?? 0;
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

function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d + n));
  return `${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}-${pad2(cur.getUTCDate())}`;
}

function resolveWindowsForDate(
  date: string,
  weekday: number,
  clinicExceptionDates: Set<string>,
  dentistExceptions: Map<string, { kind: string; start_time: string | null; end_time: string | null }>,
  schedules: Map<number, { start_time: string; end_time: string }[]> | null,
  businessHours: Map<number, { start_time: string; end_time: string }[]>,
): WorkingWindow[] {
  if (clinicExceptionDates.has(date)) return [];
  const ex = dentistExceptions.get(date);
  if (ex) {
    if (ex.kind === 'time_off') return [];
    if (ex.kind === 'custom_hours' && ex.start_time && ex.end_time) {
      return [{ startMin: hhmmToMin(ex.start_time), endMin: hhmmToMin(ex.end_time) }];
    }
  }
  const source = schedules === null ? businessHours : schedules;
  const rows = source.get(weekday);
  if (rows && rows.length > 0) {
    return rows.map((r) => ({
      startMin: hhmmToMin(r.start_time),
      endMin: hhmmToMin(r.end_time),
    }));
  }
  return [];
}

/**
 * Working windows for the 7 days starting at weekStart (local Date),
 * from a synced schedules snapshot. dentistId = null resolves clinic
 * business hours + clinic exceptions only (the "all dentists" view).
 * Returns null when the snapshot hasn't synced yet (caller: unshaded).
 */
export function computeWeekWindows(
  snap: SchedulesSnapshot,
  dentistId: string | null,
  weekStart: Date,
): Record<string, WorkingWindow[]> {
  const tz = snap.tz || 'UTC';
  const startDate = wallClock(weekStart.toISOString(), tz).date;
  if (!startDate) return {};
  const endDate = addDaysStr(startDate, 6);
  const dates = datesBetween(startDate, endDate);

  const clinicExceptionDates = new Set(snap.clinicExceptions.map((r) => r.date));
  const dentistExceptions = new Map(
    snap.dentistExceptions
      .filter((r) => !dentistId || r.dentist_id === dentistId)
      .map((r) => [r.date, r] as const),
  );
  const toDayMap = (rows: { day_of_week: number; start_time: string; end_time: string }[]) => {
    const m = new Map<number, { start_time: string; end_time: string }[]>();
    for (const r of rows) {
      const list = m.get(r.day_of_week) ?? [];
      list.push({ start_time: r.start_time, end_time: r.end_time });
      m.set(r.day_of_week, list);
    }
    return m;
  };
  const schedRows = dentistId
    ? snap.dentistSchedules.filter(
        (r) =>
          r.dentist_id === dentistId &&
          (!r.effective_from || r.effective_from <= endDate) &&
          (!r.effective_to || r.effective_to >= startDate),
      )
    : [];
  const schedules = dentistId ? (schedRows.length > 0 ? toDayMap(schedRows) : null) : null;
  const businessHours = toDayMap(snap.businessHours);

  const out: Record<string, WorkingWindow[]> = {};
  for (const date of dates) {
    out[date] = resolveWindowsForDate(
      date,
      weekdayInTz(date, tz),
      clinicExceptionDates,
      dentistExceptions,
      schedules,
      businessHours,
    );
  }
  return out;
}

/** Raw schedules snapshot (null until first sync/seed). */
export function useSchedulesSnapshot(): SchedulesSnapshot | null {
  const rows = useSnapRows('schedules');
  return (rows[0] as SchedulesSnapshot | undefined) ?? null;
}

/** Week windows from the store; null while the snapshot is unseeded. */
export function useWeekWindows(
  dentistId: string | null,
  weekStart: Date,
): Record<string, WorkingWindow[]> | null {
  const snap = useSchedulesSnapshot();
  const key = Number.isFinite(weekStart.getTime()) ? weekStart.toISOString() : '';
  return useMemo(() => {
    if (!snap || !key) return null;
    try {
      return computeWeekWindows(snap, dentistId, new Date(key));
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, dentistId, key]);
}
