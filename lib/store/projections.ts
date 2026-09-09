'use client';

import { wallClock, mondayOf } from './time';
import type { ApptRow } from '@/server/actions/appointments';
import type { InvoiceRow } from '@/server/actions/billing';
import type { SyncPaymentRow } from './snapshots';

/**
 * Pure client-side projections over the cached snapshots. These mirror the
 * server logic in server/actions/dashboard.ts so panels render identical data
 * without spending a function invocation per poll.
 */

export type PanelItem = ApptRow & {
  clinic_date: string;
  start_hhmm: string;
  end_hhmm: string;
};

export function withClinicClock(rows: ApptRow[], tz: string): PanelItem[] {
  return rows.map((r) => {
    const s = wallClock(r.starts_at, tz);
    const e = wallClock(r.ends_at, tz);
    return { ...r, clinic_date: s.date, start_hhmm: s.hhmm, end_hhmm: e.hhmm };
  });
}

function isActiveStatus(s: string): boolean {
  return s === 'scheduled' || s === 'arrived' || s === 'in_chair';
}

/** Next-hour queue for a dentist: active statuses starting within 1h. */
export function doctorQueue(
  rows: ApptRow[],
  tz: string,
  dentistId: string,
  nowMs = Date.now(),
): PanelItem[] {
  const lo = nowMs;
  const hi = nowMs + 60 * 60_000;
  return withClinicClock(rows, tz).filter(
    (r) =>
      r.dentist_id === dentistId &&
      isActiveStatus(r.status) &&
      Date.parse(r.starts_at) >= lo &&
      Date.parse(r.starts_at) < hi,
  );
}

/** Every appointment the dentist has today (clinic-local), chronological. */
export function doctorToday(
  rows: ApptRow[],
  tz: string,
  dentistId: string,
  nowMs = Date.now(),
): { items: PanelItem[]; now_hhmm: string } {
  const nowIso = new Date(nowMs).toISOString();
  const todayDate = wallClock(nowIso, tz).date;
  const from = nowMs - 24 * 3600_000;
  const items = withClinicClock(rows, tz).filter(
    (r) =>
      r.dentist_id === dentistId &&
      r.status !== 'cancelled' &&
      Date.parse(r.starts_at) >= from &&
      Date.parse(r.starts_at) <= nowMs &&
      r.clinic_date === todayDate,
  );
  return { items, now_hhmm: wallClock(nowIso, tz).hhmm };
}

export type NextUpcomingItem = {
  appt: PanelItem;
  minutes_until: number;
  days_until: number;
  week_delta: number;
  weekday: number;
};

/** Next few active appointments (smart empty state). Returns null when none. */
export function doctorNextUpcoming(
  rows: ApptRow[],
  tz: string,
  dentistId: string,
  nowMs = Date.now(),
  limit = 3,
): NextUpcomingItem[] | null {
  const n = Math.max(1, Math.min(10, Math.floor(limit)));
  const nowIso = new Date(nowMs).toISOString();
  const upcoming = withClinicClock(rows, tz)
    .filter(
      (r) =>
        r.dentist_id === dentistId &&
        isActiveStatus(r.status) &&
        Date.parse(r.starts_at) >= nowMs,
    )
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .slice(0, n);
  if (upcoming.length === 0) return null;
  const nowWall = wallClock(nowIso, tz);
  const nowWeek = mondayOf(nowWall.date);
  return upcoming.map((appt) => {
    const startWall = wallClock(appt.starts_at, tz);
    const daysUntil = Math.round(
      (Date.parse(startWall.date) - Date.parse(nowWall.date)) / 86400_000,
    );
    const weekDelta = Math.round(
      (Date.parse(mondayOf(startWall.date)) - Date.parse(nowWeek)) / (7 * 86400_000),
    );
    const minutesUntil = Math.max(
      0,
      Math.round((Date.parse(appt.starts_at) - Date.parse(nowIso)) / 60_000),
    );
    return {
      appt,
      minutes_until: minutesUntil,
      days_until: daysUntil,
      week_delta: weekDelta,
      weekday: startWall.dayOfWeek,
    };
  });
}

export type SecretarySchedule = {
  today: PanelItem[];
  restOfWeek: { date: string; items: PanelItem[] }[];
};

