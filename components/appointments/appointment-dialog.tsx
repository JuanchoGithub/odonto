'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ChevronDown, Check, UserPlus, Trash2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
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
import { GenerateTurnLinkDialog } from '@/components/turn-picker/generate-link-dialog';
import { Share2 } from 'lucide-react';

const STATUS_OPTIONS = [
  'scheduled',
  'arrived',
  'in_chair',
  'completed',
  'cancelled',
  'no_show',
] as const;

export function AppointmentDialog({
  open,
  onOpenChange,
  defaultStart,
  dentists,
  appointment,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultStart: string | null;
  dentists: { id: string; name: string }[];
  /** When set, the dialog edits this appointment instead of creating. */
  appointment?: ApptRow | null;
  onCreated?: () => void;
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
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [patientId, setPatientId] = useState<string>('');
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [dentistId, setDentistId] = useState<string>(dentists[0]?.id ?? '');
  const [status, setStatus] = useState<string>('scheduled');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
    if (editing) {
      setPatientId(editing.patient_id);
      setDentistId(editing.dentist_id);
      setStatus(editing.status);
    } else {
      setPatientId('');
      setDentistId(dentists[0]?.id ?? '');
      setStatus('scheduled');
    }
  }, [open, editing, dentists]);

  const start = editing
    ? new Date(editing.starts_at)
    : defaultStart
      ? new Date(defaultStart)
      : new Date();
  const end = editing
    ? new Date(editing.ends_at)
    : new Date(start.getTime() + 30 * 60000);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!patientId) {
      setError(t('patientNotFound'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      fd.set('patient_id', patientId);
      fd.set('dentist_id', dentistId);
      fd.set('status', status);
      if (editing) fd.set('id', editing.id);
      const res = editing
        ? await updateAppointment(fd)
        : await createAppointment(fd);
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
      onOpenChange(false);
      if (onCreated) onCreated();
      else router.refresh();
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
      await deleteAppointment(editing.id);
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
        { id: p.id, name: `${p.last_name}, ${p.first_name}` },
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
          { id: match.id, name: `${match.last_name}, ${match.first_name}` },
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
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
              <PatientPicker
                patients={patients}
                value={patientId}
                onChange={setPatientId}
                onCreateNew={() => setNewPatientOpen(true)}
              />
            </div>
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
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="starts_at">{t('startsAt')}</Label>
                <Input
                  id="starts_at"
                  name="starts_at"
                  type="datetime-local"
                  defaultValue={format(start, "yyyy-MM-dd'T'HH:mm")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ends_at">{t('endsAt')}</Label>
                <Input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={format(end, "yyyy-MM-dd'T'HH:mm")}
                  required
                />
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
            <div className="flex items-center gap-2">
              {editing ? (
                <div className="flex-1 flex items-center gap-2">
                  {confirmDelete ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={onDelete}
                        disabled={loading}
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
        />
      ) : null}
    </Dialog.Root>
  );
}

function PatientPicker({
  patients,
  value,
  onChange,
  onCreateNew,
}: {
  patients: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  onCreateNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const t = useTranslations('patients');
  const tCommon = useTranslations('common');

  const selected = patients.find((p) => p.id === value);
  const filtered = query
    ? patients.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.id.toLowerCase().includes(query.toLowerCase()),
      )
    : patients;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        )}
      >
        <span className={cn(!selected && 'text-muted-foreground')}>
          {selected ? selected.name : tCommon('search') + '…'}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open ? (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-1"
          onMouseLeave={() => setOpen(false)}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tCommon('search') + '…'}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm mb-1"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2 text-center">
                {t('new')}
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                    value === p.id && 'bg-accent',
                  )}
                >
                  {value === p.id ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                  <span className="truncate">{p.name}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t('new')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-3xl max-h-[95vh] overflow-y-auto">
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
