import { defineRouting } from 'next-intl/routing';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
});

export type AppLocale = (typeof routing.locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && routing.locales.includes(requested as 'es' | 'en')
      ? requested
      : routing.defaultLocale;

  let messages;
  try {
    messages = (await import(`@/messages/${locale}.json`)).default;
  } catch {
    notFound();
  }

  return { locale, messages };
});
