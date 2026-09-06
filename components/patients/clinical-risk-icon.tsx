'use client';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { PatientRow } from '@/server/actions/patients';

/**
 * Warning icon shown next to the patient name in the detail page header when
 * there is a clinical risk (contagious diseases, medication allergies).
 *
 * - Desktop: hovering the icon shows a native tooltip via `title`.
 * - Mobile: tapping the icon opens a Popover with the risk labels.
 *
 * The icon is ONLY rendered on the patient detail page. It never appears in
 * lists or the appointment dialog.
 */
export function ClinicalRiskIcon({
  patient,
  className,
}: {
  patient: PatientRow;
  className?: string;
}) {
  const t = useTranslations('patients');
  const [open, setOpen] = useState(false);

  const hasRisk =
    (patient.contagious_diseases?.trim().length ?? 0) > 0 ||
    (patient.allergies_medication?.trim().length ?? 0) > 0;

  if (!hasRisk) return null;

  const labels: string[] = [];
  if (patient.contagious_diseases?.trim()) labels.push(t('riskAlertContagious'));
  if (patient.allergies_medication?.trim()) labels.push(t('riskAlertAllergy'));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('riskAlertTitle')}
          title={t('riskAlertTitle')}
          className={cn(
            'inline-flex items-center justify-center text-destructive shrink-0',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm',
            className,
          )}
        >
          <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-destructive/10 border-destructive/40 text-destructive max-w-xs"
        sideOffset={6}
      >
        <div className="font-semibold text-sm">{t('riskAlertTitle')}</div>
        <div className="mt-1 text-xs space-y-0.5">
          {labels.map((l) => (
            <div key={l} data-risk-alert-item>{l}</div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
