'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  listCatalog,
  upsertCatalogEntry,
  markCatalogDefinitive,
  archiveCatalogEntry,
  type CatalogRow,
} from '@/server/actions/catalog';
import { useRouter } from '@/lib/navigation';

export function CatalogManager() {
  const t = useTranslations('settings');
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function refresh() {
    const data = await listCatalog({ includeArchived: false });
    setRows(data);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function add() {
    if (!desc.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set('description', desc.trim());
    fd.set('price', price.trim() === '' ? '0' : price.trim());
    fd.set('tax_kind', 'standard');
    fd.set('kind', 'general');
    await upsertCatalogEntry(fd);
    setDesc('');
    setPrice('');
    setSaving(false);
    await refresh();
    router.refresh();
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
              <Button size="sm" onClick={() => markCatalogDefinitive(r.id).then(refresh)}>
                {t('catalogApprove')}
              </Button>
            ) : null}
            {r.kind !== 'consulta' ? (
              <Button size="sm" variant="ghost" onClick={() => archiveCatalogEntry(r.id).then(refresh)}>
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
