import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { listAllTreatments } from '@/server/actions/treatments';
import { queryOne } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/lib/navigation';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { AppLocale, Currency } from '@/lib/schemas/common';

type Clinic = { currency: Currency; locale: AppLocale };

export default async function TreatmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  const t = await getTranslations('treatments');
  const [rows, clinic] = await Promise.all([
    listAllTreatments(),
    queryOne<Clinic>('SELECT currency, locale FROM clinics LIMIT 1'),
  ]);
  const c = (clinic?.currency ?? 'USD') as Currency;
  const l = (clinic?.locale ?? locale) as AppLocale;

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rows.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">Patient</th>
                  <th className="py-2 pr-4">{t('description')}</th>
                  <th className="py-2 pr-4">{t('tooth')}</th>
                  <th className="py-2 pr-4">{t('cost')}</th>
                  <th className="py-2 pr-4">{t('code')}</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-4">
                      <Link href={`/patients/${r.patient_id}`} className="hover:underline">
                        {r.patient_name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{r.description}</td>
                    <td className="py-2 pr-4">{r.tooth_number ?? '—'}</td>
                    <td className="py-2 pr-4">{formatMoney(r.cost_cents, c, l)}</td>
                    <td className="py-2 pr-4">{r.code ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={
                          r.status === 'done'
                            ? 'success'
                            : r.status === 'cancelled'
                              ? 'destructive'
                              : r.status === 'in_progress'
                                ? 'warning'
                                : 'secondary'
                        }
                      >
                        {t(`status.${r.status}` as any)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
