'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { CatalogRow } from '@/server/actions/catalog';
import { useRouter } from '@/lib/navigation';
import { useSnapRows } from '@/lib/store/snapshots';
import { runSync, useEnsureSeeded } from '@/lib/store/sync';

export function CatalogManager() {
  const t = useTranslations('settings');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  // Catalog comes from the offline-first store (zero invocations).
  // SyncLoop owns the timer; this view seeds-on-empty only (no mount sync).
  const snapRows = useSnapRows('catalog');
  useEnsureSeeded({ snaps: ['catalog'] });
  const rows: CatalogRow[] | null = useMemo(
    () =>
      (snapRows as unknown as CatalogRow[]).filter(
        (r) => !(r as unknown as { archived_at: string | null }).archived_at,
      ),
    [snapRows],
  );

  function refresh() {
    void runSync();
  }

  async function add() {
    if (!desc.trim()) return;
    setSaving(true);
    try {
      // Offline-first: queue locally, flush at sync (zero invocations).
      const { queueCatalogCreate } = await import('@/lib/store/write');
      queueCatalogCreate({
        description: desc.trim(),
        code: null,
        price: Number(price.trim().replace(',', '.')) || 0,
        tax_kind: 'standard',
        kind: 'general',
      });
      setDesc('');
      setPrice('');
    } finally {
      setSaving(false);
    }
    router.refresh();
  }

  async function approve(id: string) {
    const { queueCatalogDefinitive } = await import('@/lib/store/write');
    const row = rows?.find((r) => r.id === id);
    queueCatalogDefinitive(
      id,
      {},
      (row as unknown as { updated_at?: string } | undefined)?.updated_at ?? null,
    );
    refresh();
  }

  async function archive(id: string) {
    const { queueCatalogArchive } = await import('@/lib/store/write');
    queueCatalogArchive(id);
    refresh();
  }

  if (!rows) return <p className="text-sm text-muted-foreground">…</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex min-h-[64px] items-center gap-3 rounded-xl border bg-card p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">{r.description}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>$ {(r.default_price_cents / 100).toLocaleString('es-AR')}</span>
                {r.kind === 'consulta' ? <Badge variant="default">consulta</Badge> : null}
                {r.is_definitive ? (
                  <Badge variant="success">{t('catalogDefinitive')}</Badge>
                ) : (
                  <Badge variant="warning">{t('catalogPending')}</Badge>
                )}
              </span>
            </span>
            {!r.is_definitive ? (
              <Button size="sm" onClick={() => approve(r.id)}>
                {t('catalogApprove')}
              </Button>
            ) : null}
            {r.kind !== 'consulta' ? (
              <Button size="sm" variant="ghost" onClick={() => archive(r.id)}>
                {t('catalogArchive')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t('catalogNew')}
          className="min-h-[44px]"
        />
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="50000"
          inputMode="decimal"
          className="min-h-[44px] w-32"
        />
        <Button onClick={add} disabled={saving || !desc.trim()} className="min-h-[44px]">
          {t('catalogAdd')}
        </Button>
      </div>
    </div>
  );
}
