/**
 * Agenda horizon — how far ahead the agenda is "open" for booking.
 *
 * Single source of truth for the patient turn-picker window, the dentist
 * ICS feed forward leg, and the staff date-input max. Pure calendar-day
 * math on clinic-local `YYYY-MM-DD` strings (no DB, no TZ inside — the
 * caller resolves "today" in the clinic timezone).
 *
 * Rule (Mon–Sun weeks):
 *   base   = today + 14 days
 *   auto   = if today.day >= 15: Sunday ending the first FULL Mon–Sun week
 *            fully inside next month (sticky anchor, never overextends)
 *   manual = per-dentist `users.agenda_open_until`, when set and >= today
 *   end    = max(base, auto, manual), clamped to today + 62 days
 *
 * As days pass the fixed anchors fall behind `today + 14` and the window
 * folds back to the 14-day rule on its own.
 *
 * Example (October 2026: Thu 1 – Sun 4 partial, first full week Mon 5 –
 * Sun 11 → anchor Oct 11):
 *   Sep 15 (+14 = Sep 29) → Oct 11
 *   Sep 25 (+14 = Oct 9)  → Oct 11
 *   Sep 26 (+14 = Oct 10) → Oct 11
 *   Sep 27 (+14 = Oct 11) → Oct 11 (handoff)
 *   Sep 28 (+14 = Oct 12) → Oct 12 (back to 14-day rule)
 */

export const BASE_WINDOW_DAYS = 14;
export const TRIGGER_DAY = 15;
export const ABSOLUTE_MAX_WINDOW_DAYS = 62;
/** Total window length (today → end) above which the UI triple-confirms. */
export const FAR_WINDOW_DAYS = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function toMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromMs(ms: number): string {
  const dt = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** Calendar-day addition on YYYY-MM-DD strings (UTC-safe). */
export function addDays(dateStr: string, days: number): string {
  return fromMs(toMs(dateStr) + days * 86400_000);
}

/** Whole calendar days from `from` to `to` (to - from). */
export function diffDays(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / 86400_000);
}

/**
 * Sunday ending the first FULL Mon–Sun week fully inside (year, month1).
 * E.g. October 2026 → "2026-10-11" (week Mon 5 – Sun 11).
 */
export function endOfFirstFullWeekMonSun(
  year: number,
  month1: number,
): string {
  // Weekday of the 1st with Mon=0 … Sun=6.
  const firstDowMon0 = (new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay() + 6) % 7;
  // First Monday on/after the 1st; if the month opens on Monday it starts the first full week.
  const firstMonday = 1 + ((7 - firstDowMon0) % 7);
  return fromMs(Date.UTC(year, month1 - 1, firstMonday + 6));
}

/** Next month as { year, month1 } for a YYYY-MM-DD date. */
function nextMonth(dateStr: string): { year: number; month1: number } {
  const [y, m] = dateStr.split('-').map(Number);
  return m === 12 ? { year: y + 1, month1: 1 } : { year: y, month1: m + 1 };
}

/**
 * Sticky automatic anchor for `today`, or null when the rule is inactive
 * (day of month < TRIGGER_DAY).
 */
export function autoAnchorFor(today: string): string | null {
  if (!isValidDateStr(today)) return null;
  const day = Number(today.split('-')[2]);
  if (day < TRIGGER_DAY) return null;
  const { year, month1 } = nextMonth(today);
  return endOfFirstFullWeekMonSun(year, month1);
}

/**
 * Unified agenda end date (inclusive YYYY-MM-DD):
 * max(today + 14, auto anchor, manual date), clamped to today + 62.
 * Invalid/past manual dates are ignored (fold-back).
 */
export function agendaEndDate(
  today: string,
  manualUntil?: string | null,
): string {
  if (!isValidDateStr(today)) return today;
  const base = addDays(today, BASE_WINDOW_DAYS);
  let end = base;
  const auto = autoAnchorFor(today);
  if (auto && auto > end) end = auto;
  if (
    manualUntil &&
    isValidDateStr(manualUntil) &&
    manualUntil >= today &&
    manualUntil > end
  ) {
    end = manualUntil;
  }
  const cap = addDays(today, ABSOLUTE_MAX_WINDOW_DAYS);
  if (end > cap) end = cap;
  return end;
}

/** Total window length in days (today → end). */
export function windowDays(today: string, end: string): number {
  return diffDays(today, end);
}

/** True when the window exceeds the triple-confirm threshold (> 30 days). */
export function isFarWindow(today: string, end: string): boolean {
  return diffDays(today, end) > FAR_WINDOW_DAYS;
}
