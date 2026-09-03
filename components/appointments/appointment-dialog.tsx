'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ChevronDown, Check, UserPlus } from 'lucide-react';
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
import { createAppointment } from '@/server/actions/appointments';
import { useRouter } from '@/lib/navigation';
import { format } from 'date-fns';
import { PatientForm } from '@/components/patients/patient-form';
import { createPatientInline, type PatientRow } from '@/server/actions/patients';

export function AppointmentDialog({
  open,
  onOpenChange,
  defaultStart,
  dentists,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultStart: string | null;
  dentists: { id: string; name: string }[];
  onCreated?: () => void;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const tPi = useTranslations('patientOnboarding');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [patientId, setPatientId] = useState<string>('');
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  // Load patients each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
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

  const start = defaultStart ? new Date(defaultStart) : new Date();
  const end = new Date(start.getTime() + 30 * 60000);

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
      const res = await createAppointment(fd);
      if (res.error === 'conflict') {
        setError(t('conflict'));
        return;
      }
      if (res.error === 'patient_not_found') {
        setError(t('patientNotFound'));
        return;
      }
      if (res.error === 'invalid') {
        setError(t('invalid'));
        return;
      }
      if (res.error) {
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
            <Dialog.Title className="text-lg font-semibold">{t('new')}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('patient')}</Label>
              <PatientPicker
                patients={patients}
                value={patientId}
                onChange={setPatientId}
                onCreateNew={() => setNewPatientOpen(true)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dentist_id">{t('dentist')}</Label>
              <Select name="dentist_id" defaultValue={dentists[0]?.id}>
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
              <Input id="reason" name="reason" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{tCommon('notes')}</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
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
