import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { queryOne } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Clinic = { id: string; name: string; currency: string; locale: string };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations('dashboard');
  const tCommon = await getTranslations('common');
  const clinic = await queryOne<Clinic>(
    'SELECT id, name, currency, locale FROM clinics LIMIT 1',
  );
  if (!clinic) redirect(`/${locale}/settings?firstRun=1`);

  const today = new Date().toISOString().slice(0, 10);
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const todayCount = (
    await queryOne<{ n: number }>(
      "SELECT COUNT(*) as n FROM appointments WHERE date(starts_at) = date(?) AND status != 'cancelled'",
      [today],
    )
  )?.n ?? 0;

  const weekRevenue = (
    await queryOne<{ s: number | null }>(
      "SELECT COALESCE(SUM(amount_cents),0) as s FROM payments WHERE date(paid_at) >= date(?)",
      [startOfWeek.toISOString()],
    )
  )?.s ?? 0;

  const activePatients = (
    await queryOne<{ n: number }>('SELECT COUNT(*) as n FROM patients')
  )?.n ?? 0;

  const unpaid = (
    await queryOne<{ n: number }>(
      "SELECT COUNT(*) as n FROM invoices WHERE status IN ('draft','issued')",
    )
  )?.n ?? 0;

  const cards = [
    { label: t('todayAppointments'), value: String(todayCount) },
    { label: t('weekRevenue'), value: formatCents(weekRevenue, clinic.currency, clinic.locale) },
    { label: t('activePatients'), value: String(activePatients) },
    { label: t('unpaidInvoices'), value: String(unpaid) },
  ];

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{tCommon('appName')} · {clinic.name}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatCents(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
