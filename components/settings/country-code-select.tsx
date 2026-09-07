'use client';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { COUNTRY_CODES, CUSTOM_SENTINEL, type CountryCode } from '@/lib/country-codes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type CountryCodeSelectProps = {
  value: string;
  onChange: (next: string) => void;
  /** Field id used by the parent <Label htmlFor=...>. */
  id?: string;
};

/**
 * Country code picker with a pre-populated list (~40 countries covering
 * LATAM and the most common regions) and a "Custom…" option that reveals
 * a free-text input for future-proofing. The visible label is the
 * international dialing prefix; the search input is the english country
 * name. The Custom field accepts any `+` + digits string up to 8 chars.
 */
export function CountryCodeSelect({
  value,
  onChange,
  id = 'whatsapp-country-code',
}: CountryCodeSelectProps) {
  const t = useTranslations('settings');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const match: CountryCode | null = useMemo(
    () => COUNTRY_CODES.find((c) => c.code === value) ?? null,
    [value],
  );
  const isCustom = !!value && !match;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [search]);

  function pick(c: CountryCode) {
    onChange(c.code);
    setOpen(false);
    setSearch('');
  }

  function pickCustom(code: string) {
    let next = code.trim();
    if (next && !next.startsWith('+')) next = `+${next}`;
    if (/^\+\d{1,5}$/.test(next)) onChange(next);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="whatsapp-cc-toggle"
        className="flex h-10 min-h-[44px] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm"
      >
        <span className="truncate">
          {match ? `${match.code} · ${match.name}` : value || '—'}
        </span>
        <span className="text-muted-foreground text-xs">▾</span>
      </button>
      {open ? (
        <div
          className="rounded-md border bg-popover p-2 shadow-md"
          data-testid="whatsapp-cc-popover"
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('whatsappCountryCode')}
            data-testid="whatsapp-cc-search"
            className="flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm mb-2"
          />
          <ul
            role="listbox"
            className="max-h-64 overflow-y-auto"
            data-testid="whatsapp-cc-list"
          >
            {filtered.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  role="option"
                  aria-selected={c.code === value}
                  data-testid={`whatsapp-cc-${c.iso}`}
                  className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    c.code === value ? 'bg-accent' : ''
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-muted-foreground">{c.code}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                }}
                data-testid="whatsapp-cc-custom"
                className="flex w-full items-center justify-between gap-2 rounded-sm border-t px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
              >
                <span>{t('whatsappCustom')}</span>
                <span className="text-muted-foreground">+…</span>
              </button>
            </li>
          </ul>
        </div>
      ) : null}
      {isCustom ? (
        <div className="space-y-1">
          <Label htmlFor={`${id}-custom`}>{t('whatsappCustom')}</Label>
          <Input
            id={`${id}-custom`}
            type="text"
            inputMode="tel"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => pickCustom(e.target.value)}
            placeholder="+XX"
            data-testid="whatsapp-cc-custom-input"
          />
        </div>
      ) : null}
    </div>
  );
}

export { CUSTOM_SENTINEL };
