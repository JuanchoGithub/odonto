import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { query } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { RevenueChart, TopTreatmentsChart } from '@/components/reports/charts';
import type { AppLocale, Currency } from '@/lib/schemas/common';

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations('reports');
  const tCommon = await getTranslations('common');

  const [clinicRows, revenueRows, topRows, noShowRow, byDentistRows] = await Promise.all([
    query<{ currency: Currency; locale: AppLocale }>(
      'SELECT currency, locale FROM clinics LIMIT 1',
    ),
    query<{ month: string; total: number }>(
      `SELECT strftime('%Y-%m', paid_at) as month, SUM(amount_cents) as total
       FROM payments
       WHERE paid_at >= date('now', '-6 months')
       GROUP BY month ORDER BY month`,
    ),
    query<{ description: string; count: number }>(
      `SELECT description, COUNT(*) as count FROM treatments
       WHERE created_at >= date('now', '-90 days')
       GROUP BY description ORDER BY count DESC LIMIT 8`,
    ),
    query<{ total: number; no_show: number }>(
      `SELECT
         (SELECT COUNT(*) FROM appointments) as total,
         (SELECT COUNT(*) FROM appointments WHERE status = 'no_show') as no_show`,
    ),
    query<{ dentist: string; count: number }>(
      `SELECT u.name as dentist, COUNT(*) as count
       FROM appointments a JOIN users u ON u.id = a.dentist_id
       WHERE a.starts_at >= date('now', '-30 days') AND a.status = 'completed'
       GROUP BY u.id ORDER BY count DESC`,
    ),
  ]);

  const clinic = clinicRows[0];
  const c = (clinic?.currency ?? 'USD') as Currency;
  const l = (clinic?.locale ?? locale) as AppLocale;

  const total = noShowRow[0]?.total ?? 0;
  const noShows = noShowRow[0]?.no_show ?? 0;
  const noShowPct = total > 0 ? Math.round((noShows / total) * 100) : 0;

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('noShowRate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{noShowPct}%</div>
            <p className="text-xs text-muted-foreground">
              {noShows} / {total}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('revenue')}</CardTitle>
        </CardHeader>
        <CardContent className="h-56 sm:h-72 md:h-[300px]">
          <RevenueChart data={revenueRows} currency={c} locale={l} />
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('topTreatments')}</CardTitle>
          </CardHeader>
          <CardContent className="h-56 sm:h-72 md:h-[300px]">
            <TopTreatmentsChart data={topRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('byDentist')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byDentistRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                byDentistRows.map((r) => (
                  <div key={r.dentist} className="flex items-center justify-between">
                    <span className="text-sm">{r.dentist}</span>
                    <span className="text-sm font-medium">{r.count}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
