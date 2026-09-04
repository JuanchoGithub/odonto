import { getPublicLinkInfo } from '@/server/actions/turn-picker';
import { queryOne } from '@/lib/db';
import { TurnPickerClient } from '@/components/turn-picker/turn-picker-client';
import { Activity } from 'lucide-react';

type Clinic = { name: string; locale: string };

// Public (no auth) — page content is gated by the token itself.
export default async function PickTurnPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [info, clinic] = await Promise.all([
    getPublicLinkInfo(token),
    queryOne<Clinic>('SELECT name, locale FROM clinics LIMIT 1'),
  ]);
  const locale = (clinic?.locale === 'en' ? 'en' : 'es') as 'es' | 'en';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-semibold">Odonto</span>
          {clinic?.name ? (
            <span className="text-muted-foreground text-sm">· {clinic.name}</span>
          ) : null}
        </div>
      </header>
      <main className="flex-1 container py-8 max-w-2xl">
        {info.ok ? (
          <TurnPickerClient
            token={token}
            patientName={info.patientName}
            dentistName={info.dentistName}
            slotMinutes={info.slotMinutes}
            expiresAt={info.expiresAt}
            locale={locale}
          />
        ) : (
          <InvalidLink reason={info.reason} locale={locale} />
        )}
      </main>
    </div>
  );
}

const copy: Record<string, Record<'es' | 'en', string>> = {
  invalid: { es: 'Enlace inválido', en: 'Invalid link' },
  consumed: {
    es: 'Este enlace ya fue utilizado',
    en: 'This link has already been used',
  },
  expired: { es: 'Este enlace expiró', en: 'This link expired' },
  subtitle: {
    es: 'Si creés que es un error, contactá a la clínica.',
    en: 'If you think this is a mistake, contact the clinic.',
  },
};

function InvalidLink({
  reason,
  locale,
}: {
  reason: 'invalid' | 'consumed' | 'expired';
  locale: 'es' | 'en';
}) {
  return (
    <div className="rounded-lg border p-8 text-center space-y-2">
      <h1 className="text-xl font-semibold">{copy[reason][locale]}</h1>
      <p className="text-sm text-muted-foreground">{copy.subtitle[locale]}</p>
    </div>
  );
}
