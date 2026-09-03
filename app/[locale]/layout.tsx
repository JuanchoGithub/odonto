import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { routing } from '@/lib/i18n';
import { auth } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { TopNav } from '@/components/nav/top-nav';
import { AuthProvider } from '@/components/auth/session-provider';

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

  // Block app until clinic is configured
  const strippedPath = '';
  if (session?.user && !clinic) {
    // We'll show the settings page on first login; layouts don't have pathname here,
    // so we just render children and let the /settings page detect via a server check.
  }

  return (
    <AuthProvider>
      <NextIntlClientProvider messages={messages} locale={locale}>
        <div className="min-h-screen flex flex-col">
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
          <main className="flex-1">{children}</main>
        </div>
      </NextIntlClientProvider>
    </AuthProvider>
  );
}
