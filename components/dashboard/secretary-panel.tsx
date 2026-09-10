'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/navigation';
import { formatMoney } from '@/lib/format';
import type { Currency, AppLocale } from '@/lib/schemas/common';
import { AttendSheet } from '@/components/appointments/attend-sheet';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';
import { updateAppointmentStatus } from '@/server/actions/appointments';
import type {
  PanelAppt,
  SecretarySchedule,
  FollowUps,
  PanelUnpaidInvoice,
  PanelPayment,
} from '@/server/actions/dashboard';
import { useToast } from '@/components/ui/toaster';
import { PanelApptCard } from './panel-appt-card';
import { useDeltaRows } from '@/lib/store/snapshots';
import { runSync, useEnsureSeeded } from '@/lib/store/sync';
import {
  secretarySchedule,
  followUps,
  unpaidInvoices,
  recentPayments,
  type PanelItem,
} from '@/lib/store/projections';
import { wallClock } from '@/lib/store/time';

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Receptionist panel: today + rest of week, follow-ups (late / no-show /
 * not completed), give new turns, payments.
 */
export function SecretaryPanel({
  dentists,
  currency,
  locale,
  clinicDefaultDuration,
  clinicTz,
}: {
  dentists: { id: string; name: string; slot_minutes?: number | null }[];
  currency: string;
  locale: string;
  clinicDefaultDuration?: number;
  clinicTz: string;
}) {
  const t = useTranslations('dashboard');
  const tBilling = useTranslations('billing');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  // All data comes from the offline-first store (15-min delta sync, zero
  // per-poll server actions). Panels are pure projections over snapshots.
  // SyncLoop owns the timer; this view seeds-on-empty only (no mount sync).
  const apptRows = useDeltaRows('appointments');
  const invoiceRows = useDeltaRows('invoices');
  const paymentRows = useDeltaRows('payments');
  useEnsureSeeded({ deltas: ['appointments', 'invoices', 'payments'] });
  const [attendAppt, setAttendAppt] = useState<PanelAppt | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [armingNoShow, setArmingNoShow] = useState<string | null>(null);
  const [armingComplete, setArmingComplete] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const schedule: SecretarySchedule = useMemo(
    () => secretarySchedule(apptRows, clinicTz),
    [apptRows, clinicTz],
  );
  const followUpGroups: FollowUps = useMemo(
    () => followUps(apptRows, clinicTz) as unknown as FollowUps,
    [apptRows, clinicTz],
  );
  const unpaid: PanelUnpaidInvoice[] = useMemo(
    () => unpaidInvoices(invoiceRows, paymentRows) as unknown as PanelUnpaidInvoice[],
    [invoiceRows, paymentRows],
  );
  const recentPays: PanelPayment[] = useMemo(
    () => recentPayments(paymentRows) as unknown as PanelPayment[],
    [paymentRows],
  );

  const load = useCallback(() => {
    // Refresh from the server after a write (one delta sync, not N actions).
    void runSync();
  }, []);

  useEffect(() => {
    // First paint resolves from the store (SSR-seeded or sync-seeded).
    // No mount sync: SyncLoop owns the 15-min timer.
    if (apptRows.length > 0 || invoiceRows.length > 0 || paymentRows.length > 0)
      setLoaded(true);
    else {
      const t = setTimeout(() => setLoaded(true), 2500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apptRows.length, invoiceRows.length, paymentRows.length]);

  // Reconcile the open AttendSheet with fresh rows.
  useEffect(() => {
    setAttendAppt((prev) => {
      if (!prev) return prev;
      const all: PanelItem[] = [
        ...schedule.today,
        ...schedule.restOfWeek.flatMap((g) => g.items),
        ...followUpGroups.late,
        ...followUpGroups.noShow,
        ...followUpGroups.notCompleted,
      ];
      return (all.find((r) => r.id === prev.id) as PanelAppt | undefined) ?? prev;
    });
  }, [schedule, followUpGroups]);

  async function markNoShow(id: string) {
    if (armingNoShow !== id) {
      setArmingNoShow(id);
      return;
    }
    setArmingNoShow(null);
    const res = await updateAppointmentStatus(id, 'no_show').catch(() => null);
    if (!res || 'error' in res) {
      push({ title: tErr('generic'), variant: 'destructive' });
      return;
    }
    push({ title: t('markedNoShow'), variant: 'success' });
    load();
  }

  async function confirmAttended(id: string) {
    if (armingComplete !== id) {
      setArmingComplete(id);
      return;
    }
    setArmingComplete(null);
    const res = await updateAppointmentStatus(id, 'completed').catch(() => null);
    if (!res || 'error' in res) {
      push({ title: tErr('generic'), variant: 'destructive' });
      return;
    }
    push({ title: t('markedAttended'), variant: 'success' });
    load();
  }

  const money = (cents: number) =>
    formatMoney(cents, currency as Currency, locale as AppLocale);

  return (
    <div className="space-y-6" data-testid="secretary-panel">
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

      <section aria-label={t('today')}>
        <h2 className="mb-2 text-lg font-semibold">{t('today')}</h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : !schedule || schedule.today.length === 0 ? (
          <p
            className="rounded-xl border p-4 text-sm text-muted-foreground"
            data-testid="panel-empty-today"
          >
            {t('emptyToday')}
          </p>
        ) : (
          <ul className="space-y-2">
            {schedule.today.map((a) => (
              <PanelApptCard
                key={a.id}
                appt={a}
                showDentist
                onAttend={setAttendAppt}
                onPhoneUpdated={load}
              />
            ))}
          </ul>
        )}
      </section>

      {schedule && schedule.restOfWeek.length > 0 ? (
        <section aria-label={t('restOfWeek')}>
          <h2 className="mb-2 text-lg font-semibold">{t('restOfWeek')}</h2>
          <div className="space-y-3">
            {schedule.restOfWeek.map((g) => (
              <div key={g.date}>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                  {dayLabel(g.date)}
                </h3>
                  <ul className="space-y-2">
                    {g.items.map((a) => (
                      <PanelApptCard
                        key={a.id}
                        appt={a}
                        showDentist
                        onAttend={setAttendAppt}
                        onPhoneUpdated={load}
                      />
                    ))}
                  </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loaded ? (
        <section aria-label={t('followUps')} data-testid="panel-followups">
          <h2 className="mb-2 text-lg font-semibold">{t('followUps')}</h2>
          <div className="space-y-4">
            <FollowUpGroup
              title={t('late')}
              testid="panel-followup-late"
              empty={t('emptyFollowUp')}
              items={followUpGroups.late}
              onAttend={setAttendAppt}
              onRefresh={load}
            />
            <FollowUpGroup
              title={t('noShow')}
              testid="panel-followup-noshow"
              empty={t('emptyFollowUp')}
              items={followUpGroups.noShow}
              onAttend={setAttendAppt}
              onRefresh={load}
              extra={(a) => (
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
              )}
            />
            <FollowUpGroup
              title={t('notCompleted')}
              testid="panel-followup-incomplete"
              empty={t('emptyFollowUp')}
              items={followUpGroups.notCompleted}
              onAttend={setAttendAppt}
              onRefresh={load}
              extra={(a) => (
                <div className="mt-1">
                  <Button
                    size="sm"
                    variant={armingComplete === a.id ? 'secondary' : 'outline'}
                    onClick={() => confirmAttended(a.id)}
                    data-testid="panel-mark-attended"
                    className="min-h-[44px]"
                  >
                    {armingComplete === a.id
                      ? t('confirmAttended')
                      : t('markAttended')}
                  </Button>
                </div>
              )}
            />
          </div>
        </section>
      ) : null}

      <section aria-label={t('payments')} data-testid="panel-payments">
        <h2 className="mb-2 text-lg font-semibold">{t('payments')}</h2>
        <h3 className="mb-1 text-sm font-medium text-muted-foreground">
          {t('unpaid')}
        </h3>
        {unpaid.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            {t('emptyUnpaid')}
          </p>
        ) : (
          <ul className="space-y-2">
            {unpaid.map((inv) => (
              <li
                key={inv.id}
                data-testid="panel-unpaid-row"
                className="flex min-h-[64px] items-center gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">
                    {inv.patient_name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    #{inv.number} · {tBilling(`status.${inv.status}`)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-semibold">
                    {money(inv.total_cents - inv.paid_cents)}
                  </div>
                  <Link
                    prefetch={false}
                    href={`/billing/${inv.id}`}
                    className="text-sm text-primary underline"
                  >
                    {t('viewInvoice')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {recentPays.length > 0 ? (
          <div className="mt-3">
            <h3 className="mb-1 text-sm font-medium text-muted-foreground">
              {t('recentPayments')}
            </h3>
            <ul className="space-y-2">
              {recentPays.map((p) => (
                <li
                  key={p.id}
                  data-testid="panel-payment-row"
                  className="flex min-h-[56px] items-center gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.patient_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      #{p.invoice_number} · {p.method}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold">
                    {money(p.amount_cents)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
        isTodayActive={
          !!attendAppt
          && (attendAppt.status === 'scheduled'
            || attendAppt.status === 'arrived'
            || attendAppt.status === 'in_chair')
          && attendAppt.clinic_date
            === wallClock(new Date().toISOString(), clinicTz).date
        }
        onRefresh={load}
      />
      <AddAppointmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultStart={null}
        dentists={dentists}
        onCreated={load}
        clinicDefaultDuration={clinicDefaultDuration}
      />
    </div>
  );
}

function FollowUpGroup({
  title,
  testid,
  empty,
  items,
  onAttend,
  onRefresh,
  extra,
}: {
  title: string;
  testid: string;
  empty: string;
  items: PanelAppt[];
  onAttend: (a: PanelAppt) => void;
  onRefresh?: () => void;
  extra?: (a: PanelAppt) => React.ReactNode;
}) {
  return (
    <div data-testid={testid}>
      <h3 className="mb-1 text-sm font-medium">
        {title} · {items.length}
      </h3>
          {items.length === 0 ? (
            <p className="rounded-xl border p-3 text-sm text-muted-foreground">
              {empty}
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((a) => (
                <PanelApptCard
                  key={a.id}
                  appt={a}
                  showDentist
                  onAttend={onAttend}
                  onPhoneUpdated={onRefresh}
                  extra={extra ? extra(a) : undefined}
                />
              ))}
            </ul>
          )}
    </div>
  );
}
