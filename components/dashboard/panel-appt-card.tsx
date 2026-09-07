'use client';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dentistColor } from '@/lib/colors';
import type { PanelAppt } from '@/server/actions/dashboard';

/** Status accent colors for the left bar when `statusAccent` is on. */
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
 * Compact queue card shared by the role panels. Times come from the
 * server in clinic wall-clock (never browser TZ).
 */
export function PanelApptCard({
  appt,
  showDentist = false,
  onAttend,
  extra,
  statusAccent = false,
}: {
  appt: PanelAppt;
  showDentist?: boolean;
  onAttend: (a: PanelAppt) => void;
  /** Optional extra action row (e.g. no-show confirm). */
  extra?: React.ReactNode;
  /** Color the left bar by status instead of by dentist. */
  statusAccent?: boolean;
}) {
  const t = useTranslations('appointments');
  return (
    <li
      data-testid="panel-appt-row"
      className="flex min-h-[64px] items-center gap-3 rounded-xl border bg-card p-3"
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
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-semibold">
            {appt.patient_name}
          </span>
          <Badge variant="default" className="shrink-0">
            {t(`status.${appt.status}`)}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          {appt.start_hhmm}–{appt.end_hhmm}
          {showDentist ? ` · ${appt.dentist_name}` : null}
        </div>
        {appt.reason ? (
          <div className="truncate text-sm">{appt.reason}</div>
        ) : null}
        {extra}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {appt.patient_phone ? (
          <a
            href={`tel:${appt.patient_phone}`}
            aria-label={`${t('call')} ${appt.patient_name}`}
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border active:bg-accent"
          >
            <Phone className="h-5 w-5" />
          </a>
        ) : null}
        {appt.status === 'scheduled' ||
        appt.status === 'arrived' ||
        appt.status === 'in_chair' ? (
          <Button
            size="sm"
            onClick={() => onAttend(appt)}
            data-testid="panel-attend"
            className="min-h-[44px]"
          >
            {t('attend')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
