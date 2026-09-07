'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttendSheet } from '@/components/appointments/attend-sheet';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';
import { updateAppointmentStatus } from '@/server/actions/appointments';
import { useToast } from '@/components/ui/toaster';
import {
  listDoctorQueue,
  listDoctorToday,
  listDoctorNextUpcoming,
  type PanelAppt,
  type NextUpcoming,
} from '@/server/actions/dashboard';
import { PanelApptCard } from './panel-appt-card';
import { usePanelRefresh } from './use-panel-refresh';

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
  u: NextUpcoming,
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

/** Per-card "when" chip for an upcoming appointment. */
function whenLabel(
  t: Translate,
  locale: string,
  u: NextUpcoming,
): string {
  if (u.days_until === 0) return t('whenToday', { time: u.appt.start_hhmm });
  if (u.days_until === 1) return t('whenTomorrow');
  if (u.week_delta === 0)
    return t('whenDay', { weekday: weekdayName(u.weekday, locale) });
  if (u.week_delta === 1)
    return t('whenNextWeek', { weekday: weekdayName(u.weekday, locale) });
  return t('whenDate', { date: shortDate(u.appt.clinic_date, locale) });
}

/** Dentist panel: next-hour queue, attend flow, give new turns. */
export function DoctorPanel({ dentist }: { dentist: { id: string; name: string; slot_minutes?: number | null } }) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [items, setItems] = useState<PanelAppt[]>([]);
  const [today, setToday] = useState<PanelAppt[]>([]);
  const [nextUpcoming, setNextUpcoming] = useState<NextUpcoming[] | null>(null);
  const [attendAppt, setAttendAppt] = useState<PanelAppt | null>(null);
  const [armingNoShow, setArmingNoShow] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    const [queue, todayRows, upcoming] = await Promise.all([
      listDoctorQueue().catch(() => null),
      listDoctorToday().catch(() => null),
      listDoctorNextUpcoming().catch(() => null),
    ]);
    if (upcoming && 'ok' in upcoming) setNextUpcoming(upcoming.next);
    if (queue && 'ok' in queue) {
      setItems(queue.items);
      // Reconcile the open AttendSheet with fresh rows so its status
      // stepper never works off a stale snapshot.
      setAttendAppt((prev) => {
        if (!prev) return prev;
        return (
          queue.items.find((r) => r.id === prev.id) ??
          (todayRows && 'ok' in todayRows
            ? (todayRows.items.find((r) => r.id === prev.id) ?? prev)
            : prev)
        );
      });
    }
    if (todayRows && 'ok' in todayRows) setToday(todayRows.items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePanelRefresh(load);

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

  return (
    <div className="space-y-4" data-testid="doctor-panel">
      <div className="flex flex-wrap items-center gap-2">
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
              <ul className="mt-3 space-y-2">
                {nextUpcoming.map((u) => (
                  <li key={u.appt.id} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {whenLabel(t, locale, u)}
                    </span>
                    <PanelApptCard appt={u.appt} onAttend={setAttendAppt} />
                  </li>
                ))}
              </ul>
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
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('today')} data-testid="panel-today">
        <h2 className="mb-2 text-lg font-semibold">{t('today')}</h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : today.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            {t('emptyToday')}
          </p>
        ) : (
          <ul className="space-y-2">
            {today.map((a) => (
              <PanelApptCard
                key={a.id}
                appt={a}
                onAttend={setAttendAppt}
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
            ))}
          </ul>
        )}
      </section>

      <AttendSheet
        appointment={attendAppt}
        open={!!attendAppt}
        onOpenChange={(b) => {
          if (!b) setAttendAppt(null);
        }}
        onAdvanced={load}
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
