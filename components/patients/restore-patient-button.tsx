'use client';
import { useTranslations } from 'next-intl';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { restorePatient } from '@/server/actions/patients';
import { useToast } from '@/components/ui/toaster';
import { useRouter } from '@/lib/navigation';

export function RestorePatientButton({
  patientId,
  name,
}: {
  patientId: string;
  name: string;
}) {
  const t = useTranslations('patients');
  const { push } = useToast();
  const router = useRouter();

  async function onClick() {
    await restorePatient(patientId);
    push({ title: t('restored'), description: name, variant: 'success' });
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={onClick} data-testid="restore-patient">
      <RotateCcw className="h-4 w-4" />
      {t('restore')}
    </Button>
  );
}
