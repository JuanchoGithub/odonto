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
import type { ApptRow } from '@/server/actions/appointments';

export function AppointmentList({
  appts,
  locale,
  labels,
  onOpenAppt,
  statusLabel,
}: {
  appts: ApptRow[];
  locale: Locale;
  labels: {
    date: string;
    time: string;
    patient: string;
    dentist: string;
    status: string;
    reason: string;
    empty: string;
  };
  onOpenAppt: (a: ApptRow) => void;
  statusLabel: (s: string) => string;
}) {
  if (!appts.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {labels.empty}
      </p>
    );
  }
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{labels.date}</TableHead>
            <TableHead>{labels.time}</TableHead>
            <TableHead>{labels.patient}</TableHead>
            <TableHead>{labels.dentist}</TableHead>
            <TableHead>{labels.status}</TableHead>
            <TableHead>{labels.reason}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => {
            const start = new Date(a.starts_at);
            const end = new Date(a.ends_at);
            const color = dentistColor(a.dentist_color, a.dentist_id);
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
                <TableCell>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {a.dentist_name}
                  </span>
                </TableCell>
                <TableCell>
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
                  >
                    {statusLabel(a.status)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {a.reason}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
