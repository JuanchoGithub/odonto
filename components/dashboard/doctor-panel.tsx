'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttendSheet } from '@/components/appointments/attend-sheet';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';
import {
  listDoctorQueue,
  listDoctorAttendedToday,
  type PanelAppt,
} from '@/server/actions/dashboard';
import { PanelApptCard } from './panel-appt-card';
import { usePanelRefresh } from './use-panel-refresh';

/** Dentist panel: next-hour queue, attend flow, give new turns. */
export function DoctorPanel({ dentist }: { dentist: { id: string; name: string } }) {
  const t = useTranslations('dashboard');
  const [items, setItems] = useState<PanelAppt[]>([]);
  const [attended, setAttended] = useState<PanelAppt[]>([]);
  const [attendAppt, setAttendAppt] = useState<PanelAppt | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [queue, done] = await Promise.all([
      listDoctorQueue().catch(() => null),
      listDoctorAttendedToday().catch(() => null),
    ]);
    if (queue && 'ok' in queue) {
      setItems(queue.items);
      // Reconcile the open AttendSheet with fresh rows so its status
      // stepper never works off a stale snapshot.
      setAttendAppt((prev) => {
        if (!prev) return prev;
        return (
          queue.items.find((r) => r.id === prev.id) ??
          (done && 'ok' in done
            ? (done.items.find((r) => r.id === prev.id) ?? prev)
            : prev)
        );
      });
    }
    if (done && 'ok' in done) setAttended(done.items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePanelRefresh(load);

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
          <p
            className="rounded-xl border p-4 text-sm text-muted-foreground"
            data-testid="panel-empty"
          >
            {t('emptyQueue')}
          </p>
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

      <section aria-label={t('attendedToday')} data-testid="panel-attended">
        <h2 className="mb-2 text-lg font-semibold">{t('attendedToday')}</h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : attended.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            {t('emptyAttended')}
          </p>
        ) : (
          <ul className="space-y-2">
            {attended.map((a) => (
              <PanelApptCard
                key={a.id}
                appt={a}
                onAttend={setAttendAppt}
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
      />
    </div>
  );
}
