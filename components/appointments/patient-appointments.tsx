'use client';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, type Locale } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dentistColor } from '@/lib/colors';
import { AppointmentDialog } from './appointment-dialog';
import {
  updateAppointmentStatus,
  type ApptRow,
} from '@/server/actions/appointments';
import { useToast } from '@/components/ui/toaster';
import type { Role } from '@/lib/schemas/common';

function statusVariant(s: string) {
  return s === 'completed'
    ? 'success'
    : s === 'cancelled'
      ? 'destructive'
      : s === 'no_show'
        ? 'warning'
        : ('default' as const);
}

export function PatientAppointments({
  patientId,
  dentists,
  currentUserId,
  viewerRole,
}: {
  patientId: string;
  dentists: { id: string; name: string; color?: string | null }[];
  currentUserId?: string;
  viewerRole?: Role;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tDash = useTranslations('dashboard');
  const tErr = useTranslations('errors');
  const localeStr = useLocale();
  const dateFnsLocale: Locale = localeStr.startsWith('en') ? enUS : es;
  const [rows, setRows] = useState<ApptRow[] | null>(null);
  const [editing, setEditing] = useState<ApptRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { push } = useToast();
  const now = Date.now();

  async function refresh() {
    const res = await fetch(`/api/appointments?patient_id=${patientId}`);
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function openEdit(a: ApptRow) {
    setEditing(a);
    setDialogOpen(true);
  }

  // Secondary no-show path: a stale "scheduled" appointment still sitting on
  // the patient page after the auto sweep didn't catch it (or hasn't run yet).
  function NoShowQuickAction({ appt }: { appt: ApptRow }) {
    const overdue =
      appt.status === 'scheduled' &&
      new Date(appt.ends_at).getTime() < now;
    if (!overdue) return null;
    return (
      <button
        type="button"
        data-testid="patient-mark-noshow"
        onClick={async (e) => {
          e.stopPropagation();
          const res = await updateAppointmentStatus(appt.id, 'no_show');
          if ('error' in res) {
            push({ title: tErr('generic'), variant: 'destructive' });
            return;
          }
          push({ title: tDash('markedNoShow'), variant: 'success' });
          refresh();
        }}
        className="inline-flex min-h-[36px] items-center rounded-md border border-amber-500/50 px-2 text-xs font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
      >
        {tDash('markNoShow')}
      </button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {!rows ? (
          <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t('emptyPatient')}
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {rows.map((a) => {
                const start = new Date(a.starts_at);
                const end = new Date(a.ends_at);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      data-testid="patient-appt-row"
                      onClick={() => openEdit(a)}
                      className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left active:bg-accent"
                    >
                      <span
                        aria-hidden
                        className="h-10 w-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: dentistColor(a.dentist_color, a.dentist_id),
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">
                          {format(start, 'PPP', { locale: dateFnsLocale })}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {format(start, 'HH:mm')}–{format(end, 'HH:mm')} · {a.dentist_name}
                        </span>
                        {a.reason ? (
                          <span className="mt-1 block truncate text-sm text-muted-foreground">
                            {a.reason}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant(a.status)} className="shrink-0">
                            {t(`status.${a.status}` as any)}
                          </Badge>
                          {(a.reprogram_count ?? 0) > 0 ? (
                            <Badge variant="secondary" data-testid="reprogram-badge">
                              {t('reprogrammed', { count: a.reprogram_count })}
                            </Badge>
                          ) : null}
                          {a.creator_name ? (
                            <span className="text-xs text-muted-foreground">
                              {t('addedBy')} {a.creator_name}
                            </span>
                          ) : null}
                          <NoShowQuickAction appt={a} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Desktop table */}
            <div className="border rounded-md overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tCommon('date')}</TableHead>
                    <TableHead>{t('time')}</TableHead>
                    <TableHead>{t('dentist')}</TableHead>
                    <TableHead>{t('reason')}</TableHead>
                    <TableHead>{tCommon('status')}</TableHead>
                    <TableHead>{tCommon('actions')}</TableHead>
                    <TableHead>{t('addedBy')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                    const start = new Date(a.starts_at);
                    const end = new Date(a.ends_at);
                    return (
                      <TableRow
                        key={a.id}
                        data-testid="patient-appt-row"
                        className="cursor-pointer"
                        onClick={() => openEdit(a)}
                      >
                        <TableCell className="whitespace-nowrap">
                          {format(start, 'PPP', { locale: dateFnsLocale })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span
                              aria-hidden
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: dentistColor(a.dentist_color, a.dentist_id),
                              }}
                            />
                            {a.dentist_name}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate">
                          {a.reason ?? '—'}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <Badge variant={statusVariant(a.status)}>
                              {t(`status.${a.status}` as any)}
                            </Badge>
                            {(a.reprogram_count ?? 0) > 0 ? (
                              <Badge variant="secondary" data-testid="reprogram-badge">
                                {t('reprogrammed', { count: a.reprogram_count })}
                              </Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <NoShowQuickAction appt={a} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.creator_name ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <AppointmentDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditing(null);
          }}
          defaultStart={null}
          defaultEnd={null}
          createdVia="manual"
          dentists={dentists}
          appointment={editing}
          onCreated={refresh}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
        />
      </CardContent>
    </Card>
  );
}
