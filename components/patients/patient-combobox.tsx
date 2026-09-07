'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  fetchPatientOptions,
  type PatientOption,
} from '@/lib/patient-options';
import { useServerSearch } from '@/lib/hooks/use-server-search';

type Props = {
  value: string;
  onChange: (id: string, opt?: PatientOption) => void;
  onCreateNew: () => void;
  /** Display name already known by the parent (e.g. prefetched list). */
  selectedName?: string | null;
  placeholder?: string;
  /** True when the parent dialog scrolls (overflow-y-auto) and would clip an absolute dropdown. */
  inFlow?: boolean;
  inputTestId?: string;
  listTestId?: string;
  optionTestId?: string;
};

/**
 * Single-input patient combobox: type directly in the field to filter,
 * pick a result to fill it, type again to clear + re-search.
 *
 * Replaces the old two-step toggle-button + inner-search-input pattern
 * (which duplicated the "Buscar…" affordance and cost vertical space
 * inside bottom-sheet dialogs on mobile).
 */
export function PatientCombobox({
  value,
  onChange,
  onCreateNew,
  selectedName,
  placeholder,
  inFlow = false,
  inputTestId,
  listTestId,
  optionTestId,
}: Props) {
  const tCommon = useTranslations('common');
  const tPat = useTranslations('patients');
  const [display, setDisplay] = useState(selectedName ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selectedOpt, setSelectedOpt] = useState<PatientOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // True while the user is actively typing (set on keystroke, cleared on
  // pick/clear/blur). Used to never clobber in-progress typing when the
  // parent value changes.
  const typingRef = useRef(false);

  const fetchPatients = useCallback(
    (q: string, signal: AbortSignal) => fetchPatientOptions(q, signal),
    [],
  );
  const { setQuery, items, loading } = useServerSearch<PatientOption>({
    fetchItems: fetchPatients,
    enabled: open,
  });

  const showClear = display.length > 0;

  // Sync display when the parent sets/clears the value externally
  // (e.g. inline "new patient" creation, where focus returns to this
  // input on sub-dialog close). Never clobber while the user is typing.
  // A stale internal pick must not shadow the parent: when the value
  // moved elsewhere, drop it and sync from the parent's selectedName.
  useEffect(() => {
    if (typingRef.current) return;
    if (!value) {
      if (document.activeElement !== inputRef.current) {
        if (display !== '') setDisplay('');
        setSelectedOpt(null);
      }
      return;
    }
    if (selectedOpt && selectedOpt.id !== value) setSelectedOpt(null);
    const name =
      selectedOpt && selectedOpt.id === value
        ? selectedOpt.name
        : (selectedName ?? '');
    if (name && display !== name) setDisplay(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selectedName]);

  function pick(p: PatientOption) {
    typingRef.current = false;
    setSelectedOpt(p);
    setDisplay(p.name);
    setQuery('');
    setActive(-1);
    setOpen(false);
    onChange(p.id, p);
    inputRef.current?.blur();
  }

  function clear() {
    typingRef.current = false;
    setSelectedOpt(null);
    setDisplay('');
    setQuery('');
    setActive(-1);
    onChange('', undefined);
    inputRef.current?.focus();
    setOpen(true);
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
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-activedescendant={
            open && active >= 0 && items[active]
              ? `patient-opt-${items[active].id}`
              : undefined
          }
          value={display}
          onChange={(e) => {
            const v = e.target.value;
            typingRef.current = true;
            setDisplay(v);
            setQuery(v);
            setActive(-1);
            setOpen(true);
            // Typing after a selection clears it (standard combobox).
            if (value !== '') {
              setSelectedOpt(null);
              onChange('', undefined);
            }
          }}
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onBlur={() => {
            typingRef.current = false;
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? tCommon('search') + '…'}
          data-testid={inputTestId}
          className="pl-9 pr-9"
        />
        {showClear ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          data-testid={listTestId}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          className={
            inFlow
              ? 'mt-1 w-full rounded-md border bg-popover p-1 shadow-md'
              : 'absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md'
          }
        >
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-2 text-center text-xs text-muted-foreground">
                {tCommon('loading')}
              </div>
            ) : items.length === 0 ? (
              <div className="p-2 text-center text-xs text-muted-foreground">
                {tCommon('noResults')}
              </div>
            ) : (
              items.map((p, i) => (
                <button
                  key={p.id}
                  id={`patient-opt-${p.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === active || value === p.id}
                  data-testid={optionTestId}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex min-h-[44px] w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                    (i === active || value === p.id) && 'bg-accent',
                  )}
                >
                  {value === p.id ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{p.name}</span>
                </button>
              ))
            )}
          </div>
          <div className="mt-1 border-t pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-primary hover:bg-accent"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {tPat('new')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
