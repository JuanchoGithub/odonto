import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { getSchedulePageData } from '@/server/actions/dentist-schedules';
import { SchedulesClient } from '@/components/schedules/schedules-client';

export default async function SchedulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ dentist?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  // Receptionists have no schedule to manage.
  if (user.role === 'receptionist') redirect('/dashboard');

  const sp = await searchParams;
  // Non-admins can't view someone else's schedule.
  const targetDentist =
    user.role === 'admin' ? (sp.dentist ?? user.id) : user.id;

  const t = await getTranslations('schedules');
  const data = await getSchedulePageData(
    user.role === 'admin' ? targetDentist : undefined,
  );

  return (
    <div className="container py-4 md:py-8 space-y-4 md:space-y-6 max-w-4xl">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <SchedulesClient
        targetDentistId={data.targetId}
        isAdmin={user.role === 'admin'}
        weekly={data.weekly}
        exceptions={data.exceptions}
        businessHours={data.businessHours}
        clinicExceptions={data.clinicExceptions}
        dentists={data.dentists}
      />
    </div>
  );
}
