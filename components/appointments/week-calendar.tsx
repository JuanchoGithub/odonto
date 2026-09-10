'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { addDays, startOfWeek, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  updateAppointment,
  type ApptRow,
  type PendingLinkRow,
} from '@/server/actions/appointments';
import { AppointmentDialog } from './appointment-dialog';
import {
  AddAppointmentDialog,
  type CreatedVia,
} from './add-appointment-dialog';
import { SubscribeCalendarButton } from './subscribe-calendar-button';
import { AttendSheet } from './attend-sheet';
import { TimeGrid } from './time-grid';
import { AppointmentList } from './appointment-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { effectiveExpiryMs } from '@/lib/turn-picker';
import { es, enUS } from 'date-fns/locale';
import { useDeltaRows, upsertRow } from '@/lib/store/snapshots';
import { runSync, useEnsureSeeded, hydrateStore } from '@/lib/store/sync';
import { useWeekWindows, useSchedulesSnapshot } from '@/lib/store/schedules';
import { weekSlice, withClinicClock } from '@/lib/store/projections';
import { wallClock } from '@/lib/store/time';

export type DentistRef = { id: string; name: string; color: string | null; slot_minutes?: number | null };

export function WeekCalendar({
  initial,
  dentists,
  pendingLinks,
  initialWeekStart,
  viewer,
  clinicDefaultDuration,
  clinicTz,
}: {
  initial: ApptRow[];
  dentists: DentistRef[];
  pendingLinks: PendingLinkRow[];
  initialWeekStart?: string;
  /** Current user — dentists see only their own calendar, no filter UI. */
  viewer?: { id: string; role: string };
  /** Clinic-wide fallback default for new-turn duration. */
  clinicDefaultDuration?: number;
  /** Clinic IANA timezone (SSR). Falls back to the schedules snapshot. */
  clinicTz?: string;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const localeStr = useLocale();
  const dateFnsLocale = localeStr.startsWith('en') ? enUS : es;
  const { push } = useToast();

  const [weekStart, setWeekStart] = useState(() => {
    if (initialWeekStart) {
      // 'yyyy-MM-dd' — build a local date from parts; Date(string) would
      // parse as UTC and shift the week in non-UTC timezones.
      const [y, mo, d] = initialWeekStart.split('-').map(Number);
      return new Date(y, mo - 1, d);
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  // Appointments come from the offline-first store (15-min delta sync).
  // The SSR `initial` week seeds first paint; week/filter changes are local.
  // SyncLoop owns the timer; this view seeds-on-empty only (no mount sync).
  const storeRows = useDeltaRows('appointments');
  useEnsureSeeded({ deltas: ['appointments'], snaps: ['schedules'] });
  useEffect(() => {
    hydrateStore({ deltas: { appointments: { watermark: '', rows: initial } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStart, setDialogStart] = useState<string | null>(null);
  const [dialogEnd, setDialogEnd] = useState<string | null>(null);
  const [dialogMethod, setDialogMethod] = useState<CreatedVia>('manual');
  const [editingAppt, setEditingAppt] = useState<ApptRow | null>(null);
  const [attendAppt, setAttendAppt] = useState<ApptRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Dropped-position prefill for the edit dialog when a drag hits a
  // working-hours conflict (user must confirm the manual change).
  const [prefill, setPrefill] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [prefillNonce, setPrefillNonce] = useState(0);
  // Mobile-first: day agenda (list) is the default on small screens, where the
  // 7-day grid (~962px min-width) is unusable. Desktop keeps the calendar.
  const [view, setView] = useState<'calendar' | 'list'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches) {
      return 'list';
    }
    return 'calendar';
  });
  // Dentists always see their own calendar; no doctor filter for them.
  const isDentistViewer = viewer?.role === 'dentist';
  const [dentistFilter, setDentistFilter] = useState<string>(
    isDentistViewer && viewer ? viewer.id : 'all',
  );
  // iPhone calendar subscription is per-dentist: dentists always see their
  // own feed; staff see the feed of the filtered dentist (never "all").
  const subscribeDentistId =
    isDentistViewer && viewer ? viewer.id : dentistFilter !== 'all' ? dentistFilter : null;

  // Working windows come from the synced schedules snapshot (zero
  // invocations): week/filter changes recompute locally. Null = unseeded
  // (render unshaded until the seed sync lands).
  const windowsByDate = useWeekWindows(
    dentistFilter === 'all' ? null : dentistFilter,
    weekStart,
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  // Week slice is a local filter over the cached snapshot — navigating weeks
  // or the dentist filter costs zero function invocations.
  const appts = useMemo(
    () => weekSlice(storeRows, weekStart, 'all'),
    [storeRows, weekStart],
  );
  const filteredRaw =
    dentistFilter === 'all'
      ? appts
      : appts.filter((a) => a.dentist_id === dentistFilter);
  // Clinic wall-clock for WhatsApp + today detection. SSR `clinicTz` wins;
  // schedules snapshot is the offline fallback (same source as shading).
  const schedulesSnap = useSchedulesSnapshot();
  const tz = clinicTz ?? schedulesSnap?.tz ?? 'UTC';
  const todayDate = useMemo(
    () => wallClock(new Date().toISOString(), tz).date,
    [tz],
  );
  // Decorate with clinic-local date/HH:MM so the list cards and AttendSheet
  // never fall back to a UTC slice (store rows are raw deltas).
  const filtered = useMemo(
    () => withClinicClock(filteredRaw, tz),
    [filteredRaw, tz],
  );
  // AttendSheet context: clinic-local fields + same-day flag for the
  // WhatsApp template filter (today-active shows both confirmation + no-show).
  const attendClinicDate = attendAppt
    ? (attendAppt.clinic_date ?? wallClock(attendAppt.starts_at, tz).date)
    : undefined;
  const attendStartHhmm = attendAppt
    ? (attendAppt.start_hhmm ?? wallClock(attendAppt.starts_at, tz).hhmm)
    : undefined;
  const attendIsTodayActive = !!attendAppt
    && (attendAppt.status === 'scheduled'
      || attendAppt.status === 'arrived'
      || attendAppt.status === 'in_chair')
    && !!attendClinicDate
    && attendClinicDate === todayDate;
  const now = Date.now();
  const filteredPending = pendingLinks.filter(
    (l) =>
      effectiveExpiryMs(l) > now &&
      (dentistFilter === 'all' || l.dentist_id === dentistFilter),
  );

  function refresh() {
    // One delta sync after a write (authoritative reconcile), not a refetch.
    void runSync();
  }

  function openCreate(
    start: Date | null,
    end: Date | null = null,
    method: CreatedVia = 'manual',
  ) {
    setEditingAppt(null);
    setDialogStart(start ? start.toISOString() : null);
    setDialogEnd(end ? end.toISOString() : null);
    setDialogMethod(method);
    setDialogOpen(true);
  }

  function openEdit(a: ApptRow, start?: Date | null, end?: Date | null) {
    setEditingAppt(a);
    setPrefill(
      start && end ? { start: start.toISOString(), end: end.toISOString() } : null,
    );
    if (start && end) setPrefillNonce((n) => n + 1);
    setEditOpen(true);
  }

  // Called after a drag (move) or resize (extend) on the grid.
  async function onMoveAppt(appt: ApptRow, start: Date, end: Date) {
    const isoStart = start.toISOString();
    const isoEnd = end.toISOString();
    // Optimistic: move the block in the shared store instantly.
    upsertRow('appointments', { ...appt, starts_at: isoStart, ends_at: isoEnd });
    const fd = new FormData();
    fd.set('id', appt.id);
    fd.set('dentist_id', appt.dentist_id);
    fd.set('starts_at', isoStart);
    fd.set('ends_at', isoEnd);
    fd.set('status', appt.status);
    fd.set('reason', appt.reason ?? '');
    fd.set('notes', appt.notes ?? '');
    const res = await updateAppointment(fd);
    if (res && 'error' in res) {
      // Reconcile against the server (reverts the optimistic move).
      void runSync();
      push({
        title: res.error === 'conflict' ? t('conflict') : tErr('generic'),
        variant: 'destructive',
      });
      // Drags never auto-force-save outside working hours: route the user
      // into the edit dialog pre-filled at the dropped slot to confirm manually.
      if (res.error === 'conflict') {
        openEdit(appt, start, end);
      }
    } else {
      refresh();
    }
  }

  return (
    <Card>
      <CardContent className="p-3 sm:p-6">
        <Tabs value={view} onValueChange={(v) => setView(v as 'calendar' | 'list')}>
        <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="icon"
              data-testid="week-prev"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0 text-center text-xs font-medium sm:flex-none sm:text-sm sm:min-w-[14rem]">
              {format(days[0], 'PP', { locale: dateFnsLocale })} –{' '}
              {format(days[6], 'PP', { locale: dateFnsLocale })}
            </div>
            <Button
              variant="outline"
              size="icon"
              data-testid="week-next"
              onClick={() => setWeekStart((d) => addDays(d, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            >
              {tCommon('date')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDentistViewer ? null : (
              <Select value={dentistFilter} onValueChange={setDentistFilter}>
                <SelectTrigger
                  className="w-full sm:w-[200px]"
                  data-testid="dentist-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allDentists')}</SelectItem>
                  {dentists.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <TabsList>
              <TabsTrigger value="calendar" data-testid="view-calendar">
                {t('viewCalendar')}
              </TabsTrigger>
              <TabsTrigger value="list" data-testid="view-list">
                {t('viewList')}
              </TabsTrigger>
            </TabsList>
            <Button onClick={() => openCreate(null, null, 'manual')}>
              <Plus className="h-4 w-4" />
              {t('new')}
            </Button>
            {subscribeDentistId ? (
              <SubscribeCalendarButton dentistId={subscribeDentistId} />
            ) : null}
          </div>
        </div>
        <TabsContent value="calendar">
          <TimeGrid
            days={days}
            appts={filtered}
            locale={dateFnsLocale}
            windowsByDate={windowsByDate}
            onSlotClick={(d) => openCreate(d, null, 'click')}
            onRangeSelect={(day, fromMin, toMin) => {
              const s = new Date(day);
              s.setHours(Math.floor(fromMin / 60), fromMin % 60, 0, 0);
              const e = new Date(day);
              e.setHours(Math.floor(toMin / 60), toMin % 60, 0, 0);
              openCreate(s, e, 'drag');
            }}
            onOpenAppt={openEdit}
            onMoveAppt={onMoveAppt}
          />
        </TabsContent>
        <TabsContent value="list">
          <AppointmentList
            appts={filtered}
            pending={filteredPending}
            locale={dateFnsLocale}
            labels={{
              date: tCommon('date'),
              time: t('time'),
              patient: t('patient'),
              dentist: t('dentist'),
              status: tCommon('status'),
              empty: t('emptyList'),
              contact: t('contact'),
              pendingTitle: t('pendingLinks'),
              pending: t('status.pending'),
            }}
            statusLabel={(s) => t(`status.${s}`)}
            onOpenAppt={openEdit}
            onAttend={(a) => setAttendAppt(a)}
            onChanged={refresh}
            onCopyLink={(token) => {
              const url = `${window.location.origin}/pick-turn/${token}`;
              navigator.clipboard.writeText(url).catch(() => undefined);
              push({ title: t('linkCopied') });
            }}
          />
        </TabsContent>
        </Tabs>
        <AddAppointmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultStart={dialogStart}
          defaultEnd={dialogEnd}
          startExpanded={dialogStart !== null || dialogEnd !== null}
          createdVia={dialogMethod}
          dentists={dentists}
          onCreated={refresh}
          currentUserId={viewer?.id}
          viewerRole={viewer?.role as any}
          clinicDefaultDuration={clinicDefaultDuration}
        />
        {editingAppt ? (
          <AppointmentDialog
            open={editOpen}
            onOpenChange={(o) => {
              setEditOpen(o);
              if (!o) setPrefill(null);
            }}
            dentists={dentists}
            appointment={editingAppt}
            onCreated={refresh}
            currentUserId={viewer?.id}
            viewerRole={viewer?.role as any}
            prefillStart={prefill?.start}
            prefillEnd={prefill?.end}
            prefillNonce={prefillNonce}
          />
        ) : null}
        <AttendSheet
          appointment={attendAppt}
          open={attendAppt !== null}
          onOpenChange={(o) => {
            if (!o) setAttendAppt(null);
          }}
          onAdvanced={refresh}
          clinicDate={attendClinicDate}
          startHhmm={attendStartHhmm}
          isTodayActive={attendIsTodayActive}
          onRefresh={refresh}
          onEdit={openEdit}
        />
      </CardContent>
    </Card>
  );
}
