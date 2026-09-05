'use client';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { X, Copy, Check, Link2, ChevronDown, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  createTurnPickerLink,
  listLinksForPatient,
  type TurnPickerLinkListItem,
} from '@/server/actions/turn-picker';
import type { PatientRow } from '@/server/actions/patients';
import { useToast } from '@/components/ui/toaster';

export function GenerateTurnLinkDialog({
  open,
  onOpenChange,
  patientId: fixedPatientId,
  dentists,
  defaultDentistId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  /** If provided, the patient is locked to this id (e.g. from patient page). */
  patientId?: string;
  dentists: { id: string; name: string }[];
  /** Preselect a dentist (e.g. current user). */
  defaultDentistId?: string;
}) {
  const t = useTranslations('turnPicker');
  const tAppt = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const { push } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [slotMinutes, setSlotMinutes] = useState<string>('15');
  const [dentistId, setDentistId] = useState<string>(defaultDentistId ?? dentists[0]?.id ?? '');
  const [patientId, setPatientId] = useState<string>(fixedPatientId ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<TurnPickerLinkListItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(null);
    if (defaultDentistId) setDentistId(defaultDentistId);
    if (fixedPatientId) setPatientId(fixedPatientId);
  }, [open, fixedPatientId, defaultDentistId]);

  // Load links for the currently-selected patient whenever it changes.
  useEffect(() => {
    if (!open || !patientId) {
      setLinks([]);
      return;
    }
    listLinksForPatient(patientId).then(setLinks).catch(() => setLinks([]));
  }, [open, patientId]);

  async function generate() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('patient_id', patientId);
      fd.set('dentist_id', dentistId);
      fd.set('slot_minutes', slotMinutes);
      const res = await createTurnPickerLink(fd);
      if (!res.ok) {
        setError(t(res.error === 'forbidden' ? 'invalid' : 'invalid'));
        return;
      }
      const abs = `${window.location.origin}${res.url}`;
      setUrl(abs);
      listLinksForPatient(patientId).then(setLinks).catch(() => {});
    } catch {
      setError(t('invalid'));
    } finally {
      setSaving(false);
    }
  }

  async function copy(fallbackSelect = false) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push({ title: t('copied'), variant: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (non-secure context) — select the input
      // so the user can long-press → copy manually.
      if (fallbackSelect) document.getElementById('tp-url')?.focus();
      push({ title: t('copyFailed'), variant: 'destructive' });
    }
  }

  async function share() {
    if (!url) return;
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: 'Odonto', url });
        return;
      } catch {
        return; // user dismissed — not an error
      }
    }
    copy(true);
  }

  const activeLinks = links.filter((l) => l.status === 'active');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-[60] w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {t('shareButton')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          {!url ? (
            <div className="space-y-4">
              {!fixedPatientId ? (
                <div className="space-y-2">
                  <Label>{tAppt('patient')}</Label>
                  <PatientPickerInline
                    value={patientId}
                    onChange={setPatientId}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>{t('dentist')}</Label>
                <Select value={dentistId} onValueChange={setDentistId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dentists.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('duration')}</Label>
                <Select value={slotMinutes} onValueChange={setSlotMinutes}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">{t('duration15')}</SelectItem>
                    <SelectItem value="30">{t('duration30')}</SelectItem>
                    <SelectItem value="45">{t('duration45')}</SelectItem>
                    <SelectItem value="60">{t('duration60')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">{t('idleNotice')}</p>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="outline">{tCommon('cancel')}</Button>
                </Dialog.Close>
                <Button
                  onClick={generate}
                  disabled={saving || !dentistId || !patientId}
                >
                  {saving ? tCommon('loading') : t('generate')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tp-url">{t('link')}</Label>
                <div className="flex gap-2">
                  <Input id="tp-url" readOnly value={url} onFocus={(e) => e.target.select()} />
                  <Button variant="outline" size="icon" onClick={() => copy()} aria-label={t('copyUrl')}>
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="outline" size="icon" onClick={share} aria-label={t('shareVia')}>
                    <Share className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('idleNotice')}</p>
              </div>
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUrl(null)}
                >
                  {t('generateAnother')}
                </Button>
                <Dialog.Close asChild>
                  <Button>{tCommon('done')}</Button>
                </Dialog.Close>
              </div>
            </div>
          )}

          {activeLinks.length > 0 ? (
            <div className="mt-6 border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('activeLinks')}
              </p>
              <ul className="space-y-1 text-xs">
                {activeLinks.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <Link2 className="h-3 w-3" />
                    <span className="truncate">
                      {l.dentist_name} · {l.slot_minutes} min ·{' '}
                      {new Date(l.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Simple patient search + select used when no patient is preselected. */
function PatientPickerInline({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/patients?limit=200')
      .then((r) => r.json())
      .then((data) =>
        setPatients(
          data.map((p: PatientRow) => ({
            id: p.id,
            name: `${p.last_name}, ${p.first_name}`,
          })),
        ),
      )
      .catch(() => setPatients([]));
  }, []);

  const filtered = query
    ? patients.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()),
      )
    : patients;
  const selected = patients.find((p) => p.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex min-h-[48px] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:text-sm',
        )}
      >
        <span className={cn(!selected && 'text-muted-foreground')}>
          {selected ? selected.name : tCommon('search') + '…'}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tCommon('search') + '…'}
            inputMode="search"
            className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-2 py-1 text-base mb-1 sm:text-sm"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                  setQuery('');
                }}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  value === p.id && 'bg-accent',
                )}
              >
                {value === p.id ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
