import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { listAppointmentsForWeek, listPendingTurnLinks } from '@/server/actions/appointments';
import { query } from '@/lib/db';
import { WeekCalendar } from '@/components/appointments/week-calendar';
import { startOfWeek, format } from 'date-fns';

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  const t = await getTranslations('appointments');
  const sp = await searchParams;
  const start = sp.start
    ? new Date(sp.start)
    : startOfWeek(new Date(), { weekStartsOn: 1 });
  const [appts, dentists, pendingLinks] = await Promise.all([
    listAppointmentsForWeek(start.toISOString()),
    query<{ id: string; name: string; color: string | null }>(
      "SELECT id, name, color FROM users WHERE role = 'dentist' ORDER BY name",
    ),
    listPendingTurnLinks(),
  ]);

  return (
    <div className="container py-8 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <WeekCalendar
        initial={appts}
        dentists={dentists.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
        pendingLinks={pendingLinks}
        // Date-only string: parsing a full ISO in the browser would shift
        // the day when the clinic timezone differs from UTC.
        initialWeekStart={format(startOfWeek(start, { weekStartsOn: 1 }), 'yyyy-MM-dd')}
      />
    </div>
  );
}
