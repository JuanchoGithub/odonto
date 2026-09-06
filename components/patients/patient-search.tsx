'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/lib/navigation';
import { SearchSuggest } from '@/components/ui/search-suggest';
import type { PatientRow } from '@/server/actions/patients';

export function PatientSearch({ initial }: { initial?: string }) {
  const t = useTranslations('common');
  const tNav = useTranslations('patients');
  const router = useRouter();

  return (
    <form
      action="/patients"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
        router.push(q ? `/patients?q=${encodeURIComponent(q)}` : '/patients');
      }}
      className="flex items-center gap-2"
    >
      <SearchSuggest<PatientRow>
        initial={initial}
        placeholder={t('search')}
        fetchUrl={(query) => `/api/patients?q=${encodeURIComponent(query)}&limit=8`}
        getHref={(p) => `/patients/${p.id}`}
        optionTestId="patient-suggest-option"
        renderItem={(p) => (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {p.last_name}, {p.first_name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {[p.document_id, p.phone, p.email].filter(Boolean).join(' · ') || '—'}
            </span>
          </span>
        )}
      />
      <Button type="submit" variant="secondary">
        {t('search')}
      </Button>
      <Button asChild>
        <Link href="/patients/new">{tNav('new')}</Link>
      </Button>
    </form>
  );
}
