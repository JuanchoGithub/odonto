'use client';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { X, Copy, Check, Link2, Share } from 'lucide-react';
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
import { PatientForm } from '@/components/patients/patient-form';
import {
  createTurnPickerLink,
  listLinksForPatient,
  type TurnPickerLinkListItem,
} from '@/server/actions/turn-picker';
import type { PatientRow } from '@/server/actions/patients';
import type { PatientOption } from '@/lib/patient-options';
import { PatientCombobox } from '@/components/patients/patient-combobox';
import type { Role } from '@/lib/schemas/common';
import { useToast } from '@/components/ui/toaster';

const ALLOWED_LINK_DURATIONS = [15, 30, 45, 60, 90, 120];

function defaultSlotFor(
  dentists: { id: string; slot_minutes?: number | null }[],
  dentistId: string,
  clinicDefault: number,
): number {
  const match = dentists.find((d) => d.id === dentistId);
  const v = match?.slot_minutes;
  if (v && ALLOWED_LINK_DURATIONS.includes(v)) return v;
  return ALLOWED_LINK_DURATIONS.includes(clinicDefault) ? clinicDefault : 15;
}

export function GenerateTurnLinkDialog({
  open,
  onOpenChange,
  patientId: fixedPatientId,
  dentists,
  defaultDentistId,
  currentUserId,
  viewerRole,
  clinicDefaultDuration,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  /** If provided, the patient is locked to this id (e.g. from patient page). */
  patientId?: string;
  dentists: { id: string; name: string; slot_minutes?: number | null }[];
  /** Preselect a dentist (e.g. current user). */
  defaultDentistId?: string;
  /** When the viewer is a dentist, the dentist field is hidden and locked to them. */
  currentUserId?: string;
  viewerRole?: Role;
  /** Clinic fallback when the selected dentist has no per-dentist value. */
  clinicDefaultDuration?: number;
}) {
  const t = useTranslations('turnPicker');
  const tAppt = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const { push } = useToast();
  const clinicDefault = clinicDefaultDuration ?? 15;
  const initialDentistId =
    viewerRole === 'dentist' && currentUserId
      ? currentUserId
      : defaultDentistId ?? dentists[0]?.id ?? '';
  const [url, setUrl] = useState<string | null>(null);
  const [slotMinutes, setSlotMinutes] = useState<string>(
    String(defaultSlotFor(dentists, initialDentistId, clinicDefault)),
  );
  const [dentistId, setDentistId] = useState<string>(initialDentistId);
  const [patientId, setPatientId] = useState<string>(fixedPatientId ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<TurnPickerLinkListItem[]>([]);
  const [touchedSlot, setTouchedSlot] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(null);
    setTouchedSlot(false);
    if (viewerRole === 'dentist' && currentUserId) {
      setDentistId(currentUserId);
    } else if (defaultDentistId) {
      setDentistId(defaultDentistId);
    } else {
      setDentistId(dentists[0]?.id ?? '');
    }
    if (fixedPatientId) setPatientId(fixedPatientId);
  }, [open, fixedPatientId, defaultDentistId, viewerRole, currentUserId, dentists]);

  // Re-sync the default slot when the dentist changes — unless the user
  // has already picked a value explicitly. Per-dentist > clinic default > 15.
  useEffect(() => {
    if (!open) return;
    setSlotMinutes(
      String(defaultSlotFor(dentists, dentistId, clinicDefault)),
    );
    // dentists is stable per render; clinicDefault comes from props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dentistId, open, clinicDefaultDuration]);

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
              {/* Dentists always share as themselves — hidden entirely
                  to save screen space (dentistId defaults to them). */}
              {viewerRole === 'dentist' ? null : (
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
              )}
              <div className="space-y-2">
                <Label>{t('duration')}</Label>
                <Select
                  value={slotMinutes}
                  onValueChange={(v) => {
                    setTouchedSlot(true);
                    setSlotMinutes(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALLOWED_LINK_DURATIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} min
                      </SelectItem>
                    ))}
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
                  <Input id="tp-url" readOnly value={url} onFocus={(e) => e.target.select()} inputMode="url" autoComplete="off" />
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

/**
 * Patient search + select used when no patient is preselected.
 * Single-input combobox (type directly to filter); in-flow dropdown
 * because the parent dialog scrolls (overflow-y-auto) and would clip
 * an absolutely-positioned list. The "new patient" row opens the full
 * intake without leaving the share flow.
 */
function PatientPickerInline({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [newOpen, setNewOpen] = useState(false);
  // Last option picked/created through this picker, for display sync.
  const [knownOpt, setKnownOpt] = useState<PatientOption | null>(null);

  function onCreated(p: PatientRow) {
    setNewOpen(false);
    if (p?.id) {
      const opt: PatientOption = {
        id: p.id,
        name: `${p.last_name}, ${p.first_name}`,
        phone: p.phone,
        email: p.email,
      };
      setKnownOpt(opt);
      onChange(p.id);
    }
  }

  return (
    <div className="relative">
      <PatientCombobox
        value={value}
        selectedName={knownOpt?.id === value ? knownOpt.name : null}
        onChange={(id, opt) => {
          if (!id) setKnownOpt(null);
          else if (opt) setKnownOpt(opt);
          onChange(id);
        }}
        onCreateNew={() => setNewOpen(true)}
        inFlow
        inputTestId="tp-patient-input"
        listTestId="tp-patient-list"
        optionTestId="tp-patient-option"
      />
      <NewPatientInlineDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={onCreated}
      />
    </div>
  );
}

function NewPatientInlineDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: (p: PatientRow) => void;
}) {
  const t = useTranslations('patientOnboarding');
  const tCommon = useTranslations('common');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-[70] w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-3xl sm:max-h-[95vh]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-4">
            <div>
              <Dialog.Title className="text-lg font-semibold">{t('title')}</Dialog.Title>
              <p className="text-xs text-muted-foreground mt-1">{t('quickFormNotice')}</p>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <PatientForm
            mode="quick"
            queueMode
            onCreated={onCreated}
          />
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
