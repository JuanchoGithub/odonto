'use client';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { addDays, startOfWeek, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus, Share2 } from 'lucide-react';
import { updateAppointment, type ApptRow } from '@/server/actions/appointments';
import { AppointmentDialog } from './appointment-dialog';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
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
import { es, enUS } from 'date-fns/locale';

export type DentistRef = { id: string; name: string; color: string | null };

export function WeekCalendar({
  initial,
  dentists,
}: {
  initial: ApptRow[];
  dentists: DentistRef[];
}) {
  const t = useTranslations('appointments');
  const tTp = useTranslations('turnPicker');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const localeStr = useLocale();
  const dateFnsLocale = localeStr.startsWith('en') ? enUS : es;
  const { push } = useToast();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [appts, setAppts] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStart, setDialogStart] = useState<string | null>(null);
  const [editingAppt, setEditingAppt] = useState<ApptRow | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [dentistFilter, setDentistFilter] = useState<string>('all');

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const filtered =
    dentistFilter === 'all'
      ? appts
      : appts.filter((a) => a.dentist_id === dentistFilter);

  async function refresh() {
    const params = new URLSearchParams({ start: weekStart.toISOString() });
    const res = await fetch(`/api/appointments?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAppts(data);
    }
  }

  // Refetch when the visible week changes
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString()]);

  function openCreate(d: Date | null) {
    setEditingAppt(null);
    setDialogStart(d ? d.toISOString() : null);
    setDialogOpen(true);
  }

  function openEdit(a: ApptRow) {
    setEditingAppt(a);
    setDialogOpen(true);
  }

  // Called after a drag (move) or resize (extend) on the grid.
  async function onMoveAppt(appt: ApptRow, start: Date, end: Date) {
    const fmt = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
    const snapshot = appts;
    setAppts((cur) =>
      cur.map((a) =>
        a.id === appt.id
          ? { ...a, starts_at: fmt(start), ends_at: fmt(end) }
          : a,
      ),
    );
    const fd = new FormData();
    fd.set('id', appt.id);
    fd.set('dentist_id', appt.dentist_id);
    fd.set('starts_at', fmt(start));
    fd.set('ends_at', fmt(end));
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
            <Button onClick={() => openCreate(null)}>
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
              onSlotClick={(d) => openCreate(d)}
              onOpenAppt={openEdit}
              onMoveAppt={onMoveAppt}
            />
          </TabsContent>
          <TabsContent value="list">
            <AppointmentList
              appts={filtered}
              locale={dateFnsLocale}
              labels={{
                date: tCommon('date'),
                time: t('time'),
                patient: t('patient'),
                dentist: t('dentist'),
                status: tCommon('status'),
                reason: t('reason'),
                empty: t('emptyList'),
              }}
              statusLabel={(s) => t(`status.${s}`)}
            onOpenAppt={openEdit}
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
