'use client';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { addDays, startOfWeek, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus, Share2 } from 'lucide-react';
import {
  updateAppointment,
  getWeekWindowsAction,
  type ApptRow,
  type PendingLinkRow,
} from '@/server/actions/appointments';
import {
  AppointmentDialog,
  type CreatedVia,
} from './appointment-dialog';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import { TimeGrid, type WorkingWindow } from './time-grid';
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

export type DentistRef = { id: string; name: string; color: string | null };

export function WeekCalendar({
  initial,
  dentists,
  pendingLinks,
  initialWeekStart,
  viewer,
}: {
  initial: ApptRow[];
  dentists: DentistRef[];
  pendingLinks: PendingLinkRow[];
  initialWeekStart?: string;
  /** Current user — dentists see only their own calendar, no filter UI. */
  viewer?: { id: string; role: string };
}) {
  const t = useTranslations('appointments');
  const tTp = useTranslations('turnPicker');
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
  const [appts, setAppts] = useState(initial);
  const [windowsByDate, setWindowsByDate] = useState<Record<
    string,
    WorkingWindow[]
  > | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStart, setDialogStart] = useState<string | null>(null);
  const [dialogEnd, setDialogEnd] = useState<string | null>(null);
  const [dialogMethod, setDialogMethod] = useState<CreatedVia>('manual');
  const [editingAppt, setEditingAppt] = useState<ApptRow | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  // Dentists always see their own calendar; no doctor filter for them.
  const isDentistViewer = viewer?.role === 'dentist';
  const [dentistFilter, setDentistFilter] = useState<string>(
    isDentistViewer && viewer ? viewer.id : 'all',
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const filtered =
    dentistFilter === 'all'
      ? appts
      : appts.filter((a) => a.dentist_id === dentistFilter);
  const now = Date.now();
  const filteredPending = pendingLinks.filter(
    (l) =>
      effectiveExpiryMs(l) > now &&
      (dentistFilter === 'all' || l.dentist_id === dentistFilter),
  );

  async function refresh() {
    const params = new URLSearchParams({ start: weekStart.toISOString() });
    const res = await fetch(`/api/appointments?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAppts(data);
    }
  }

  // Refetch appointments + working windows when the week (or filter) changes
  useEffect(() => {
    refresh();
    getWeekWindowsAction(
      dentistFilter === 'all' ? null : dentistFilter,
      weekStart.toISOString(),
    )
      .then((rows) => {
        const m: Record<string, WorkingWindow[]> = {};
        for (const r of rows) m[r.date] = r.windows;
        setWindowsByDate(m);
      })
      .catch(() => setWindowsByDate(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString(), dentistFilter]);

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

  function openEdit(a: ApptRow) {
    setEditingAppt(a);
    setDialogOpen(true);
  }

  // Called after a drag (move) or resize (extend) on the grid.
  async function onMoveAppt(appt: ApptRow, start: Date, end: Date) {
    const snapshot = appts;
    const isoStart = start.toISOString();
    const isoEnd = end.toISOString();
    setAppts((cur) =>
      cur.map((a) =>
        a.id === appt.id
          ? { ...a, starts_at: isoStart, ends_at: isoEnd }
          : a,
      ),
    );
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
      setAppts(snapshot);
      push({
        title: res.error === 'conflict' ? t('conflict') : tErr('generic'),
        variant: 'destructive',
      });
    } else {
      refresh();
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={view} onValueChange={(v) => setView(v as 'calendar' | 'list')}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              data-testid="week-prev"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[14rem] text-center">
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
                  className="w-[200px]"
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
            <Button
              variant="outline"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              {tTp('shareButton')}
            </Button>
            <Button onClick={() => openCreate(null, null, 'manual')}>
              <Plus className="h-4 w-4" />
              {t('new')}
            </Button>
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
            onCopyLink={(token) => {
              const url = `${window.location.origin}/pick-turn/${token}`;
              navigator.clipboard.writeText(url).catch(() => undefined);
              push({ title: t('linkCopied') });
            }}
          />
        </TabsContent>
        </Tabs>
        <AppointmentDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditingAppt(null);
          }}
          defaultStart={dialogStart}
          defaultEnd={dialogEnd}
          createdVia={dialogMethod}
          dentists={dentists}
          appointment={editingAppt}
          onCreated={refresh}
        />
        <GenerateTurnLinkDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          dentists={dentists}
        />
      </CardContent>
    </Card>
  );
}
