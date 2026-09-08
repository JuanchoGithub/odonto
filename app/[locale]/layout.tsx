import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { routing } from '@/lib/i18n';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getClinicDefaultDuration } from '@/server/actions/dentist-schedules';
import { TopNav } from '@/components/nav/top-nav';
import { BottomNav } from '@/components/nav/bottom-nav';
import { AuthProvider } from '@/components/auth/session-provider';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { WhatsappProvider } from '@/components/whatsapp-provider';
import { getWhatsappContextData } from '@/server/actions/whatsapp';
import { buildUserWhatsappMap } from '@/lib/whatsapp';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Clinic = {
  id: string;
  name: string;
  currency: string;
  locale: string;
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'es' | 'en')) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();
  const session = await auth();
  const clinic = await queryOne<Clinic>(
    'SELECT id, name, currency, locale FROM clinics LIMIT 1',
  );
  const whatsapp = await getWhatsappContextData();

  // Block app until clinic is configured
  const strippedPath = '';
  if (session?.user && !clinic) {
    // We'll show the settings page on first login; layouts don't have pathname here,
    // so we just render children and let the /settings page detect via a server check.
  }

  const whatsappByUser = buildUserWhatsappMap(
    whatsapp.users,
    whatsapp.templates,
    whatsapp.countryCode,
  );

  // Add-turn context for the mobile toolbar (+). Dentists get a locked
  // single-entry list (picker hidden in the dialog); receptionists get the
  // full dentist list. Admins keep the legacy /patients/new shortcut, so
  // no extra query for them.
  type DentistOpt = { id: string; name: string; slot_minutes: number | null };
  let addTurnDentists: DentistOpt[] | null = null;
  let clinicDefaultDuration: number | undefined;
  if (session?.user && session.user.role !== 'admin') {
    if (session.user.role === 'dentist') {
      const me = await queryOne<{ name: string; slot_minutes: number | null }>(
        'SELECT name, slot_minutes FROM users WHERE id = ?',
        [session.user.id],
      );
      addTurnDentists = me
        ? [{ id: session.user.id, name: me.name, slot_minutes: me.slot_minutes }]
        : [];
      clinicDefaultDuration = me?.slot_minutes ?? undefined;
    } else {
      const [dentists, clinicDefault] = await Promise.all([
        query<DentistOpt>(
          "SELECT id, name, slot_minutes FROM users WHERE role = 'dentist' AND deleted_at IS NULL AND id != 'system' ORDER BY name",
        ),
        getClinicDefaultDuration(),
      ]);
      addTurnDentists = dentists;
      clinicDefaultDuration = clinicDefault;
    }
  }

  return (
    <AuthProvider>
      <NextIntlClientProvider messages={messages} locale={locale}>
        <WhatsappProvider
          clinic={{ countryCode: whatsapp.countryCode, templates: whatsapp.templates }}
          byUser={Object.fromEntries(whatsappByUser)}
        >
          <Toaster>
            <ThemeProvider>
            <div className="min-h-dvh flex flex-col">
              {session?.user ? (
                <TopNav
                  user={{
                    name: session.user.name ?? '',
                    email: session.user.email ?? '',
                    role: session.user.role,
                  }}
                  clinicName={clinic?.name ?? null}
                  currency={clinic?.currency ?? null}
                />
              ) : null}
              <main className="flex-1 pb-20 md:pb-0">{children}</main>
              {session?.user ? (
                <BottomNav
                  role={session.user.role}
                  currentUserId={session.user.id}
                  dentists={addTurnDentists}
                  clinicDefaultDuration={clinicDefaultDuration}
                />
              ) : null}
            </div>
            </ThemeProvider>
          </Toaster>
        </WhatsappProvider>
      </NextIntlClientProvider>
    </AuthProvider>
  );
}
