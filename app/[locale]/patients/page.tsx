import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { listPatients } from '@/server/actions/patients';
import { Link } from '@/lib/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientSearch } from '@/components/patients/patient-search';
import { formatDate } from '@/lib/format';
import { queryOne } from '@/lib/db';
import type { AppLocale } from '@/lib/schemas/common';

type Clinic = { currency: string; locale: AppLocale };

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  const t = await getTranslations('patients');
  const tCommon = await getTranslations('common');
  const sp = await searchParams;
  const q = sp.q ?? '';
  const [patients, clinic] = await Promise.all([
    listPatients(q),
    queryOne<Clinic>('SELECT currency, locale FROM clinics LIMIT 1'),
  ]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <PatientSearch initial={q} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {patients.length} {tCommon('all').toLowerCase()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {patients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {tCommon('loading')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">{t('lastName')}, {t('firstName')}</th>
                    <th className="py-2 pr-4">{t('documentId')}</th>
                    <th className="py-2 pr-4">{t('phone')}</th>
                    <th className="py-2 pr-4">{t('birthDate')}</th>
                    <th className="py-2 pr-4">{t('insuranceProvider')}</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 pr-4">
                        <Link className="hover:underline" href={`/patients/${p.id}`}>
                          {p.last_name}, {p.first_name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{p.document_id ?? '—'}</td>
                      <td className="py-2 pr-4">{p.phone ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {p.birth_date
                          ? formatDate(p.birth_date, (clinic?.locale ?? locale) as AppLocale)
                          : '—'}
                      </td>
                      <td className="py-2 pr-4">{p.insurance_provider ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
