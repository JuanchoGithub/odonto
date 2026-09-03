import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { listInsurers } from '@/server/actions/insurers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Plus, Shield } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { queryOne } from '@/lib/db';
import type { AppLocale } from '@/lib/schemas/common';

type Clinic = { currency: string; locale: AppLocale };

export default async function InsurersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  const t = await getTranslations('insurers');
  const tCommon = await getTranslations('common');
  const sp = await searchParams;
  const q = sp.q ?? '';
  const [insurers, clinic] = await Promise.all([
    listInsurers(q),
    queryOne<Clinic>('SELECT currency, locale FROM clinics LIMIT 1'),
  ]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <form action="/insurers" method="get" className="flex items-center gap-2 flex-1 max-w-md justify-end">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            {tCommon('search')}
          </Button>
          <Button asChild>
            <Link href="/insurers/new"><Plus className="h-4 w-4" />{t('new')}</Link>
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{insurers.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {insurers.length === 0 ? (
            <EmptyState
              title={q ? tCommon('search') : t('new')}
              description={
                q
                  ? `No results for "${q}"`
                  : 'Add your first insurer to start linking patients to it.'
              }
              action={
                <Button asChild>
                  <Link href="/insurers/new">{t('new')}</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">{t('name')}</th>
                    <th className="py-2 pr-4">{t('plan')}</th>
                    <th className="py-2 pr-4">{t('phone')}</th>
                    <th className="py-2 pr-4">{t('email')}</th>
                    <th className="py-2 pr-4 text-right">{t('patientCount')}</th>
                    <th className="py-2 pr-4">{tCommon('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {insurers.map((i) => (
                    <tr key={i.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 pr-4">
                        <Link className="hover:underline flex items-center gap-2" href={`/insurers/${i.id}`}>
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          {i.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{i.plan ?? '—'}</td>
                      <td className="py-2 pr-4">{i.phone ?? '—'}</td>
                      <td className="py-2 pr-4">{i.email ?? '—'}</td>
                      <td className="py-2 pr-4 text-right">{i.patient_count ?? 0}</td>
                      <td className="py-2 pr-4">
                        {formatDate(i.created_at, (clinic?.locale ?? locale) as AppLocale)}
                      </td>
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
