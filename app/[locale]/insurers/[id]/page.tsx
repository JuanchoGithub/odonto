import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { getInsurer, deleteInsurer } from '@/server/actions/insurers';
import { Link } from '@/lib/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InsurerForm } from '@/components/insurers/insurer-form';
import { query } from '@/lib/db';
import { auth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { queryOne } from '@/lib/db';
import type { AppLocale, Role } from '@/lib/schemas/common';

type Clinic = { currency: string; locale: AppLocale };

export default async function InsurerDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect('/login');
  const t = await getTranslations('insurers');
  const tCommon = await getTranslations('common');
  const tPatients = await getTranslations('patients');
  const insurer = await getInsurer(id);
  if (!insurer) notFound();
  const [clinic, patients] = await Promise.all([
    queryOne<Clinic>('SELECT currency, locale FROM clinics LIMIT 1'),
    query<{ id: string; first_name: string; last_name: string; created_at: string }>(
      `SELECT id, first_name, last_name, created_at FROM patients WHERE insurer_id = ? ORDER BY last_name, first_name LIMIT 100`,
      [id],
    ),
  ]);

  return (
    <div className="container py-8 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href="/insurers" className="hover:underline">
              {t('title')}
            </Link>{' '}
            /
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {insurer.name}
            {insurer.plan ? <span className="text-muted-foreground text-xl"> — {insurer.plan}</span> : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {insurer.phone ?? '—'} · {insurer.email ?? '—'} ·{' '}
            {formatDate(insurer.created_at, (clinic?.locale ?? locale) as AppLocale)}
          </p>
        </div>
        {session.user.role === ('admin' as Role) ? (
          <form
            action={async () => {
              'use server';
              await deleteInsurer(id);
            }}
          >
            <Button variant="destructive" type="submit">
              {tCommon('delete')}
            </Button>
          </form>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('edit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <InsurerForm insurer={insurer} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('patientCount')} ({patients.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {patients.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">{tPatients('lastName')}, {tPatients('firstName')}</th>
                    <th className="py-2 pr-4">{tCommon('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 pr-4">
                        <Link href={`/patients/${p.id}`} className="hover:underline">
                          {p.last_name}, {p.first_name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        {formatDate(p.created_at, (clinic?.locale ?? locale) as AppLocale)}
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
