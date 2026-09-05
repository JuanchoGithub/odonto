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
  reason: string;
  empty: string;
  addedBy: string;
  method: string;
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
  methodLabel,
}: {
  appts: ApptRow[];
  pending: PendingLinkRow[];
  locale: Locale;
  labels: Labels;
  onOpenAppt: (a: ApptRow) => void;
  onCopyLink: (token: string) => void;
  statusLabel: (s: string) => string;
  methodLabel: (m: string | null) => string;
}) {
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  return (
    <div className="space-y-6">
      {sorted.length > 0 ? (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.date}</TableHead>
                <TableHead>{labels.time}</TableHead>
                <TableHead>{labels.patient}</TableHead>
                <TableHead>{labels.contact}</TableHead>
                <TableHead>{labels.dentist}</TableHead>
                <TableHead>{labels.status}</TableHead>
                <TableHead>{labels.addedBy}</TableHead>
                <TableHead>{labels.method}</TableHead>
                <TableHead>{labels.reason}</TableHead>
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
                    <TableCell>{a.creator_name ?? '—'}</TableCell>
                    <TableCell>{methodLabel(a.created_via)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {a.reason}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {labels.empty}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold mb-2">{labels.pendingTitle}</h3>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.date}</TableHead>
                  <TableHead>{labels.time}</TableHead>
                  <TableHead>{labels.patient}</TableHead>
                  <TableHead>{labels.contact}</TableHead>
                  <TableHead>{labels.dentist}</TableHead>
                  <TableHead>{labels.status}</TableHead>
                  <TableHead>{labels.addedBy}</TableHead>
                  <TableHead>{labels.method}</TableHead>
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
                    <TableCell>{l.creator_name ?? '—'}</TableCell>
                    <TableCell>{methodLabel('shared')}</TableCell>
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
