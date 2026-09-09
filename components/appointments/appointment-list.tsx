'use client';
import { useMemo } from 'react';
import { format, type Locale } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Phone, Pencil, Copy, Send, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { revokeTurnPickerLink } from '@/server/actions/turn-picker';
import { waMeUrl } from '@/lib/whatsapp';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WhatsappButton } from '@/components/ui/whatsapp-button';
import { useWhatsapp } from '@/components/whatsapp-provider';
import { dentistColor } from '@/lib/colors';
import { statusAccentBar } from '@/components/dashboard/panel-appt-card';
import type { ApptRow, PendingLinkRow } from '@/server/actions/appointments';

/** True on touch devices (coarse pointer): tap gestures, no hover. */
function useCoarsePointer(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);
}

type Labels = {
  date: string;
  time: string;
  patient: string;
  contact: string;
  dentist: string;
  status: string;
  empty: string;
  pendingTitle: string;
  pending: string;
  call: string;
  edit: string;
};

function statusVariant(s: string) {
  return s === 'completed'
    ? 'success'
    : s === 'cancelled'
      ? 'destructive'
      : s === 'no_show'
        ? 'warning'
        : ('default' as const);
}

/** "Rescheduled ×N" chip shown next to the status badge. */
function ReprogramBadge({ count }: { count: number | null }) {
  const t = useTranslations('appointments');
  if (!count || count < 1) return null;
  return (
    <Badge variant="secondary" className="shrink-0" data-testid="reprogram-badge">
      {t('reprogrammed', { count })}
    </Badge>
  );
}

function ContactCell({
  phone,
  email,
}: {
  phone: string | null;
  email: string | null;
}) {
  if (!phone && !email) return <TableCell>—</TableCell>;
  return (
    <TableCell>
      <div className="leading-tight text-xs whitespace-nowrap">
        {phone ? <div>{phone}</div> : null}
        {email ? <div className="text-muted-foreground">{email}</div> : null}
      </div>
    </TableCell>
  );
}

function DentistCell({
  name,
  color,
  id,
}: {
  name: string;
  color: string | null;
  id: string;
}) {
  return (
    <TableCell>
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: dentistColor(color, id) }}
        />
        {name}
      </span>
    </TableCell>
  );
}

