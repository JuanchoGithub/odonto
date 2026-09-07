import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

/**
 * Schedules moved into the Profile page (Times tab). This route is kept as
 * a redirect for any existing bookmarks / links.
 */
export default async function SchedulesRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/profile?tab=times`);
}