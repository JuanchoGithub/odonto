'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { addDays, startOfWeek, format, isSameDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus, Share2 } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { createAppointment, type ApptRow } from '@/server/actions/appointments';
import { AppointmentDialog } from './appointment-dialog';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import { Badge } from '@/components/ui/badge';
import { es, enUS } from 'date-fns/locale';

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 - 18:00

export function WeekCalendar({
  initial,
  dentists,
}: {
  initial: ApptRow[];
  dentists: { id: string; name: string }[];
}) {
  const t = useTranslations('appointments');
  const tTp = useTranslations('turnPicker');
  const tCommon = useTranslations('common');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [appts, setAppts] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStart, setDialogStart] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [, startTransition] = useTransition();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateFnsLocale = weekStart.getDay() === 0 ? enUS : es;

  async function refresh() {
    const params = new URLSearchParams({ start: weekStart.toISOString() });
    const res = await fetch(`/api/appointments?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAppts(data);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-4 w-4" />
              {tTp('shareButton')}
            </Button>
            <Button
              onClick={() => {
                setDialogStart(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('new')}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] border rounded-md">
            <div className="bg-muted/30 border-b border-r" />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="bg-muted/30 border-b border-r last:border-r-0 p-2 text-xs font-medium text-center"
              >
                <div>{format(d, 'EEE', { locale: dateFnsLocale })}</div>
                <div className="text-base">{format(d, 'd')}</div>
              </div>
            ))}
            {HOURS.map((h) => (
              <FragmentRow
                key={h}
                hour={h}
                days={days}
                appts={appts}
                onCellClick={(d) => {
                  const start = new Date(d);
                  start.setHours(h, 0, 0, 0);
                  setDialogStart(start.toISOString());
                  setDialogOpen(true);
                }}
                locale={dateFnsLocale}
                t={t}
              />
            ))}
          </div>
        </div>
        <AppointmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultStart={dialogStart}
          dentists={dentists}
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

function FragmentRow({
  hour,
  days,
  appts,
  onCellClick,
  locale,
  t,
}: {
  hour: number;
  days: Date[];
  appts: ApptRow[];
  onCellClick: (d: Date) => void;
  locale: typeof es;
  t: ReturnType<typeof useTranslations<'appointments'>>;
}) {
  return (
    <>
      <div className="border-b border-r text-xs text-muted-foreground p-1 text-right">
        {String(hour).padStart(2, '0')}:00
      </div>
      {days.map((d) => {
        const dayAppts = appts.filter((a) => {
          const ad = new Date(a.starts_at);
          return isSameDay(ad, d) && ad.getHours() === hour;
        });
        return (
          <button
            key={d.toISOString() + hour}
            type="button"
            onClick={() => onCellClick(d)}
            className="border-b border-r last:border-r-0 min-h-[56px] p-1 text-left hover:bg-accent/30 transition-colors"
          >
            {dayAppts.map((a) => (
              <Link
                key={a.id}
                href={`/patients/${a.patient_id}`}
                className="block"
                onClick={(e) => e.stopPropagation()}
              >
                <Badge
                  variant={
                    a.status === 'completed'
                      ? 'success'
                      : a.status === 'cancelled'
                        ? 'destructive'
                        : a.status === 'no_show'
                          ? 'warning'
                          : 'default'
                  }
                  className="w-full justify-start truncate"
                >
                  {format(new Date(a.starts_at), 'HH:mm')} {a.patient_name}
                </Badge>
              </Link>
            ))}
          </button>
        );
      })}
    </>
  );
}
