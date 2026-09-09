'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/navigation';
import { AttendSheet } from '@/components/appointments/attend-sheet';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';
import { updateAppointmentStatus } from '@/server/actions/appointments';
import { useToast } from '@/components/ui/toaster';
import { useDeltaRows } from '@/lib/store/snapshots';
import { runSync, useAutoSync } from '@/lib/store/sync';
import {
  doctorQueue,
  doctorToday,
  doctorNextUpcoming,
  type PanelItem,
  type NextUpcomingItem,
} from '@/lib/store/projections';
import type { PanelAppt } from '@/server/actions/dashboard';
import { PanelApptCard } from './panel-appt-card';

type Translate = ReturnType<typeof useTranslations>;

/** Clinic-locale weekday name (e.g. "Monday" / "lunes"). */
function weekdayName(weekday: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`2026-01-${String(weekday + 4).padStart(2, '0')}T00:00:00Z`));
}

/** Clinic-locale short date (e.g. "12 sep" / "Sep 12"). */
function shortDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${dateStr}T00:00:00Z`));
}

/** Human duration for "in 90 minutes / 2 hours" style copy. */
function durationLabel(
  t: Translate,
  minutes: number,
): string {
  if (minutes < 75) return t('inOneHour');
  if (minutes < 150) return t('inNinetyMinutes');
  if (minutes < 210) return t('inTwoHours');
  return t('inHours', { n: Math.round(minutes / 60) });
}

/** Headline for the smart empty state, from the soonest upcoming appt. */
function headlineLabel(
  t: Translate,
  locale: string,
  u: NextUpcomingItem,
): string {
  if (u.days_until === 0)
    return t('nextUpcomingToday', { duration: durationLabel(t, u.minutes_until) });
  if (u.days_until === 1)
    return t('nextUpcomingTomorrow', { time: u.appt.start_hhmm });
  if (u.week_delta === 0)
    return t('nextUpcomingDay', {
      weekday: weekdayName(u.weekday, locale),
      time: u.appt.start_hhmm,
    });
  if (u.week_delta === 1)
    return t('nextUpcomingNextWeek', { weekday: weekdayName(u.weekday, locale) });
  return t('nextUpcomingLater', {
    date: shortDate(u.appt.clinic_date, locale),
    time: u.appt.start_hhmm,
  });
}

/** Grouped day header for the smart empty state (one per clinic day). */
function dayHeaderLabel(
  t: Translate,
  locale: string,
  u: NextUpcomingItem,
): string {
  if (u.days_until === 0) return t('dayToday');
  if (u.days_until === 1) return t('dayTomorrow');
  if (u.week_delta === 0)
    return t('dayDay', { weekday: weekdayName(u.weekday, locale) });
  if (u.week_delta === 1)
    return t('dayNextWeek', { weekday: weekdayName(u.weekday, locale) });
  return t('dayDate', { date: shortDate(u.appt.clinic_date, locale) });
}

/** Group upcoming appts into contiguous same-day clusters. */
function groupByDay(
  t: Translate,
  locale: string,
  upcoming: NextUpcomingItem[],
): { date: string; label: string; items: NextUpcomingItem[] }[] {
  const groups: { date: string; label: string; items: NextUpcomingItem[] }[] = [];
  for (const u of upcoming) {
    const last = groups[groups.length - 1];
    if (last && last.date === u.appt.clinic_date) {
      last.items.push(u);
    } else {
      groups.push({
        date: u.appt.clinic_date,
        label: dayHeaderLabel(t, locale, u),
        items: [u],
      });
    }
  }
  return groups;
}

/** Dentist panel: next-hour queue, attend flow, give new turns. */
export function DoctorPanel({
  dentist,
  clinicTz,
}: {
  dentist: { id: string; name: string; slot_minutes?: number | null };
  clinicTz: string;
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  // All data comes from the offline-first store (5-min delta sync, zero
  // per-poll server actions). Panels are pure projections over snapshots.
  const apptRows = useDeltaRows('appointments');
  useAutoSync();
  const [attendAppt, setAttendAppt] = useState<PanelAppt | null>(null);
  const [armingNoShow, setArmingNoShow] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { push } = useToast();

  const { items, today, nowHhmm, nextUpcoming } = useMemo(() => {
    const q = doctorQueue(apptRows, clinicTz, dentist.id);
    const td = doctorToday(apptRows, clinicTz, dentist.id);
    const nx = doctorNextUpcoming(apptRows, clinicTz, dentist.id);
    return { items: q, today: td.items, nowHhmm: td.now_hhmm, nextUpcoming: nx };
  }, [apptRows, clinicTz, dentist.id]);

  const load = useCallback(() => {
    // Refresh from the server after a write (one delta sync, not N actions).
    void runSync();
  }, []);

  useEffect(() => {
    // First paint: resolve loading once the initial sync lands.
    void runSync().finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile the open AttendSheet with fresh rows so its status
  // stepper never works off a stale snapshot.
  useEffect(() => {
    setAttendAppt((prev) => {
      if (!prev) return prev;
      const all: PanelItem[] = [...items, ...today];
      return (all.find((r) => r.id === prev.id) as PanelAppt | undefined) ?? prev;
    });
  }, [items, today]);

  async function markNoShow(id: string) {
    if (armingNoShow !== id) {
      setArmingNoShow(id);
      return;
    }
    setArmingNoShow(null);
    const res = await updateAppointmentStatus(id, 'no_show').catch(() => null);
    if (!res || 'error' in res) {
      push({ title: t('noShowError'), variant: 'destructive' });
      return;
    }
    push({ title: t('markedNoShow'), variant: 'success' });
    load();
  }

  const activeOverdue = (a: PanelAppt) =>
    (a.status === 'scheduled' || a.status === 'arrived') &&
    new Date(a.starts_at).getTime() <= Date.now();

  const now = Date.now();
  const future = today.filter((a) => Date.parse(a.starts_at) > now);
  const past = today.filter((a) => Date.parse(a.starts_at) <= now);

  const renderTodayCard = (a: PanelAppt) => (
    <PanelApptCard
      key={a.id}
      appt={a}
      onAttend={setAttendAppt}
      onPhoneUpdated={load}
      statusAccent
      extra={
        activeOverdue(a) ? (
          <div className="mt-1">
            <Button
              size="sm"
              variant={armingNoShow === a.id ? 'destructive' : 'outline'}
              onClick={() => markNoShow(a.id)}
              data-testid="panel-mark-noshow"
              className="min-h-[44px]"
            >
              {armingNoShow === a.id ? t('confirmNoShow') : t('markNoShow')}
            </Button>
          </div>
        ) : null
      }
    />
  );

  return (
    <div className="space-y-4" data-testid="doctor-panel">
      {/* Hidden on mobile: the bottom-toolbar + opens this same flow. */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Button
          size="lg"
          onClick={() => setAddOpen(true)}
          className="min-h-[48px]"
          data-testid="panel-add-turn"
        >
          <CalendarPlus className="mr-2 h-5 w-5" />
          {t('addTurn')}
        </Button>
      </div>

      <section aria-label={t('nextHour')}>
        <h2 className="mb-2 text-lg font-semibold">{t('nextHour')}</h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : items.length === 0 ? (
          nextUpcoming && nextUpcoming.length > 0 ? (
            <div
              className="rounded-xl border bg-card p-4"
              data-testid="panel-empty"
            >
              <p className="text-sm font-medium">
                {headlineLabel(t, locale, nextUpcoming[0])}
              </p>
              <ul className="mt-3 space-y-3">
                {groupByDay(t, locale, nextUpcoming).map((g) => (
                  <li key={g.date} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </span>
                <ul className="space-y-2">
                  {g.items.map((u) => (
                    <PanelApptCard
                      key={u.appt.id}
                      appt={u.appt}
                      onAttend={setAttendAppt}
                      onPhoneUpdated={load}
                    />
                  ))}
                </ul>
                  </li>
                ))}
              </ul>
              <Link
                href="/appointments"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('viewAll')}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <p
              className="rounded-xl border p-4 text-sm text-muted-foreground"
              data-testid="panel-empty"
            >
              {t('emptyQueue')}
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <PanelApptCard
                key={a.id}
                appt={a}
                onAttend={setAttendAppt}
                onPhoneUpdated={load}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('allToday')} data-testid="panel-today">
        <h2 className="mb-2 text-lg font-semibold">{t('allToday')}</h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : today.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            {t('emptyToday')}
          </p>
        ) : (
          <div className="space-y-3">
            {future.length > 0 ? (
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                  {t('upcomingHeader')}
                </h3>
                <ul className="space-y-2">{future.map(renderTodayCard)}</ul>
              </div>
            ) : null}
            <div className="flex items-center gap-3 py-1" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">
                {nowHhmm ? t('nowMarker', { time: nowHhmm }) : t('nowMarkerPlain')}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {past.length > 0 ? (
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                  {t('pastHeader')}
                </h3>
                <ul className="space-y-2">{past.map(renderTodayCard)}</ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <AttendSheet
        appointment={attendAppt}
        open={!!attendAppt}
        onOpenChange={(b) => {
          if (!b) setAttendAppt(null);
        }}
        onAdvanced={load}
        clinicDate={attendAppt?.clinic_date}
        startHhmm={attendAppt?.start_hhmm}
        onRefresh={load}
      />
      <AddAppointmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultStart={null}
        dentists={[dentist]}
        onCreated={load}
        currentUserId={dentist.id}
        viewerRole="dentist"
        clinicDefaultDuration={dentist.slot_minutes ?? undefined}
      />
    </div>
  );
}
