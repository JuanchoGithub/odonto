import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/rbac';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClinicForm } from '@/components/settings/clinic-form';
import { UserForm } from '@/components/settings/user-form';
import { Badge } from '@/components/ui/badge';

type Clinic = {
  id: string;
  name: string;
  address: string | null;
  tax_id: string | null;
  tax_rate_standard_bps: number;
  tax_rate_reduced_bps: number;
  currency: string;
  locale: string;
  timezone: string;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  locale: string;
  created_at: string;
};

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ firstRun?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['admin']);
  const t = await getTranslations('settings');
  const tCommon = await getTranslations('common');
  const sp = await searchParams;
  const [clinic, users] = await Promise.all([
    queryOne<Clinic>('SELECT * FROM clinics LIMIT 1'),
    query<User>('SELECT id, email, name, role, locale, created_at FROM users ORDER BY created_at'),
  ]);

  return (
    <div className="container py-8 space-y-6 max-w-4xl">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      {sp.firstRun && !clinic ? (
        <div className="rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm">
          {tCommon('noClinicConfigured')}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('clinic')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClinicForm clinic={clinic ?? null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('users')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">{tCommon('name')}</th>
                  <th className="py-2 pr-4">{tCommon('email')}</th>
                  <th className="py-2 pr-4">{t('role')}</th>
                  <th className="py-2 pr-4">{tCommon('locale')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2 pr-4">{u.name}</td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{u.role}</Badge>
                    </td>
                    <td className="py-2 pr-4">{u.locale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <UserForm />
        </CardContent>
      </Card>
    </div>
  );
}
