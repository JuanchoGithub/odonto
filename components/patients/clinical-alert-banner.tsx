import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      detail: patient.contagious_diseases,
    });
  }
  if (patient.allergies_medication?.trim()) {
    items.push({
      label: t('riskAlertAllergy'),
      detail: patient.allergies_medication,
    });
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold text-destructive">
          {t('riskAlertTitle')}
        </p>
        <ul className="text-sm space-y-0.5">
          {items.map((it) => (
            <li key={it.label}>
              <span className="font-medium text-destructive">{it.label}:</span>{' '}
              <span className="text-destructive/80">{it.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
