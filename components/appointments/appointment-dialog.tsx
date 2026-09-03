'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
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
import { X } from 'lucide-react';
import { createAppointment } from '@/server/actions/appointments';
import { useRouter } from '@/lib/navigation';
import { format } from 'date-fns';

export function AppointmentDialog({
  open,
  onOpenChange,
  defaultStart,
  dentists,
  patients,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultStart: string | null;
  dentists: { id: string; name: string }[];
  patients?: { id: string; name: string }[];
  onCreated?: () => void;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const start = defaultStart ? new Date(defaultStart) : new Date();
  const end = new Date(start.getTime() + 30 * 60000);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await createAppointment(fd);
    setLoading(false);
    if (res.error === 'conflict') {
      setError(t('conflict'));
      return;
    }
    if (res.error) {
      setError(tErr('generic'));
      return;
    }
    onOpenChange(false);
    if (onCreated) onCreated();
    else router.refresh();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
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
              <Label htmlFor="patient_id">{t('patient')}</Label>
              <PatientCombobox patients={patients ?? []} name="patient_id" />
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

function PatientCombobox({
  patients,
  name,
}: {
  patients: { id: string; name: string }[];
  name: string;
}) {
  if (patients.length === 0) {
    return (
      <Input
        name={name}
        placeholder="patient id"
        required
        className="font-mono text-xs"
      />
    );
  }
  return (
    <Select name={name} defaultValue={patients[0]?.id}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {patients.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
