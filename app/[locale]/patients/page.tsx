import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { listPatients } from '@/server/actions/patients';
import { Link } from '@/lib/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientSearch } from '@/components/patients/patient-search';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
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
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
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
            <EmptyState
              title={q ? tCommon('search') : t('new')}
              description={q ? `No results for "${q}"` : 'Add your first patient to get started.'}
              action={
                <Button asChild>
                  <Link href="/patients/new">{t('new')}</Link>
                </Button>
              }
            />
          ) : (
            <>
              {/* Mobile: tappable cards (full row, 64px+ target). */}
              <ul className="space-y-2 md:hidden">
                {patients.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/patients/${p.id}`}
                      className="flex min-h-[64px] items-start gap-3 rounded-xl border bg-card p-3 active:bg-accent"
                      data-testid="patient-list-row"
                    >
                      <span
                        aria-hidden
                        className="mt-1 h-10 w-1.5 shrink-0 rounded-full bg-primary/40"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">
                          {p.last_name}, {p.first_name}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {p.document_id ?? '—'}
                          {p.birth_date
                            ? ` · ${formatDate(p.birth_date, (clinic?.locale ?? locale) as AppLocale)}`
                            : ''}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          {p.phone ? (
                            <span className="text-primary">{p.phone}</span>
                          ) : null}
                          {p.insurance_provider ? (
                            <span className="truncate">· {p.insurance_provider}</span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="overflow-x-auto hidden md:block">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
