import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/rbac';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClinicForm } from '@/components/settings/clinic-form';
import { UserForm } from '@/components/settings/user-form';
import { UserActions } from '@/components/settings/user-actions';
import { UserColorCell } from '@/components/settings/user-color-cell';
import { MedicalTagsManager } from '@/components/settings/medical-tags-manager';
import { CatalogManager } from '@/components/settings/catalog-manager';
import { Badge } from '@/components/ui/badge';
import { listAllMedicalTags } from '@/server/actions/medical-tags';

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
  color: string | null;
  deleted_at: string | null;
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
  const [clinic, users, medicalTags] = await Promise.all([
    queryOne<Clinic>('SELECT * FROM clinics LIMIT 1'),
    query<User>(
      `SELECT id, email, name, role, locale, created_at, color, deleted_at
         FROM users WHERE id != 'system' ORDER BY created_at`,
    ),
    listAllMedicalTags(),
  ]);
  const activeDentists = users
    .filter((u) => u.role === 'dentist' && !u.deleted_at)
    .map((u) => ({ id: u.id, name: u.name }));

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6 max-w-4xl">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
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
          <ul className="space-y-2 md:hidden">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex min-h-[64px] items-center gap-3 rounded-xl border bg-card p-3"
                data-testid="user-list-row"
              >
                <span
                  aria-hidden
                  className="h-10 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: u.color ?? undefined }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{u.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {u.email}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{u.role}</Badge>
                    <span>· {u.locale}</span>
                    {u.deleted_at ? (
                      <Badge variant="destructive">{t('formerStaff')}</Badge>
                    ) : null}
                  </span>
                  <span className="mt-2 block">
                    <UserActions
                      userId={u.id}
                      email={u.email}
                      role={u.role}
                      deleted={!!u.deleted_at}
                      dentists={activeDentists}
                    />
                  </span>
                </span>
                {u.role === 'dentist' ? (
                  <UserColorCell userId={u.id} color={u.color} />
                ) : null}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">{tCommon('name')}</th>
                  <th className="py-2 pr-4">{tCommon('email')}</th>
                  <th className="py-2 pr-4">{t('role')}</th>
                  <th className="py-2 pr-4">{tCommon('locale')}</th>
                  <th className="py-2 pr-4">{t('color')}</th>
                  <th className="py-2 pr-4"><span className="sr-only">{t('users')}</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2 pr-4">
                      {u.name}{' '}
                      {u.deleted_at ? (
                        <Badge variant="destructive">{t('formerStaff')}</Badge>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{u.role}</Badge>
                    </td>
                    <td className="py-2 pr-4">{u.locale}</td>
                    <td className="py-2 pr-4">
                      {u.role === 'dentist' ? (
                        <UserColorCell userId={u.id} color={u.color} />
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">
                      <UserActions
                        userId={u.id}
                        email={u.email}
                        role={u.role}
                        deleted={!!u.deleted_at}
                        dentists={activeDentists}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <UserForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('catalog')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('catalogHint')}</p>
        </CardHeader>
        <CardContent>
          <CatalogManager />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('medicalTags')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('medicalTagsHint')}</p>
        </CardHeader>
        <CardContent>
          <MedicalTagsManager initial={medicalTags} />
        </CardContent>
      </Card>
    </div>
  );
}
