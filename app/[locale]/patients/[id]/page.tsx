import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/rbac';
import { getPatient } from '@/server/actions/patients';
import { Link } from '@/lib/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientForm } from '@/components/patients/patient-form';
import { PatientOdontogram } from '@/components/odontogram/patient-odontogram';
import { PatientTreatments } from '@/components/treatments/patient-treatments';
import { PatientInvoices } from '@/components/billing/patient-invoices';
import { PatientAttachments } from '@/components/attachments/patient-attachments';
import { formatDate } from '@/lib/format';
import { query, queryOne } from '@/lib/db';
import type { AppLocale, Currency } from '@/lib/schemas/common';
import { ShareTurnButton } from '@/components/turn-picker/share-turn-button';
import { DeletePatientButton } from '@/components/patients/delete-patient-button';
import { RestorePatientButton } from '@/components/patients/restore-patient-button';

type Clinic = { currency: string; locale: AppLocale };

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations('patients');
  const [patient, clinic, dentists] = await Promise.all([
    getPatient(id),
    queryOne<Clinic>('SELECT currency, locale FROM clinics LIMIT 1'),
    query<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE role = 'dentist' ORDER BY name",
    ),
  ]);
  if (!patient) notFound();

  const age = patient.birth_date
    ? Math.floor(
        (Date.now() - new Date(patient.birth_date).getTime()) /
          (365.25 * 86400_000),
      )
    : null;

  const isDeleted = patient.deleted_at != null;

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">
            <Link href="/patients" className="hover:underline">
              {t('title')}
            </Link>{' '}
            /
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {patient.last_name}, {patient.first_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {patient.document_id ?? '—'} ·{' '}
            {patient.birth_date
              ? `${formatDate(patient.birth_date, (clinic?.locale ?? locale) as AppLocale)} (${age})`
              : '—'}{' '}
            · {patient.phone ?? '—'} · {patient.email ?? '—'}
          </p>
        </div>
        {isDeleted ? (
          <RestorePatientButton patientId={id} name={`${patient.first_name} ${patient.last_name}`} />
        ) : (
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <ShareTurnButton
              patientId={id}
              dentists={dentists}
              currentUserId={user.id}
              role={user.role}
            />
            <DeletePatientButton
              patientId={id}
              patientName={`${patient.first_name} ${patient.last_name}`}
            />
          </div>
        )}
      </div>

      {isDeleted && (
        <div className="rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm">
          {t('deletedBanner')}
        </div>
      )}

      <Tabs defaultValue="general">
        <TabsList className="w-full">
          <TabsTrigger value="general">{t('tabs.general')}</TabsTrigger>
          <TabsTrigger value="medical">{t('tabs.medical')}</TabsTrigger>
          <TabsTrigger value="odontogram">{t('tabs.odontogram')}</TabsTrigger>
          <TabsTrigger value="treatments">{t('tabs.treatments')}</TabsTrigger>
          <TabsTrigger value="invoices">{t('tabs.invoices')}</TabsTrigger>
          <TabsTrigger value="attachments">{t('tabs.attachments')}</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('tabs.general')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientForm patient={patient} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="medical">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('tabs.medical')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientForm patient={patient} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="odontogram">
          <PatientOdontogram patientId={id} locale={(clinic?.locale ?? locale) as AppLocale} />
        </TabsContent>
        <TabsContent value="treatments">
          <PatientTreatments
            patientId={id}
            currency={(clinic?.currency ?? 'USD') as Currency}
            locale={(clinic?.locale ?? locale) as AppLocale}
          />
        </TabsContent>
        <TabsContent value="invoices">
          <PatientInvoices
            patientId={id}
            currency={(clinic?.currency ?? 'USD') as Currency}
            locale={(clinic?.locale ?? locale) as AppLocale}
          />
        </TabsContent>
        <TabsContent value="attachments">
          <PatientAttachments
            patientId={id}
            locale={(clinic?.locale ?? locale) as AppLocale}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
