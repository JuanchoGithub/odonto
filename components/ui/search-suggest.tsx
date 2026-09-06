'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/lib/navigation';
import { useServerSearch } from '@/lib/hooks/use-server-search';
import { cn } from '@/lib/utils';

/**
 * Type-ahead search input with dropdown suggestions.
 *
 * Renders ONLY the input + dropdown — the surrounding form (submit button,
 * "New" button, layout) stays in the caller. Typing fires a debounced
 * request via `useServerSearch`; Enter with a highlighted suggestion
 * navigates to it, otherwise the form submits (filtered list view).
 */
export function SearchSuggest<T extends { id: string }>({
  initial = '',
  placeholder,
  fetchUrl,
  renderItem,
  getHref,
  optionTestId,
}: {
  initial?: string;
  placeholder: string;
  /** Builds the JSON endpoint for a query (already-trimmed). */
  fetchUrl: (q: string) => string;
  renderItem: (item: T) => React.ReactNode;
  getHref: (item: T) => string;
  optionTestId: string;
}) {
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(
    async (q: string, signal: AbortSignal) => {
      const r = await fetch(fetchUrl(q), { signal });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? (data as T[]) : [];
    },
    [fetchUrl],
  );

  const { query, setQuery, items, loading } = useServerSearch<T>({
    fetchItems,
    enabled: open,
  });

  function show() {
    setActive(-1);
    setOpen(true);
  }

  function go(item: T) {
    setOpen(false);
    router.push(getHref(item));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + delta + items.length) % items.length);
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        e.preventDefault(); // don't submit the form — open the suggestion
        go(items[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative flex-1 max-w-sm"
      onBlur={(e) => {
        // Close only when focus leaves the whole component (input + dropdown).
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        name="q"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setQuery(e.target.value);
          show();
        }}
        onFocus={show}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9"
        role="combobox"
        aria-expanded={open}
      />
      {open ? (
        <div
          data-testid="search-suggest"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-1"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          role="listbox"
        >
          {loading ? (
            <div className="p-2 text-center text-xs text-muted-foreground">
              {tCommon('searching')}
            </div>
          ) : items.length === 0 ? (
            <div className="p-2 text-center text-xs text-muted-foreground">
              {tCommon('noResults')}
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={i === active}
                data-testid={optionTestId}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  i === active && 'bg-accent',
                )}
              >
                {renderItem(item)}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
