import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { unmark } from '@/lib/medical-tags';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import type { PatientRow } from '@/server/actions/patients';

export function ClinicalAlertBanner({
  patient,
  className,
}: {
  patient: PatientRow;
  className?: string;
}) {
  const t = useTranslations('patients');

  const hasHighRisk =
    (patient.contagious_diseases?.trim().length ?? 0) > 0 ||
    (patient.allergies_medication?.trim().length ?? 0) > 0;

  if (!hasHighRisk) return null;

  const items: { label: string; detail: string }[] = [];
  if (patient.contagious_diseases?.trim()) {
    items.push({
      label: t('riskAlertContagious'),
      detail: unmark(patient.contagious_diseases),
    });
  }
  if (patient.allergies_medication?.trim()) {
    items.push({
      label: t('riskAlertAllergy'),
      detail: unmark(patient.allergies_medication),
    });
  }

  return (
    <Alert
      variant="destructive"
      data-testid="risk-alert"
      className={cn('flex items-start gap-3', className)}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1">
        <AlertTitle>{t('riskAlertTitle')}</AlertTitle>
        <AlertDescription>
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.label}>
                <span className="font-medium">{it.label}:</span>{' '}
                <span className="text-destructive/80">{it.detail}</span>
              </li>
            ))}
          </ul>
        </AlertDescription>
      </div>
    </Alert>
  );
}
