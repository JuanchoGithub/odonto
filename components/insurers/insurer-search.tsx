'use client';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/lib/navigation';
import { SearchSuggest } from '@/components/ui/search-suggest';
import type { InsurerRow } from '@/server/actions/insurers';
import { useEnsureSeeded } from '@/lib/store/sync';

export function InsurerSearch({ initial }: { initial?: string }) {
  const t = useTranslations('insurers');
  const tCommon = useTranslations('common');
  const router = useRouter();
  useEnsureSeeded({ snaps: ['insurers'] });

  return (
    <form
      action="/insurers"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
        router.push(q ? `/insurers?q=${encodeURIComponent(q)}` : '/insurers');
      }}
      className="flex items-center gap-2 flex-1 max-w-md justify-end"
    >
      <SearchSuggest<InsurerRow>
        initial={initial}
        placeholder={t('searchPlaceholder')}
        fetchItems={async (query) => {
          // Store-backed type-ahead (zero invocations).
          const { searchInsurersLocal, ensureInsurersSeeded } = await import('@/lib/store/options');
          const { getSnapRows } = await import('@/lib/store/snapshots');
          await ensureInsurersSeeded();
          const byId = new Map(getSnapRows('insurers').map((r) => [r.id, r]));
          return searchInsurersLocal(query, 8)
            .map((o) => byId.get(o.id))
            .filter((r): r is InsurerRow => !!r);
        }}
        getHref={(i) => `/insurers/${i.id}`}
        optionTestId="insurer-suggest-option"
        renderItem={(i) => (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{i.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {i.plan ?? i.phone ?? '—'}
            </span>
          </span>
        )}
      />
      <Button type="submit" variant="secondary">
        {tCommon('search')}
      </Button>
      <Button asChild>
        <Link href="/insurers/new">
          <Plus className="h-4 w-4" />
          {t('new')}
        </Link>
      </Button>
    </form>
  );
}
