'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/navigation';
import { Search } from 'lucide-react';

export function PatientSearch({ initial }: { initial?: string }) {
  const t = useTranslations('common');
  const tNav = useTranslations('patients');
  const [q, setQ] = useState(initial ?? '');
  const [, startTransition] = useTransition();

  return (
    <form
      action="/patients"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        startTransition(() => {
          window.location.assign(`/patients${params.toString() ? `?${params}` : ''}`);
        });
      }}
      className="flex items-center gap-2"
    >
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search')}
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="secondary">
        {t('search')}
      </Button>
      <Button asChild>
        <Link href="/patients/new">{tNav('new')}</Link>
      </Button>
    </form>
  );
}