/** Copy / WhatsApp / Revoke actions for a pending shared turn link. */
function PendingLinkActions({
  l,
  onChanged,
}: {
  l: PendingLinkRow;
  onChanged?: () => void;
}) {
  const t = useTranslations('turnPicker');
  const { push } = useToast();
  const { countryCode } = useWhatsapp();
  const url = () => `${window.location.origin}/pick-turn/${l.token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      push({ title: t('copied'), variant: 'success' });
    } catch {
      push({ title: t('copyFailed'), variant: 'destructive' });
    }
  }

  function whatsapp() {
    const msg = t('whatsappMessage', { name: l.patient_name, link: url() });
    // Open a direct chat with the patient when we have their phone; fall back
    // to a generic share picker when the number is unknown.
    const direct = waMeUrl(l.patient_phone, msg, countryCode);
    if (direct) {
      window.open(direct, '_blank');
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  async function revoke() {
    if (!window.confirm(t('revokeConfirm'))) return;
    const res = await revokeTurnPickerLink(l.id);
    if (res.ok) {
      push({ title: t('revoked'), variant: 'success' });
      onChanged?.();
    }
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={copy}
        aria-label={t('copyLink')}
        title={t('copyLink')}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={whatsapp}
        aria-label={t('whatsapp')}
        title={t('whatsapp')}
      >
        <Send className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive"
        onClick={revoke}
        aria-label={t('revoke')}
        title={t('revoke')}
      >
        <Ban className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function AppointmentList({
  appts,
  pending,
  locale,
  labels,
  onOpenAppt,
  onCopyLink,
  statusLabel,
  onAttend,
  attendLabel,
  onChanged,
}: {
  appts: ApptRow[];
  pending: PendingLinkRow[];
  locale: Locale;
  labels: Labels;
  onOpenAppt: (a: ApptRow) => void;
  onCopyLink: (token: string) => void;
  statusLabel: (s: string) => string;
  onAttend?: (a: ApptRow) => void;
  attendLabel?: string;
  /** Called after an inline WhatsApp phone capture so the parent can refresh. */
  onChanged?: () => void;
}) {
  const { countryCode, templates } = useWhatsapp();
  const coarse = useCoarsePointer();
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  return (
    <div className="space-y-6" data-testid="day-agenda">
      {sorted.length > 0 ? (
        <>
{/* Mobile cards: full-width rows, 64px+ targets, tel: links.
              On touch (coarse pointer) tapping an attendable row opens the
              attend sheet directly (one tap); a pencil button keeps the edit
              dialog (reschedule / cancel) reachable. */}
          <ul className="space-y-2 md:hidden">
            {sorted.map((a) => {
              const start = new Date(a.starts_at);
              const end = new Date(a.ends_at);
              const attendable =
                !!onAttend &&
                (a.status === 'scheduled' ||
                  a.status === 'arrived' ||
                  a.status === 'in_chair');
              const tapAttend = coarse && attendable;
              return (
                <li key={a.id}>
                  <div
                    role={tapAttend ? 'button' : undefined}
                    tabIndex={tapAttend ? 0 : undefined}
                    data-testid="appt-list-row"
                    onClick={
                      tapAttend ? () => onAttend!(a) : () => onOpenAppt(a)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (tapAttend) onAttend!(a);
                        else onOpenAppt(a);
                      }
                    }}
                    className={`flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left ${
                      tapAttend ? 'cursor-pointer active:bg-accent' : ''
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-10 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dentistColor(a.dentist_color, a.dentist_id) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-base font-semibold">
                          {a.patient_name}
                        </span>
                        <span className="shrink-0 text-base font-semibold tabular-nums">
                          {format(start, 'HH:mm')}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span
                          aria-hidden
                          className={`h-2 w-2 shrink-0 rounded-full ${statusAccentBar(a.status)}`}
                        />
                        <span className="truncate">
                          {format(start, 'EEE d MMM', { locale })} ·{' '}
                          {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                          {a.dentist_name ? ` · ${a.dentist_name}` : null}
                          {a.reason ? ` · ${a.reason}` : null}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(a.status)} className="shrink-0">
                          {statusLabel(a.status)}
                        </Badge>
                        <ReprogramBadge count={a.reprogram_count} />
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {a.patient_phone ? (
                        <a
                          href={`tel:${a.patient_phone}`}
                          aria-label={`${labels.call} ${a.patient_name}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border active:bg-accent"
                        >
                          <Phone className="h-5 w-5" />
                        </a>
                      ) : null}
                      {a.clinic_date && a.start_hhmm ? (
                        <WhatsappButton
                          patientId={a.patient_id}
                          patientPhone={a.patient_phone}
                          context={{
                            patientName: a.patient_name,
                            clinicDate: a.clinic_date,
                            startHhmm: a.start_hhmm,
                            dentistName: a.dentist_name,
                            reason: a.reason,
                          }}
                          templates={templates}
                          countryCode={countryCode}
                          status={a.status}
                          isFuture={Date.parse(a.starts_at) > Date.now()}
                          variant="icon"
                          stopPropagation
                          onPhoneSaved={onChanged}
                          className="min-h-[36px] min-w-[36px] border-0"
                          testId={`list-whatsapp-${a.id}`}
                        />
                      ) : null}
                      {tapAttend ? (
                        <button
                          type="button"
                          data-testid="appt-edit"
                          aria-label={labels.edit}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAppt(a);
                          }}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border active:bg-accent"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                      ) : null}
                      {attendable && !coarse ? (
                        <button
                          type="button"
                          data-testid="appt-attend"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAttend!(a);
                          }}
                          className="inline-flex min-h-[48px] min-w-[72px] shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
                        >
                          {attendLabel ?? 'Attend'}
                        </button>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border rounded-md overflow-x-auto hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.date}</TableHead>
                <TableHead>{labels.time}</TableHead>
                <TableHead>{labels.patient}</TableHead>
                <TableHead>{labels.contact}</TableHead>
                <TableHead>{labels.dentist}</TableHead>
                <TableHead>{labels.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => {
                const start = new Date(a.starts_at);
                const end = new Date(a.ends_at);
                return (
                  <TableRow
                    key={a.id}
                    data-testid="appt-list-row"
                    className="cursor-pointer"
                    onClick={() => onOpenAppt(a)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {format(start, 'PPP', { locale })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                    </TableCell>
                    <TableCell>{a.patient_name}</TableCell>
                    <ContactCell
                      phone={a.patient_phone}
                      email={a.patient_email}
                    />
                    <DentistCell
                      name={a.dentist_name}
                      color={a.dentist_color}
                      id={a.dentist_id}
                    />
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Badge variant={statusVariant(a.status)}>
                          {statusLabel(a.status)}
                        </Badge>
                        <ReprogramBadge count={a.reprogram_count} />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {labels.empty}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold mb-2">{labels.pendingTitle}</h3>
          <ul className="space-y-2 md:hidden">
            {pending.map((l) => (
              <li
                key={l.id}
                className="flex min-h-[64px] w-full items-center gap-2 rounded-xl border border-dashed bg-card p-2.5 active:bg-accent"
              >
                <button
                  type="button"
                  data-testid="pending-link-row"
                  onClick={() => onCopyLink(l.token)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-0.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {l.patient_name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {l.slot_minutes} min · {l.dentist_name}
                    </span>
                  </span>
                </button>
                <Badge variant="warning" className="shrink-0">{labels.pending}</Badge>
                <PendingLinkActions l={l} onChanged={onChanged} />
              </li>
            ))}
          </ul>
          <div className="border rounded-md overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.date}</TableHead>
                  <TableHead>{labels.time}</TableHead>
                  <TableHead>{labels.patient}</TableHead>
                  <TableHead>{labels.contact}</TableHead>
                  <TableHead>{labels.dentist}</TableHead>
                  <TableHead>{labels.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((l) => (
                  <TableRow
                    key={l.id}
                    data-testid="pending-link-row"
                    className="cursor-pointer"
                    title={labels.pendingTitle}
                    onClick={() => onCopyLink(l.token)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(l.created_at), 'PPP', { locale })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.slot_minutes} min
                    </TableCell>
                    <TableCell>{l.patient_name}</TableCell>
                    <ContactCell
                      phone={l.patient_phone}
                      email={l.patient_email}
                    />
                    <DentistCell
                      name={l.dentist_name}
                      color={l.dentist_color}
                      id={l.dentist_id}
                    />
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">{labels.pending}</Badge>
                        <PendingLinkActions l={l} onChanged={onChanged} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
