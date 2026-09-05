'use client';
import { format, type Locale } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { dentistColor } from '@/lib/colors';
import type { ApptRow, PendingLinkRow } from '@/server/actions/appointments';

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
}) {
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  return (
    <div className="space-y-6" data-testid="day-agenda">
      {sorted.length > 0 ? (
        <>
          {/* Mobile cards: full-width rows, 64px+ targets, tel: links. */}
          <ul className="space-y-2 md:hidden">
            {sorted.map((a) => {
              const start = new Date(a.starts_at);
              const end = new Date(a.ends_at);
              const attendable =
                !!onAttend &&
                (a.status === 'scheduled' ||
                  a.status === 'arrived' ||
                  a.status === 'in_chair');
              return (
                <li key={a.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="appt-list-row"
                    onClick={() => onOpenAppt(a)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenAppt(a);
                      }
                    }}
                    className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left active:bg-accent"
                  >
                    <span
                      aria-hidden
                      className="h-10 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dentistColor(a.dentist_color, a.dentist_id) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">
                        {a.patient_name}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {format(start, 'EEE d MMM', { locale })} ·{' '}
                        {format(start, 'HH:mm')}–{format(end, 'HH:mm')} · {a.dentist_name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(a.status)} className="shrink-0">
                          {statusLabel(a.status)}
                        </Badge>
                        {a.patient_phone ? (
                          <a
                            href={`tel:${a.patient_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex min-h-[44px] items-center text-sm text-primary hover:underline"
                          >
                            {a.patient_phone}
                          </a>
                        ) : null}
                      </span>
                    </span>
                    {attendable ? (
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
                      <Badge variant={statusVariant(a.status)}>
                        {statusLabel(a.status)}
                      </Badge>
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
              <li key={l.id}>
                <button
                  type="button"
                  data-testid="pending-link-row"
                  onClick={() => onCopyLink(l.token)}
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-dashed bg-card p-3 text-left active:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {l.patient_name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {l.slot_minutes} min · {l.dentist_name}
                    </span>
                  </span>
                  <Badge variant="warning" className="shrink-0">{labels.pending}</Badge>
                </button>
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
                      <Badge variant="warning">{labels.pending}</Badge>
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
