'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/navigation';
import { formatMoney } from '@/lib/format';
import type { Currency, AppLocale } from '@/lib/schemas/common';
import { AttendSheet } from '@/components/appointments/attend-sheet';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import { updateAppointmentStatus } from '@/server/actions/appointments';
import {
  listSecretarySchedule,
  listFollowUps,
  listPanelUnpaid,
  listPanelRecentPayments,
  type PanelAppt,
  type SecretarySchedule,
  type FollowUps,
  type PanelUnpaidInvoice,
  type PanelPayment,
} from '@/server/actions/dashboard';
import { useToast } from '@/components/ui/toaster';
import { PanelApptCard } from './panel-appt-card';
import { usePanelRefresh } from './use-panel-refresh';

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
}: {
  dentists: { id: string; name: string }[];
  currency: string;
  locale: string;
}) {
  const t = useTranslations('dashboard');
  const tBilling = useTranslations('billing');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  const [schedule, setSchedule] = useState<SecretarySchedule | null>(null);
  const [followUps, setFollowUps] = useState<FollowUps | null>(null);
  const [unpaid, setUnpaid] = useState<PanelUnpaidInvoice[]>([]);
  const [recentPayments, setRecentPayments] = useState<PanelPayment[]>([]);
  const [attendAppt, setAttendAppt] = useState<PanelAppt | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [armingNoShow, setArmingNoShow] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [sched, fups, unp, pays] = await Promise.all([
      listSecretarySchedule().catch(() => null),
      listFollowUps().catch(() => null),
      listPanelUnpaid().catch(() => null),
      listPanelRecentPayments().catch(() => null),
    ]);
    if (sched && 'ok' in sched) setSchedule(sched.schedule);
    if (fups && 'ok' in fups) setFollowUps(fups.followUps);
    if (unp && 'ok' in unp) setUnpaid(unp.items);
    if (pays && 'ok' in pays) setRecentPayments(pays.items);
    setAttendAppt((prev) => {
      if (!prev) return prev;
      const all = [
        ...(sched && 'ok' in sched
          ? [...sched.schedule.today, ...sched.schedule.restOfWeek.flatMap((g) => g.items)]
          : []),
        ...(fups && 'ok' in fups
          ? [...fups.followUps.late, ...fups.followUps.noShow, ...fups.followUps.notCompleted]
          : []),
      ];
      return all.find((r) => r.id === prev.id) ?? prev;
    });
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
      push({ title: tErr('generic'), variant: 'destructive' });
      return;
    }
    push({ title: t('markedNoShow'), variant: 'success' });
    load();
  }

  const money = (cents: number) =>
    formatMoney(cents, currency as Currency, locale as AppLocale);

  return (
    <div className="space-y-6" data-testid="secretary-panel">
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
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {followUps ? (
        <section aria-label={t('followUps')} data-testid="panel-followups">
          <h2 className="mb-2 text-lg font-semibold">{t('followUps')}</h2>
          <div className="space-y-4">
            <FollowUpGroup
              title={t('late')}
              testid="panel-followup-late"
              empty={t('emptyFollowUp')}
              items={followUps.late}
              onAttend={setAttendAppt}
            />
            <FollowUpGroup
              title={t('noShow')}
              testid="panel-followup-noshow"
              empty={t('emptyFollowUp')}
              items={followUps.noShow}
              onAttend={setAttendAppt}
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
              items={followUps.notCompleted}
              onAttend={setAttendAppt}
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
        {recentPayments.length > 0 ? (
          <div className="mt-3">
            <h3 className="mb-1 text-sm font-medium text-muted-foreground">
              {t('recentPayments')}
            </h3>
            <ul className="space-y-2">
              {recentPayments.map((p) => (
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
      />
      <GenerateTurnLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        dentists={dentists}
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
  extra,
}: {
  title: string;
  testid: string;
  empty: string;
  items: PanelAppt[];
  onAttend: (a: PanelAppt) => void;
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
              extra={extra ? extra(a) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
