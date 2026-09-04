'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  deletePatient,
  restorePatient,
} from '@/server/actions/patients';
import { useToast } from '@/components/ui/toaster';
import { useRouter } from '@/lib/navigation';

export function DeletePatientButton({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const t = useTranslations('patients');
  const tCommon = useTranslations('common');
  const { push } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      await deletePatient(patientId);
      setOpen(false);
      push({
        title: t('deleted'),
        description: patientName,
        variant: 'default',
        action: {
          label: tCommon('undo'),
          onClick: async () => {
            await restorePatient(patientId);
            router.refresh();
          },
        },
      });
      router.push('/patients');
    } catch {
      push({ title: tCommon('errorGeneric'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        data-testid="delete-patient"
      >
        <Trash2 className="h-4 w-4" />
        {tCommon('delete')}
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-sm">
            <div className="flex items-start justify-between mb-3">
              <Dialog.Title className="text-lg font-semibold">
                {t('deleteTitle')}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              {t('deleteConfirm', { name: patientName })}
            </p>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline">{tCommon('cancel')}</Button>
              </Dialog.Close>
              <Button
                variant="destructive"
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? tCommon('loading') : tCommon('delete')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
