import { getOdontogram, getOdontogramMode, getOdontogramHistory } from '@/server/actions/odontogram';
import { Odontogram } from './odontogram';
import type { AppLocale } from '@/lib/schemas/common';

export async function PatientOdontogram({
  patientId,
  locale,
}: {
  patientId: string;
  locale: AppLocale;
}) {
  const [teeth, mode, history] = await Promise.all([
    getOdontogram(patientId),
    getOdontogramMode(patientId),
    getOdontogramHistory(patientId),
  ]);
  return (
    <Odontogram
      initial={teeth}
      patientId={patientId}
      locale={locale}
      mode={mode}
      history={history}
    />
  );
}
