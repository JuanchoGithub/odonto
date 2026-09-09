'use client';
import { useMemo } from 'react';
import { useDeltaRows } from '@/lib/store/snapshots';
import { useEnsureSeeded } from '@/lib/store/sync';
import { formatDate } from '@/lib/format';
import type { AppLocale } from '@/lib/schemas/common';
import type { PatientRow } from '@/server/actions/patients';
import { ClinicalRiskIcon } from '@/components/patients/clinical-risk-icon';

export function PatientHeader({
  patient: initialPatient,
  locale,
  ageLabel,
}: {
  patient: PatientRow;
  locale: AppLocale;
  ageLabel: (age: number) => string;
}) {
  useEnsureSeeded({ deltas: ['patients'] });
  const storePatients = useDeltaRows('patients');
  const patient = useMemo(() => {
    const found = storePatients.find((p) => p.id === initialPatient.id);
    return found ?? initialPatient;
  }, [storePatients, initialPatient]);

  const age = patient.birth_date
    ? Math.floor(
        (Date.now() - new Date(patient.birth_date).getTime()) /
          (365.25 * 86400_000),
      )
    : null;

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight break-words">
        {patient.last_name}, {patient.first_name}
        <ClinicalRiskIcon patient={patient} />
      </h1>
      <p className="text-sm text-muted-foreground break-words">
        {patient.document_id ?? '—'} ·{' '}
        {patient.birth_date
          ? `${formatDate(patient.birth_date, locale)} (${age !== null ? ageLabel(age) : ''})`
          : '—'}{' '}
        · {patient.phone ?? '—'}{patient.email ? ` · ${patient.email}` : ''}
      </p>
    </>
  );
}
