import { getTranslations } from 'next-intl/server';
import { formatDistanceToNow } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/lib/navigation';
import { can } from '@/lib/rbac';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { PatientRow } from '@/server/actions/patients';
import type { AppLocale, Currency, Role } from '@/lib/schemas/common';
import { getPatientOverview, type OverviewTurn } from '@/server/actions/overview';
import { ClinicalAlertBanner } from '@/components/patients/clinical-alert-banner';
import { Odontogram } from '@/components/odontogram/odontogram';
import { PatientContactActions } from '@/components/patients/patient-contact-actions';
import { getClinicTimezone, wallClockInTz } from '@/lib/availability';

function apptVariant(s: string) {
  return s === 'completed'
    ? 'success'
    : s === 'cancelled'
      ? 'destructive'
      : s === 'no_show'
        ? 'warning'
        : ('default' as const);
}

function treatmentVariant(s: string) {
  return s === 'done'
    ? 'success'
    : s === 'cancelled'
      ? 'destructive'
      : s === 'in_progress'
        ? 'warning'
        : ('secondary' as const);
}

function TurnRow({
  turn,
  kind,
  locale,
  statusLabel,
}: {
  turn: NonNullable<OverviewTurn>;
  kind: 'last' | 'next';
  locale: AppLocale;
  statusLabel: (s: string) => string;
}) {
  const start = new Date(turn.starts_at);
  const end = new Date(turn.ends_at);
  return (
    <div
      data-testid={kind === 'last' ? 'overview-last-turn' : 'overview-next-turn'}
      className="flex min-h-[64px] flex-col gap-1 rounded-xl border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{formatDateTime(start, locale)}</span>
        <Badge variant={apptVariant(turn.status)} className="shrink-0">
          {statusLabel(turn.status)}
        </Badge>
      </div>
      <span className="text-sm text-muted-foreground">
        {relative(start, locale)} · {turn.dentist_name}
      </span>
      <span className="text-sm text-muted-foreground">
        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
        {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {turn.reason ? ` · ${turn.reason}` : ''}
      </span>
    </div>
  );
}

function relative(d: Date, locale: AppLocale): string {
  return formatDistanceToNow(d, {
    addSuffix: true,
    locale: locale === 'es' ? es : enUS,
  });
}

export async function PatientOverview({
  patient,
  locale,
  currency,
  viewerRole,
}: {
  patient: PatientRow;
  locale: AppLocale;
  currency: Currency;
  viewerRole: Role;
}) {
  const [t, tAppt, tTreat, tBill] = await Promise.all([
    getTranslations('patients'),
    getTranslations('appointments'),
    getTranslations('treatments'),
    getTranslations('billing'),
  ]);
  const data = await getPatientOverview(patient.id);
  const tz = await getClinicTimezone();
  const next = data.nextUpcoming
    ? (() => {
        const s = wallClockInTz(data.nextUpcoming.starts_at, tz);
        return { clinicDate: s.date, startHhmm: s.hhmm };
      })()
    : null;
  const last = data.lastPast
    ? (() => {
        const s = wallClockInTz(data.lastPast.starts_at, tz);
        return { clinicDate: s.date, startHhmm: s.hhmm };
      })()
    : null;
  // The WhatsApp message is tied to the appointment's dentist, so resolve
  // that dentist's per-user template override.
  const refTurn = data.nextUpcoming ?? data.lastPast;
  const refDentistId = refTurn?.dentist_id ?? null;
  const age = patient.birth_date
    ? Math.floor(
        (Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 86400_000),
      )
    : null;
  const canTreatments = can(viewerRole, 'treatments:read');
  const canOdontogram = can(viewerRole, 'odontogram:read');
  const statusLabel = (s: string) => tAppt(`status.${s}` as any);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {patient.last_name}, {patient.first_name}
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="overview-identity" className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              {patient.document_id ?? '—'} ·{' '}
              {patient.birth_date
                ? `${formatDate(patient.birth_date, locale)} (${t('overview.ageYears', { age: age ?? 0 })})`
                : '—'}
            </p>
            {patient.phone || patient.email ? (
              <PatientContactActions
                patientId={patient.id}
                patientName={`${patient.first_name} ${patient.last_name}`.trim()}
                phone={patient.phone}
                email={patient.email}
                clinicDate={next?.clinicDate ?? last?.clinicDate}
                startHhmm={next?.startHhmm ?? last?.startHhmm}
                isFuture={!!next}
                dentistName={next ? data.nextUpcoming?.dentist_name : data.lastPast?.dentist_name}
                dentistId={refDentistId}
                reason={next ? data.nextUpcoming?.reason : data.lastPast?.reason}
                variant="block"
              />
            ) : null}
            {patient.address ? (
              <p className="text-muted-foreground">{patient.address}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Insurance + balance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('insuranceProvider')}</CardTitle>
          </CardHeader>
          <CardContent data-testid="overview-insurance" className="space-y-2 text-sm">
            {data.insurerName ?? patient.insurance_provider ? (
              <>
                <p className="text-base font-semibold">
                  {data.insurerName ?? patient.insurance_provider}
                </p>
                {patient.insurance_plan ? <p>{patient.insurance_plan}</p> : null}
                {patient.insurance_number ? (
                  <p className="text-muted-foreground">
                    {t('insuranceNumber')}: {patient.insurance_number}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">{t('overview.noInsurance')}</p>
            )}
            <div
              data-testid="overview-balance"
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <span className="text-muted-foreground">{t('overview.unpaidBalance')}</span>
              {data.unpaidCount > 0 ? (
                <span className="font-semibold">
                  {tBill('unpaid')}: {data.unpaidCount} ·{' '}
                  {formatMoney(data.unpaidCents, currency, locale)}
                </span>
              ) : (
                <span>{t('overview.noUnpaid')}</span>
              )}
            </div>
            <Link
              prefetch={false}
              href={`/patients/${patient.id}?tab=invoices`}
              className="inline-block text-sm text-primary hover:underline"
            >
              {t('overview.viewAll')}
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Clinical risk */}
      <div>
        <ClinicalAlertBanner patient={patient} />
        {(patient.blood_type || patient.blood_pressure) && (
          <p className="mt-2 text-sm text-muted-foreground">
            {patient.blood_type
              ? `${t('bloodType')}: ${patient.blood_type}`
              : ''}
            {patient.blood_type && patient.blood_pressure ? ' · ' : ''}
            {patient.blood_pressure
              ? `${t('bloodPressure')}: ${patient.blood_pressure}`
              : ''}{' '}
            ·{' '}
            <Link
              prefetch={false}
              href={`/patients/${patient.id}?tab=medical`}
              className="text-primary hover:underline"
            >
              {t('tabs.medical')}
            </Link>
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Turns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t('tabs.appointments')}</CardTitle>
            <Link
              prefetch={false}
              href={`/patients/${patient.id}?tab=appointments`}
              className="text-sm text-primary hover:underline"
            >
              {t('overview.viewAll')}
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t('overview.lastTurn')}
            </p>
            {data.lastPast ? (
              <TurnRow turn={data.lastPast} kind="last" locale={locale} statusLabel={statusLabel} />
            ) : (
              <p data-testid="overview-last-turn" className="text-sm text-muted-foreground">
                {t('overview.noTurns')}
              </p>
            )}
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t('overview.nextTurn')}
            </p>
            {data.nextUpcoming ? (
              <TurnRow turn={data.nextUpcoming} kind="next" locale={locale} statusLabel={statusLabel} />
            ) : (
              <p data-testid="overview-next-turn" className="text-sm text-muted-foreground">
                {t('overview.noTurns')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Open treatments */}
        {canTreatments ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {t('tabs.treatments')} ({data.openTreatmentCount})
              </CardTitle>
              <Link
                prefetch={false}
                href={`/patients/${patient.id}?tab=treatments`}
                className="text-sm text-primary hover:underline"
              >
                {t('overview.viewAll')}
              </Link>
            </CardHeader>
            <CardContent data-testid="overview-treatments">
              {data.openTreatments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('overview.noTreatments')}</p>
              ) : (
                <ul className="space-y-2">
                  {data.openTreatments.map((tr) => (
                    <li
                      key={tr.id}
                      className="flex min-h-[64px] flex-col gap-1 rounded-xl border p-3"
                    >
                      <span className="truncate text-base font-semibold">{tr.description}</span>
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">
                          {formatMoney(tr.cost_cents, currency, locale)}
                        </span>
                        {tr.tooth_number != null ? (
                          <span className="text-muted-foreground">
                            {tTreat('tooth')} {tr.tooth_number}
                          </span>
                        ) : null}
                        <Badge variant={treatmentVariant(tr.status)} className="shrink-0">
                          {tTreat(`status.${tr.status}` as any)}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Full read-only odontogram */}
      {canOdontogram ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t('tabs.odontogram')}</CardTitle>
            <Link
              prefetch={false}
              href={`/patients/${patient.id}?tab=odontogram`}
              className="text-sm text-primary hover:underline"
            >
              {tAppt('openChart')}
            </Link>
          </CardHeader>
          <CardContent data-testid="overview-odontogram">
            <Odontogram
              initial={data.teeth}
              patientId={patient.id}
              mode={data.odontogramMode}
              locale={locale}
              readOnly
              history={[]}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
