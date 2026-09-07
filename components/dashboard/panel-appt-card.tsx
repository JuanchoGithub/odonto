'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Phone, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsappButton } from '@/components/ui/whatsapp-button';
import { useWhatsapp } from '@/components/whatsapp-provider';
import { dentistColor } from '@/lib/colors';
import type { PanelAppt } from '@/server/actions/dashboard';

/** True on touch devices (coarse pointer): tap gestures, no hover. */
function useCoarsePointer(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);
}

/** Status accent colors for the left bar / dot when `statusAccent` is on. */
export function statusAccentBar(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'no_show':
    case 'cancelled':
      return 'bg-red-400';
    case 'arrived':
    case 'in_chair':
      return 'bg-amber-500';
    case 'scheduled':
    default:
      return 'bg-sky-500';
  }
}

/**
 * Compact queue card shared by the role panels. Patient + time + actions.
 * Times come from the server in clinic wall-clock (never browser TZ).
 */
export function PanelApptCard({
  appt,
  showDentist = false,
  onAttend,
  onPhoneUpdated,
  extra,
  statusAccent = false,
}: {
  appt: PanelAppt;
  showDentist?: boolean;
  onAttend: (a: PanelAppt) => void;
  /** Called after a missing-phone capture so the parent can refresh. */
  onPhoneUpdated?: () => void;
  /** Optional extra action row (e.g. no-show confirm). */
  extra?: React.ReactNode;
  /** Color the left bar by status instead of by dentist. */
  statusAccent?: boolean;
}) {
  const t = useTranslations('appointments');
  const { countryCode, templates } = useWhatsapp();
  const coarse = useCoarsePointer();
  const active =
    appt.status === 'scheduled' ||
    appt.status === 'arrived' ||
    appt.status === 'in_chair';
  const tappable = coarse && active;
  const isFuture = useMemo(
    () => Date.parse(appt.starts_at) > Date.now(),
    [appt.starts_at],
  );
  return (
    <li
      data-testid="panel-appt-row"
      onClick={tappable ? () => onAttend(appt) : undefined}
      onKeyDown={
        tappable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAttend(appt);
              }
            }
          : undefined
      }
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      className={`flex min-h-[64px] items-center gap-3 rounded-xl border bg-card p-3 ${
        tappable ? 'cursor-pointer active:bg-accent' : ''
      }`}
    >
      <span
        aria-hidden
        className={`h-10 w-1.5 shrink-0 rounded-full ${
          statusAccent ? statusAccentBar(appt.status) : ''
        }`}
        style={
          statusAccent
            ? undefined
            : { backgroundColor: dentistColor(appt.dentist_color, appt.dentist_id) }
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-semibold">
            {appt.patient_name}
          </span>
          <span className="shrink-0 text-base font-semibold tabular-nums">
            {appt.start_hhmm}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <span
            aria-hidden
            title={t(`status.${appt.status}`)}
            className={`h-2 w-2 shrink-0 rounded-full ${statusAccentBar(appt.status)}`}
          />
          <span className="truncate">
            {appt.start_hhmm}–{appt.end_hhmm}
            {showDentist ? ` · ${appt.dentist_name}` : null}
            {appt.reason ? ` · ${appt.reason}` : null}
          </span>
        </div>
        {extra}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {appt.patient_phone ? (
          <a
            href={`tel:${appt.patient_phone}`}
            aria-label={`${t('call')} ${appt.patient_name}`}
            title={`${t('call')} ${appt.patient_name}`}
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border active:bg-accent"
          >
            <Phone className="h-5 w-5" />
          </a>
        ) : null}
        <WhatsappButton
          patientId={appt.patient_id}
          patientPhone={appt.patient_phone}
          context={{
            patientName: appt.patient_name,
            clinicDate: appt.clinic_date,
            startHhmm: appt.start_hhmm,
            dentistName: appt.dentist_name,
            reason: appt.reason,
          }}
          templates={templates}
          countryCode={countryCode}
          dentistId={appt.dentist_id}
          status={appt.status}
          isFuture={isFuture}
          variant="icon"
          stopPropagation
          onPhoneSaved={onPhoneUpdated}
          testId={`panel-whatsapp-${appt.id}`}
        />
        {active && !coarse ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAttend(appt)}
            data-testid="panel-attend"
            className="min-h-[44px] gap-1 px-2.5"
          >
            <Play className="h-4 w-4" />
            {t('attend')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
