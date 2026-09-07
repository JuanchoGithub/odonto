import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DoctorPanel } from '@/components/dashboard/doctor-panel';
import { SecretaryPanel } from '@/components/dashboard/secretary-panel';
import { getClinicDefaultDuration } from '@/server/actions/dentist-schedules';

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

  const dentistRow =
    user.role === 'dentist'
      ? await queryOne<{ slot_minutes: number | null }>(
          'SELECT slot_minutes FROM users WHERE id = ?',
          [user.id],
        )
      : null;

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{tCommon('appName')} · {clinic.name}</p>
      </div>
      {user.role === 'dentist' ? (
        <DoctorPanel
          dentist={{
            id: user.id,
            name: user.name ?? '',
            slot_minutes: dentistRow?.slot_minutes ?? null,
          }}
        />
      ) : user.role === 'receptionist' ? (
        <SecretaryPanel
          dentists={await query<{ id: string; name: string; slot_minutes: number | null }>(
            "SELECT id, name, slot_minutes FROM users WHERE role = 'dentist' ORDER BY name",
          )}
          currency={clinic.currency}
          locale={clinic.locale}
          clinicDefaultDuration={await getClinicDefaultDuration()}
        />
      ) : (
        <AdminCards clinic={clinic} />
      )}
    </div>
  );
}

async function AdminCards({ clinic }: { clinic: Clinic }) {
  const t = await getTranslations('dashboard');
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="admin-panel">
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
  );
}

function formatCents(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
