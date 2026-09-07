'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2 } from 'lucide-react';
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
  createAppointment,
  updateAppointment,
  deleteAppointment,
  type ApptRow,
} from '@/server/actions/appointments';
import { useToast } from '@/components/ui/toaster';
import { useRouter } from '@/lib/navigation';
import { format } from 'date-fns';
import { PatientForm } from '@/components/patients/patient-form';
import { createPatientInline, type PatientRow } from '@/server/actions/patients';
import type { PatientOption } from '@/lib/patient-options';
import { PatientCombobox } from '@/components/patients/patient-combobox';
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import { Share2 } from 'lucide-react';
import type { Role } from '@/lib/schemas/common';

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

export type CreatedVia = 'manual' | 'click' | 'drag';

export function AppointmentDialog({
  open,
  onOpenChange,
  defaultStart,
  defaultEnd,
  createdVia = 'manual',
  dentists,
  appointment,
  onCreated,
  currentUserId,
  viewerRole,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultStart: string | null;
  /** Optional pre-selected end (e.g. drag-select on the grid). */
  defaultEnd?: string | null;
  /** How the user started this creation flow; recorded on the appointment. */
  createdVia?: CreatedVia;
  dentists: { id: string; name: string; color?: string | null }[];
  /** When set, the dialog edits this appointment instead of creating. */
  appointment?: ApptRow | null;
  onCreated?: () => void;
  /** When viewer is a dentist, lock dentist_id to this and hide the picker. */
  currentUserId?: string;
  viewerRole?: Role;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const tPi = useTranslations('patientOnboarding');
  const tTp = useTranslations('turnPicker');
  const router = useRouter();
  const { push } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<
    { id: string; name: string; phone: string | null; email: string | null }[]
  >([]);
  const [patientId, setPatientId] = useState<string>('');
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [dentistId, setDentistId] = useState<string>(
    viewerRole === 'dentist' && currentUserId
      ? currentUserId
      : dentists[0]?.id ?? '',
  );
  const [status, setStatus] = useState<string>('scheduled');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>('patient_request');
  const [reopenArmed, setReopenArmed] = useState(false);
  const pendingFd = useRef<FormData | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [dateVal, setDateVal] = useState('');
  const [timeVal, setTimeVal] = useState('');
  const [durVal, setDurVal] = useState('30');

  const editing = appointment ?? null;

  // Load patients each time the dialog opens
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

  // Reset form state when the dialog OPEN/CLOSE cycle changes — NOT when
  // switching between edit/create while open (because the picker may have
  // just chosen a patient).
  const wasOpen = useRef(false);
  const prevEditingId = useRef<string | null>(null);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    const editSwap = open && (editing?.id ?? null) !== prevEditingId.current;
    wasOpen.current = open;
    prevEditingId.current = editing?.id ?? null;
    if (!open) return;
    if (!justOpened && !editSwap) return;
    setReopenArmed(false);
    pendingFd.current = null;
    if (editing) {
      setPatientId(editing.patient_id);
      setDentistId(editing.dentist_id);
      setStatus(editing.status);
      setCancelReason(editing.cancel_reason ?? 'patient_request');
    } else {
      setPatientId('');
      setDentistId(
        viewerRole === 'dentist' && currentUserId
          ? currentUserId
          : dentists[0]?.id ?? '',
      );
      setStatus('scheduled');
      setCancelReason('patient_request');
    }
    const s = editing
      ? new Date(editing.starts_at)
      : defaultStart
        ? new Date(defaultStart)
        : new Date();
    const e = editing
      ? new Date(editing.ends_at)
      : defaultEnd
        ? new Date(defaultEnd)
        : new Date(s.getTime() + 30 * 60000);
    setDateVal(format(s, 'yyyy-MM-dd'));
    setTimeVal(format(s, 'HH:mm'));
    const dur = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
    setDurVal(DURATIONS.includes(dur) ? String(dur) : '30');
  }, [open, editing, dentists, defaultStart, defaultEnd, viewerRole, currentUserId]);

  function buildFd(form: HTMLFormElement): FormData {
    const fd = new FormData(form);
    // Send timezone-aware ISO instants: the naive y-m-d/HH:mm was a source
    // of timezone ambiguity between browser and server.
    const startLocal = new Date(`${dateVal}T${timeVal}:00`);
    const endLocal = new Date(startLocal.getTime() + Number(durVal) * 60000);
    fd.set('starts_at', startLocal.toISOString());
    fd.set('ends_at', endLocal.toISOString());
    fd.set('created_via', createdVia);
    fd.set('patient_id', patientId);
    fd.set('dentist_id', dentistId);
    fd.set('status', status);
    if (status === 'cancelled') fd.set('cancel_reason', cancelReason);
    if (editing) fd.set('id', editing.id);
    return fd;
  }

  async function submitFd(fd: FormData) {
    if (reopenArmed) fd.set('reopen', 'true');
    const res = editing
      ? await updateAppointment(fd)
      : await createAppointment(fd);
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
    if (res && 'error' in res && res.error === 'patient_not_found') {
      setError(t('patientNotFound'));
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
    if (
      editing &&
      res &&
      'ok' in res &&
      'reprogrammed' in res &&
      res.reprogrammed
    ) {
      push({ title: t('rescheduledToast'), variant: 'success' });
    }
    onOpenChange(false);
    if (onCreated) onCreated();
    else router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!patientId) {
      setError(t('patientNotFound'));
      return;
    }
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
    if (!editing) return;
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

  async function onPatientCreated(p: PatientRow) {
    setNewPatientOpen(false);
    // Refetch the full patient so we have the real id (createPatientInline returns id)
    if (p.id) {
      setPatientId(p.id);
      setPatients((list) => [
        ...list,
        {
          id: p.id,
          name: `${p.last_name}, ${p.first_name}`,
          phone: p.phone,
          email: p.email,
        },
      ]);
      return;
    }
    // Fallback: search by name+lastname via the API
    try {
      const r = await fetch(
        `/api/patients?q=${encodeURIComponent(p.last_name)}`,
      );
      const list: PatientRow[] = await r.json();
      const match = list.find(
        (x) => x.first_name === p.first_name && x.last_name === p.last_name,
      );
      if (match) {
        setPatientId(match.id);
        setPatients((prev) => [
          ...prev,
          {
            id: match.id,
            name: `${match.last_name}, ${match.first_name}`,
            phone: match.phone,
            email: match.email,
          },
        ]);
      }
    } catch {
      /* ignore */
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
              {editing ? t('edit') : t('new')}
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
                {editing ? (
                  <Link
                    href={`/patients/${editing.patient_id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('viewPatient')}
                  </Link>
                ) : null}
              </div>
              {editing ? (
                <div
                  data-testid="appt-patient-locked"
                  className="flex min-h-[48px] w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-base sm:text-sm"
                >
                  <span className="truncate">
                    {patients.find((p) => p.id === patientId)?.name ??
                      editing.patient_name}
                  </span>
                </div>
              ) : (
                <PatientPicker
                  patients={patients}
                  value={patientId}
                  onChange={(id, opt) => {
                    setPatientId(id);
                    // Keep the picked patient's contact info available even if
                    // it isn't part of the prefetched list (e.g. found by phone).
                    if (opt) {
                      setPatients((list) =>
                        list.some((x) => x.id === id) ? list : [...list, opt],
                      );
                    }
                  }}
                  onCreateNew={() => setNewPatientOpen(true)}
                />
              )}
              {patientId ? <PatientContact patients={patients} patientId={patientId} /> : null}
            </div>
            {viewerRole === 'dentist' ? (
              <div className="space-y-2">
                <Label htmlFor="dentist_id">{t('dentist')}</Label>
                <div
                  data-testid="appt-dentist-locked"
                  className="flex min-h-[48px] w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-base sm:text-sm"
                >
                  <span className="truncate">
                    {dentists.find((d) => d.id === dentistId)?.name ?? '—'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="dentist_id">{t('dentist')}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!patientId}
                    onClick={() => setShareOpen(true)}
                    title={tTp('shareButton')}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {tTp('shareButton')}
                  </Button>
                </div>
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
            {editing ? (
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
            ) : null}
            {editing ? (
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
            ) : null}
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
              <Input id="reason" name="reason" defaultValue={editing?.reason ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{tCommon('notes')}</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ''} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {reopenArmed ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
                data-testid="reopen-confirm"
              >
                <span className="flex-1 text-xs text-amber-800 dark:text-amber-200">
                  {t('reopenNotice', {
                    status: editing ? t(`status.${editing.status}`) : '',
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
              {editing ? (
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
              ) : (
                <div className="flex-1" />
              )}
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  {tCommon('cancel')}
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading || !patientId}>
                {loading ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>

      <NewPatientFullDialog
        open={newPatientOpen}
        onOpenChange={setNewPatientOpen}
        onCreated={onPatientCreated}
      />

      {patientId ? (
        <GenerateTurnLinkDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          patientId={patientId}
          dentists={dentists}
          defaultDentistId={dentistId}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
        />
      ) : null}
    </Dialog.Root>
  );
}

function PatientContact({
  patients,
  patientId,
}: {
  patients: { id: string; name: string; phone: string | null; email: string | null }[];
  patientId: string;
}) {
  const p = patients.find((x) => x.id === patientId);
  if (!p || (!p.phone && !p.email)) return null;
  return (
    <div
      data-testid="patient-contact"
      className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5"
    >
      {p.phone ? <div>{p.phone}</div> : null}
      {p.email ? <div className="text-muted-foreground">{p.email}</div> : null}
    </div>
  );
}

function PatientPicker({
  patients,
  value,
  onChange,
  onCreateNew,
}: {
  patients: PatientOption[];
  value: string;
  onChange: (id: string, opt?: PatientOption) => void;
  onCreateNew: () => void;
}) {
  // The selected patient may not be in the current result page, so fall
  // back to the parent's prefetched list for the display name.
  const selectedName = patients.find((p) => p.id === value)?.name ?? null;

  return (
    <PatientCombobox
      value={value}
      onChange={onChange}
      onCreateNew={onCreateNew}
      selectedName={selectedName}
      inputTestId="appt-patient-input"
      listTestId="appt-patient-list"
      optionTestId="appt-patient-option"
    />
  );
}

function NewPatientFullDialog({
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
            // mode="full": the inline flow shows ALL sections (general +
            // medical) as one stacked form. The patient gets a complete
            // intake without having to switch tabs.
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
