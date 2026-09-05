import { getOdontogram, getOdontogramMode } from '@/server/actions/odontogram';
import { Odontogram } from './odontogram';
import type { AppLocale } from '@/lib/schemas/common';

export async function PatientOdontogram({
  patientId,
  locale,
}: {
  patientId: string;
  locale: AppLocale;
}) {
  const [teeth, mode] = await Promise.all([
    getOdontogram(patientId),
    getOdontogramMode(patientId),
  ]);
  return (
    <Odontogram
      initial={teeth}
      patientId={patientId}
      locale={locale}
      mode={mode}
    />
  );
}
