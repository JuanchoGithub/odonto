'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttendSheet } from '@/components/appointments/attend-sheet';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import {
  listDoctorQueue,
  type PanelAppt,
} from '@/server/actions/dashboard';
import { PanelApptCard } from './panel-appt-card';
import { usePanelRefresh } from './use-panel-refresh';

/** Dentist panel: next-hour queue, attend flow, give new turns. */
export function DoctorPanel({ dentist }: { dentist: { id: string; name: string } }) {
  const t = useTranslations('dashboard');
  const [items, setItems] = useState<PanelAppt[]>([]);
  const [attendAppt, setAttendAppt] = useState<PanelAppt | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await listDoctorQueue().catch(() => null);
    if (res && 'ok' in res) {
      setItems(res.items);
      // Reconcile the open AttendSheet with fresh rows so its status
      // stepper never works off a stale snapshot.
      setAttendAppt((prev) => {
        if (!prev) return prev;
        return res.items.find((r) => r.id === prev.id) ?? prev;
      });
    }
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
          onClick={() => setShareOpen(true)}
          className="min-h-[48px]"
          data-testid="panel-give-turn"
        >
          <Link2 className="mr-2 h-5 w-5" />
          {t('giveTurn')}
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

      <AttendSheet
        appointment={attendAppt}
        open={!!attendAppt}
        onOpenChange={(b) => {
          if (!b) setAttendAppt(null);
        }}
        onAdvanced={load}
      />
      <GenerateTurnLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dentists={[dentist]}
        defaultDentistId={dentist.id}
      />
    </div>
  );
}
