'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from '@/lib/navigation';
import {
  updateAppointment,
  deleteAppointment,
  type ApptRow,
} from '@/server/actions/appointments';
import { useToast } from '@/components/ui/toaster';
import { useRouter } from '@/lib/navigation';
import { format } from 'date-fns';
import type { PatientRow } from '@/server/actions/patients';
import { PatientForm } from '@/components/patients/patient-form';
import { createPatientInline } from '@/server/actions/patients';
import type { Role } from '@/lib/schemas/common';
import { WhatsappButton } from '@/components/ui/whatsapp-button';
import { useWhatsapp } from '@/components/whatsapp-provider';

const STATUS_OPTIONS = [
  'scheduled',
  'arrived',
  'in_chair',
  'completed',
  'cancelled',
  'no_show',
] as const;

const TERMINAL_STATUSES = ['completed', 'cancelled', 'no_show'] as const;
function isTerminal(s: string) {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}

const CANCEL_REASONS = [
  'patient_request',
  'dentist_request',
  'no_answer',
  'duplicate',
  'schedule_change',
  'other',
] as const;

const DURATIONS = [15, 30, 45, 60, 90, 120];

// 15-minute start times, 08:00 – 18:45 (mirrors the calendar display window)
const TIME_OPTIONS: string[] = [];
for (let h = 8; h < 19; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

/**
 * Edit-only appointment dialog. Creation lives in AddAppointmentDialog
 * (single "add turn" entry: choice → manual-expand or link, inline).
 */
export function AppointmentDialog({
  open,
  onOpenChange,
  dentists,
  appointment,
  onCreated,
  currentUserId,
  viewerRole,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  dentists: { id: string; name: string; color?: string | null }[];
  appointment: ApptRow;
  onCreated?: () => void;
  /** When viewer is a dentist, the dentist field stays hidden (fixed). */
  currentUserId?: string;
  viewerRole?: Role;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const { push } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<
    { id: string; name: string; phone: string | null; email: string | null }[]
  >([]);
  const [patientId, setPatientId] = useState<string>(appointment.patient_id);
  const [dentistId, setDentistId] = useState<string>(appointment.dentist_id);
  const [status, setStatus] = useState<string>(appointment.status);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(
    appointment.cancel_reason ?? 'patient_request',
  );
  const [reopenArmed, setReopenArmed] = useState(false);
  const pendingFd = useRef<FormData | null>(null);
  const [dateVal, setDateVal] = useState('');
  const [timeVal, setTimeVal] = useState('');
  const [durVal, setDurVal] = useState('30');

  const editing = appointment;

  // Patient display names for the locked header (contact info).
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    fetch('/api/patients?limit=200')
      .then((r) => r.json())
      .then((data) =>
        setPatients(
          data.map((p: PatientRow) => ({
            id: p.id,
            name: `${p.last_name}, ${p.first_name}`,
            phone: p.phone,
            email: p.email,
          })),
        ),
      )
      .catch(() => setPatients([]));
  }, [open]);

  // Reset form state whenever another appointment is opened for edit.
  const prevEditingId = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (prevEditingId.current === editing.id) return;
    prevEditingId.current = editing.id;
    setReopenArmed(false);
    pendingFd.current = null;
    setPatientId(editing.patient_id);
    setDentistId(editing.dentist_id);
    setStatus(editing.status);
    setCancelReason(editing.cancel_reason ?? 'patient_request');
    const s = new Date(editing.starts_at);
    const e = new Date(editing.ends_at);
    setDateVal(format(s, 'yyyy-MM-dd'));
    setTimeVal(format(s, 'HH:mm'));
    const dur = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
    setDurVal(DURATIONS.includes(dur) ? String(dur) : '30');
  }, [open, editing]);

  void currentUserId;

  function buildFd(form: HTMLFormElement): FormData {
    const fd = new FormData(form);
    // Send timezone-aware ISO instants: the naive y-m-d/HH:mm was a source
    // of timezone ambiguity between browser and server.
    const startLocal = new Date(`${dateVal}T${timeVal}:00`);
    const endLocal = new Date(startLocal.getTime() + Number(durVal) * 60000);
    fd.set('starts_at', startLocal.toISOString());
    fd.set('ends_at', endLocal.toISOString());
    fd.set('patient_id', patientId);
    fd.set('dentist_id', dentistId);
    fd.set('status', status);
    if (status === 'cancelled') fd.set('cancel_reason', cancelReason);
    fd.set('id', editing.id);
    return fd;
  }

  async function submitFd(fd: FormData) {
    if (reopenArmed) fd.set('reopen', 'true');
    const res = await updateAppointment(fd);
    if (res && 'error' in res && res.error === 'terminal') {
      // Terminal → active needs an explicit reopen confirmation.
      pendingFd.current = fd;
      setReopenArmed(true);
      return;
    }
    if (res && 'error' in res && res.error === 'conflict') {
      setError(t('conflict'));
      return;
    }
    if (res && 'error' in res && res.error === 'invalid') {
      setError(t('invalid'));
      return;
    }
    if (res && 'error' in res && res.error) {
      setError(tErr('generic'));
      return;
    }
    if (res && 'ok' in res && 'reprogrammed' in res && res.reprogrammed) {
      push({ title: t('rescheduledToast'), variant: 'success' });
    }
    onOpenChange(false);
    if (onCreated) onCreated();
    else router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await submitFd(buildFd(e.currentTarget));
    } catch {
      setError(tErr('generic'));
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmReopen() {
    if (!pendingFd.current) return;
    setError(null);
    setLoading(true);
    try {
      await submitFd(pendingFd.current);
      setReopenArmed(false);
      pendingFd.current = null;
    } catch {
      setError(tErr('generic'));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    setLoading(true);
    setError(null);
    try {
      await deleteAppointment(editing.id, cancelReason);
      onOpenChange(false);
      push({ title: tCommon('deleted'), variant: 'default' });
      if (onCreated) onCreated();
      else router.refresh();
    } catch {
      setError(tErr('generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {t('edit')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('patient')}</Label>
                <Link
                  href={`/patients/${editing.patient_id}`}
                  className="text-xs text-primary hover:underline"
                >
                  {t('viewPatient')}
                </Link>
              </div>
              <div
                data-testid="appt-patient-locked"
                className="flex min-h-[48px] w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-base sm:text-sm"
              >
                <span className="truncate">
                  {patients.find((p) => p.id === patientId)?.name ??
                    editing.patient_name}
                </span>
              </div>
              {patientId ? (
                <PatientContact
                  patients={patients}
                  patientId={patientId}
                  clinicDate={editing.clinic_date}
                  startHhmm={editing.start_hhmm}
                  status={editing.status}
                  isFuture={Date.parse(editing.starts_at) > Date.now()}
                  dentistName={editing.dentist_name}
                  reason={editing.reason}
                />
              ) : null}
            </div>
            {/* Dentists never change the professional on edit — hidden entirely. */}
            {viewerRole === 'dentist' ? null : (
              <div className="space-y-2">
                <Label htmlFor="dentist_id">{t('dentist')}</Label>
                <Select
                  name="dentist_id"
                  value={dentistId}
                  onValueChange={setDentistId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dentists.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div
              className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5"
              data-testid="appt-origin"
            >
              <div>
                <span className="text-muted-foreground">{t('addedBy')}: </span>
                {editing.creator_name ?? '—'}
                <span className="text-muted-foreground">
                  {' '}
                  · {t('methodTitle')}:{' '}
                </span>
                {editing.created_via
                  ? (t.has(`method.${editing.created_via}`)
                      ? t(`method.${editing.created_via}`)
                      : editing.created_via)
                  : '—'}
              </div>
              {(editing.reprogram_count ?? 0) > 0 ? (
                <div data-testid="appt-reprogram">
                  <span className="font-medium">
                    {t('reprogrammed', { count: editing.reprogram_count })}
                  </span>
                  {editing.original_starts_at ? (
                    <span className="text-muted-foreground">
                      {' '}
                      · {t('originalDate', {
                        date: format(new Date(editing.original_starts_at), 'Pp'),
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{tCommon('status')}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="appt-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {status === 'cancelled' ? (
                <div className="space-y-1">
                  <Label htmlFor="cancel_reason">{t('cancelReasonLabel')}</Label>
                  <Select value={cancelReason} onValueChange={setCancelReason}>
                    <SelectTrigger data-testid="appt-cancel-reason">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CANCEL_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`cancelReason.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {isTerminal(editing.status) && !isTerminal(status) ? (
                <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="reopen-notice">
                  {t('reopenNotice', { status: t(`status.${editing.status}`) })}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
              <div className="space-y-2">
                <Label htmlFor="appt_date">{tCommon('date')}</Label>
                <Input
                  id="appt_date"
                  name="appt_date"
                  type="date"
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('startTime')}</Label>
                <Select value={timeVal} onValueChange={setTimeVal} name="appt_start_time">
                  <SelectTrigger data-testid="appt-start-time">
                    <SelectValue placeholder={t('startTime')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {TIME_OPTIONS.map((hm) => (
                      <SelectItem key={hm} value={hm}>
                        {hm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('duration')}</Label>
                <Select value={durVal} onValueChange={setDurVal}>
                  <SelectTrigger data-testid="appt-duration">
                    <SelectValue placeholder={`${durVal} min`} />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">{t('reason')}</Label>
              <Input id="reason" name="reason" defaultValue={editing.reason ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{tCommon('notes')}</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={editing.notes ?? ''} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {reopenArmed ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
                data-testid="reopen-confirm"
              >
                <span className="flex-1 text-xs text-amber-800 dark:text-amber-200">
                  {t('reopenNotice', {
                    status: t(`status.${editing.status}`),
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReopenArmed(false);
                    pendingFd.current = null;
                  }}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  onClick={onConfirmReopen}
                  data-testid="reopen-confirm-btn"
                >
                  {t('reopenConfirm')}
                </Button>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2">
                {confirmDelete ? (
                  <>
                    <Select
                      value={cancelReason}
                      onValueChange={setCancelReason}
                    >
                      <SelectTrigger
                        data-testid="appt-delete-reason"
                        className="h-9 w-full max-w-[180px]"
                        title={t('cancelReasonLabel')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CANCEL_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(`cancelReason.${r}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={onDelete}
                      disabled={loading}
                      data-testid="appt-delete-confirm"
                    >
                      {tCommon('delete')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      {tCommon('cancel')}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={loading}
                    onClick={() => setConfirmDelete(true)}
                    title={tCommon('delete')}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  {tCommon('cancel')}
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading}>
                {loading ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PatientContact({
  patients,
  patientId,
  clinicDate,
  startHhmm,
  status,
  isFuture,
  dentistName,
  reason,
}: {
  patients: { id: string; name: string; phone: string | null; email: string | null }[];
  patientId: string;
  clinicDate?: string;
  startHhmm?: string;
  status?: string;
  isFuture?: boolean;
  dentistName?: string | null;
  reason?: string | null;
}) {
  const { countryCode, templates } = useWhatsapp();
  const p = patients.find((x) => x.id === patientId);
  if (!p || (!p.phone && !p.email)) return null;
  return (
    <div
      data-testid="patient-contact"
      className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        {p.phone ? (
          <a
            href={`tel:${p.phone}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
            data-testid="patient-contact-call"
          >
            <Phone className="h-3.5 w-3.5" />
            {p.phone}
          </a>
        ) : null}
        {p.email ? (
          <a
            href={`mailto:${p.email}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
            data-testid="patient-contact-mail"
          >
            <Mail className="h-3.5 w-3.5" />
            {p.email}
          </a>
        ) : null}
        {clinicDate && startHhmm ? (
          <WhatsappButton
            patientId={p.id}
            patientPhone={p.phone}
            context={{
              patientName: p.name,
              clinicDate,
              startHhmm,
              dentistName,
              reason,
            }}
            templates={templates}
            countryCode={countryCode}
            status={status ?? 'scheduled'}
            isFuture={isFuture ?? false}
            variant="icon"
            className="min-h-[32px] min-w-[32px] border-0"
            testId={`patient-contact-whatsapp-${p.id}`}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Shared inline "new patient" intake (full form, no redirect). */
export function NewPatientFullDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: (p: PatientRow) => void;
}) {
  const t = useTranslations('patientOnboarding');
  const tCommon = useTranslations('common');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-3xl sm:max-h-[95vh]">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{t('title')}</Dialog.Title>
              <p className="text-xs text-muted-foreground mt-1">{t('fullFormNotice')}</p>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <PatientForm
            mode="full"
            action={async (_prev, fd) => {
              const res = await createPatientInline({}, fd);
              if (res.ok) {
                onCreated(res.patient);
                return { ok: true };
              }
              return { error: res.error };
            }}
          />
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