/** Today + rest of week (clinic-local), non-cancelled. */
export function secretarySchedule(
  rows: ApptRow[],
  tz: string,
  nowMs = Date.now(),
): SecretarySchedule {
  const nowIso = new Date(nowMs).toISOString();
  const todayDate = wallClock(nowIso, tz).date;
  const horizon = nowMs + 8 * 86400_000;
  const from = nowMs - 24 * 3600_000;
  const items = withClinicClock(rows, tz)
    .filter(
      (r) =>
        r.status !== 'cancelled' &&
        Date.parse(r.starts_at) >= from &&
        Date.parse(r.starts_at) < horizon,
    )
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const today = items.filter((r) => r.clinic_date === todayDate);
  const restMap = new Map<string, PanelItem[]>();
  for (const r of items) {
    if (r.clinic_date <= todayDate) continue;
    const arr = restMap.get(r.clinic_date) ?? [];
    arr.push(r);
    restMap.set(r.clinic_date, arr);
  }
  const restOfWeek = [...restMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
  return { today, restOfWeek };
}

export type FollowUpGroups = {
  late: PanelItem[];
  noShow: PanelItem[];
  notCompleted: PanelItem[];
};

/** Actionable follow-ups derived from status + time. */
export function followUps(rows: ApptRow[], tz: string, nowMs = Date.now()): FollowUpGroups {
  const nowIso = new Date(nowMs).toISOString();
  const from = nowMs - 7 * 86400_000;
  const to = nowMs + 86400_000;
  const items = withClinicClock(rows, tz).filter(
    (r) =>
      (r.status === 'scheduled' || r.status === 'arrived' || r.status === 'in_chair') &&
      Date.parse(r.starts_at) >= from &&
      Date.parse(r.starts_at) <= to,
  );
  const late = items.filter(
    (r) => r.status === 'scheduled' && r.starts_at <= nowIso && r.ends_at > nowIso,
  );
  const noShow = items.filter(
    (r) =>
      (r.status === 'scheduled' || r.status === 'arrived') && r.ends_at <= nowIso,
  );
  const notCompleted = items.filter(
    (r) => r.status === 'in_chair' && r.ends_at <= nowIso,
  );
  return { late, noShow, notCompleted };
}

export type UnpaidInvoice = {
  id: string;
  number: string;
  patient_id: string;
  patient_name: string;
  issued_at: string;
  status: string;
  total_cents: number;
  paid_cents: number;
};

/** Open invoices that still carry a balance (paid sums from payments). */
export function unpaidInvoices(
  invoices: InvoiceRow[],
  payments: SyncPaymentRow[],
): UnpaidInvoice[] {
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount_cents);
  }
  return invoices
    .filter((i) => i.status === 'draft' || i.status === 'issued')
    .map((i) => ({
      id: i.id,
      number: i.number,
      patient_id: i.patient_id,
      patient_name: i.patient_name,
      issued_at: i.issued_at,
      status: i.status,
      total_cents: i.total_cents,
      paid_cents: paidByInvoice.get(i.id) ?? i.paid_cents ?? 0,
    }))
    .filter((r) => r.total_cents - r.paid_cents > 0)
    .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1))
    .slice(0, 100);
}

export type RecentPayment = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  patient_name: string;
  paid_at: string;
  method: string;
  amount_cents: number;
};

/** Most recent payments with display joins (already joined in snapshot). */
export function recentPayments(
  payments: SyncPaymentRow[],
  limit = 20,
): RecentPayment[] {
  const n = Math.max(1, Math.min(100, Math.floor(limit)));
  return [...payments]
    .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
    .slice(0, n)
    .map((p) => ({
      id: p.id,
      invoice_id: p.invoice_id,
      invoice_number: p.invoice_number,
      patient_name: p.patient_name,
      paid_at: p.paid_at,
      method: p.method,
      amount_cents: p.amount_cents,
    }));
}

/** Calendar week slice (Mon–Sun) with optional dentist filter. */
export function weekSlice(
  rows: ApptRow[],
  weekStart: Date,
  dentistFilter: string,
): ApptRow[] {
  const startMs = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate(),
  ).getTime();
  const endMs = startMs + 7 * 86400_000;
  return rows.filter((a) => {
    const t = Date.parse(a.starts_at);
    if (!Number.isFinite(t) || t < startMs || t >= endMs) return false;
    return dentistFilter === 'all' || a.dentist_id === dentistFilter;
  });
}
