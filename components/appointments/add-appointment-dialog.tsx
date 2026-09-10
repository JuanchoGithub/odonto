'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  CalendarPlus,
  Share2,
  ChevronLeft,
  Copy,
  Check,
  Send,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { createAppointment } from '@/server/actions/appointments';
import {
  createTurnPickerLink,
  listLinksForPatient,
  type TurnPickerLinkListItem,
} from '@/server/actions/turn-picker';
import {
  createPatientInline,
  type PatientRow,
} from '@/server/actions/patients';
import type { PatientOption } from '@/lib/patient-options';
import { PatientCombobox } from '@/components/patients/patient-combobox';
import { usePatientOptions, searchPatientsLocal } from '@/lib/store/options';
import {
  PatientContact,
  NewPatientFullDialog,
} from './appointment-dialog';
import { useToast } from '@/components/ui/toaster';
import { useRouter } from '@/lib/navigation';
import { useWhatsapp } from '@/components/whatsapp-provider';
import { openTurnPickerWhatsapp } from '@/lib/turn-picker-whatsapp';
import type { Role } from '@/lib/schemas/common';

export type CreatedVia = 'manual' | 'click' | 'drag';

const DURATIONS = [15, 30, 45, 60, 90, 120];

function defaultDurFor(
  dentists: { id: string; slot_minutes?: number | null }[],
  dentistId: string,
  clinicDefault: number,
): number {
  const match = dentists.find((d) => d.id === dentistId);
  const v = match?.slot_minutes;
  if (v && DURATIONS.includes(v)) return v;
  return DURATIONS.includes(clinicDefault) ? clinicDefault : 15;
}

// 15-minute start times, 08:00 – 18:45 (mirrors the calendar display window)
const TIME_OPTIONS: string[] = [];
for (let h = 8; h < 19; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

type Phase = 'choice' | 'manual' | 'link';

/**
 * Single entry point for creating a turn.
 *
 * choice (default): shared patient picker + dentist (admin/secretary only)
 * + duration on top, then Cancel / Generate-link / Add-manual actions.
 * "Add manually" EXPANDS this same dialog with date, start time, motive
 * and notes (duration stays synced to the top select). "Generate link"
 * shows the link result inline — no dialog chaining.
 *
 * Slot/drag-select on the grid opens it with `startExpanded` + prefilled
 * times (context preserved). Bottom sheet on mobile, centered modal on
 * sm: and up (see AGENTS §13.5).
 */
export function AddAppointmentDialog({
  open,
  onOpenChange,
  defaultStart,
  defaultEnd,
  startExpanded = false,
  createdVia = 'manual',
  dentists,
  onCreated,
  currentUserId,
  viewerRole,
  clinicDefaultDuration,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  defaultStart: string | null;
  /** Optional pre-selected end (e.g. drag-select on the grid). */
  defaultEnd?: string | null;
  /** When true (slot/drag), skip the choice and open expanded in manual. */
  startExpanded?: boolean;
  /** How the user started this creation flow; recorded on the appointment. */
  createdVia?: CreatedVia;
  dentists: { id: string; name: string; slot_minutes?: number | null }[];
  onCreated?: () => void;
  /** When viewer is a dentist, dentist_id is locked to this (field hidden). */
  currentUserId?: string;
  viewerRole?: Role;
  /** Clinic fallback default duration (used when no dentist is selected yet). */
  clinicDefaultDuration?: number;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const tTp = useTranslations('turnPicker');
  const router = useRouter();
  const { push } = useToast();
  const { countryCode } = useWhatsapp();

  const [phase, setPhase] = useState<Phase>('choice');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forceMode, setForceMode] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [dentistId, setDentistId] = useState(
    viewerRole === 'dentist' && currentUserId
      ? currentUserId
      : dentists[0]?.id ?? '',
  );
  const clinicDefault = clinicDefaultDuration ?? 15;
  const [dateVal, setDateVal] = useState('');
  const [timeVal, setTimeVal] = useState('');
  const [durVal, setDurVal] = useState(
    String(defaultDurFor(dentists, dentistId, clinicDefault)),
  );
  const [touchedDur, setTouchedDur] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<TurnPickerLinkListItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'generateAnother' | 'close'>(
    'generateAnother',
  );

  // Patient list comes from the offline-first store (zero invocations).
  // Locally-created patients are kept in `extraPatients` until the sync
  // confirms them, then the store row takes over by id.
  const storePatientOptions = usePatientOptions();
  const [extraPatients, setExtraPatients] = useState<
    { id: string; name: string; phone: string | null; email: string | null }[]
  >([]);
  const patients = useMemo(() => {
    const ids = new Set(storePatientOptions.map((p) => p.id));
    return [
      ...storePatientOptions,
      ...extraPatients.filter((p) => !ids.has(p.id)),
    ];
  }, [storePatientOptions, extraPatients]);
  const pushExtraPatient = useCallback(
    (opt: { id: string; name: string; phone: string | null; email: string | null }) => {
      setExtraPatients((list) =>
        list.some((x) => x.id === opt.id) ? list : [...list, opt],
      );
    },
    [],
  );

  // Reset all state when the dialog OPENS — never while open. Server
  // revalidation (e.g. after inline patient creation) gives parents new
  // array references (dentists); without the open-cycle guard those would
  // wipe the in-progress form mid-flow.
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setError(null);
    setForceMode(false);
    setPhase(startExpanded ? 'manual' : 'choice');
    setPatientId('');
    const initialDentist =
      viewerRole === 'dentist' && currentUserId
        ? currentUserId
        : dentists[0]?.id ?? '';
    setDentistId(initialDentist);
    setReason('');
    setNotes('');
    setUrl(null);
    setLinks([]);
    setCopied(false);
    setWhatsappSent(false);
    setReminderOpen(false);
    setTouchedDur(false);
    const s = defaultStart ? new Date(defaultStart) : new Date();
    const e = defaultEnd
      ? new Date(defaultEnd)
      : new Date(
          s.getTime() +
            defaultDurFor(dentists, initialDentist, clinicDefault) * 60000,
        );
    setDateVal(format(s, 'yyyy-MM-dd'));
    setTimeVal(format(s, 'HH:mm'));
    if (defaultEnd) {
      // Drag-select / edit on existing appt: respect the supplied duration.
      const dur = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
      setDurVal(DURATIONS.includes(dur) ? String(dur) : String(defaultDurFor(dentists, initialDentist, clinicDefault)));
    } else {
      setDurVal(String(defaultDurFor(dentists, initialDentist, clinicDefault)));
    }
  }, [open, startExpanded, defaultStart, defaultEnd, dentists, viewerRole, currentUserId, clinicDefault]);

  // When the user picks a different dentist and hasn't manually chosen a
  // duration yet, snap to that dentist's default. Manual changes always win.
  useEffect(() => {
    if (touchedDur) return;
    setDurVal(String(defaultDurFor(dentists, dentistId, clinicDefault)));
  }, [dentistId, dentists, clinicDefault, touchedDur]);

  // Active links for the currently-selected patient.
  useEffect(() => {
    if (!open || !patientId || phase !== 'link') {
      if (phase !== 'link') setLinks([]);
      return;
    }
    listLinksForPatient(patientId).then(setLinks).catch(() => setLinks([]));
  }, [open, patientId, phase]);

  async function onPatientCreated(p: PatientRow) {
    setNewPatientOpen(false);
    if (p.id) {
      setPatientId(p.id);
      pushExtraPatient({
        id: p.id,
        name: `${p.last_name}, ${p.first_name}`,
        phone: p.phone,
        email: p.email,
      });
      return;
    }
    // Inline (queued) create: match the optimistic store row by name.
    const match = searchPatientsLocal(p.last_name, 200).find(
      (x) =>
        x.name === `${p.last_name}, ${p.first_name}` ||
        x.name.includes(p.first_name),
    );
    if (match) {
      setPatientId(match.id);
      pushExtraPatient({
        id: match.id,
        name: match.name,
        phone: match.phone,
        email: match.email,
      });
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('patient_id', patientId);
      fd.set('dentist_id', dentistId);
      fd.set('slot_minutes', durVal);
      const res = await createTurnPickerLink(fd);
      if (!res.ok) {
        setError(t('invalid'));
        return;
      }
      setUrl(`${window.location.origin}${res.url}`);
      setWhatsappSent(false);
      setPhase('link');
      listLinksForPatient(patientId).then(setLinks).catch(() => {});
    } catch {
      setError(t('invalid'));
    } finally {
      setLoading(false);
    }
  }

  async function copy(fallbackSelect = false) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push({ title: tTp('copied'), variant: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (fallbackSelect) document.getElementById('add-appt-url')?.focus();
      push({ title: tTp('copyFailed'), variant: 'destructive' });
    }
  }

  function whatsapp() {
    if (!url) return;
    const selected = patients.find((p) => p.id === patientId);
    const msg = tTp('whatsappMessage', {
      name: selected?.name ?? '',
      link: url,
    });
    openTurnPickerWhatsapp({
      phone: selected?.phone ?? null,
      message: msg,
      countryCode,
    });
    setWhatsappSent(true);
    setReminderOpen(false);
  }

  function goGenerateAnother() {
    if (!whatsappSent) {
      setPendingAction('generateAnother');
      setReminderOpen(true);
      return;
    }
    setUrl(null);
    setError(null);
    setWhatsappSent(false);
    setPhase('choice');
  }

  function goDone() {
    if (!whatsappSent) {
      setPendingAction('close');
      setReminderOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function confirmLeave() {
    setReminderOpen(false);
    if (pendingAction === 'generateAnother') {
      setUrl(null);
      setError(null);
      setWhatsappSent(false);
      setPhase('choice');
    } else {
      onOpenChange(false);
    }
  }

  async function saveManual(force = false) {
    if (!patientId) {
      setError(t('patientNotFound'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Offline-first: a just-created (queued) patient must exist server-side
      // before the appointment FK references it. Flush once if needed.
      const { ensurePatientSynced } = await import('@/lib/store/write');
      if (!(await ensurePatientSynced(patientId))) {
        setError(t('patientNotFound'));
        return;
      }
      // Timezone-aware ISO instants (naive y-m-d/HH:mm caused TZ ambiguity).
      const startLocal = new Date(`${dateVal}T${timeVal}:00`);
      const endLocal = new Date(startLocal.getTime() + Number(durVal) * 60000);
      const fd = new FormData();
      fd.set('starts_at', startLocal.toISOString());
      fd.set('ends_at', endLocal.toISOString());
      fd.set('created_via', createdVia);
      fd.set('patient_id', patientId);
      fd.set('dentist_id', dentistId);
      fd.set('status', 'scheduled');
      fd.set('reason', reason);
      fd.set('notes', notes);
      if (force) fd.set('bypass_hours', 'true');
      const res = await createAppointment(fd);
      if (res && 'error' in res && res.error === 'conflict') {
        if (!force) {
          setError(t('conflict'));
          setForceMode(true);
          return;
        }
        setError(t('invalid'));
        return;
      }
      if (res && 'error' in res && res.error === 'patient_not_found') {
        setError(t('patientNotFound'));
        return;
      }
      if (res && 'error' in res && res.error === 'invalid') {
        setError(t('invalid'));
        return;
      }
      if (res && 'error' in res && res.error) {
        setError(tErr('generic'));
        return;
      }
      setForceMode(false);
      // Optimistic: insert the block into the shared store instantly (the
      // background sync reconciles authoritative rows seconds later).
      if (res && 'ok' in res) {
        try {
          const { upsertRow } = await import('@/lib/store/snapshots');
          const opt = patients.find((p) => p.id === patientId);
          const dent = dentists.find((d) => d.id === dentistId);
          upsertRow('appointments', {
            id: res.id,
            patient_id: patientId,
            dentist_id: dentistId,
            starts_at: startLocal.toISOString(),
            ends_at: endLocal.toISOString(),
            status: 'scheduled',
            reason: reason || null,
            notes: notes || null,
            reprogram_count: 0,
            original_starts_at: null,
            cancelled_at: null,
            cancelled_by: null,
            cancel_reason: null,
            no_show_at: null,
            no_show_by: null,
            completed_at: null,
            patient_name: opt ? opt.name : '',
            dentist_name: dent ? dent.name : '',
            dentist_color: null,
            created_by: currentUserId ?? null,
            created_via: createdVia,
            creator_name: null,
            patient_phone: opt?.phone ?? null,
            patient_email: opt?.email ?? null,
          });
        } catch {
          // Best-effort; the sync will populate the row.
        }
      }
      onOpenChange(false);
      if (onCreated) onCreated();
      else router.refresh();
    } catch {
      setError(tErr('generic'));
    } finally {
      setLoading(false);
    }
  }

  const selectedName = patients.find((p) => p.id === patientId)?.name ?? null;
  const activeLinks = links.filter((l) => l.status === 'active');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          data-testid="add-appt-dialog"
          className="fixed inset-x-0 bottom-0 z-50 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {t('new')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {/* Shared top section: patient + dentist + duration */}
            <div className="space-y-2">
              <Label>{t('patient')}</Label>
              <PatientCombobox
                value={patientId}
                selectedName={selectedName}
                onChange={(id, opt) => {
                  setPatientId(id);
                  if (opt) pushExtraPatient(opt);
                }}
                onCreateNew={() => setNewPatientOpen(true)}
                inputTestId="appt-patient-input"
                listTestId="appt-patient-list"
                optionTestId="appt-patient-option"
              />
              {patientId ? (
                <PatientContact patients={patients} patientId={patientId} />
              ) : null}
            </div>

            {viewerRole === 'dentist' ? null : (
              <div className="space-y-2">
                <Label htmlFor="dentist_id">{t('dentist')}</Label>
                <Select
                  name="dentist_id"
                  value={dentistId}
                  onValueChange={setDentistId}
                >
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
                value={durVal}
                onValueChange={(v) => {
                  setTouchedDur(true);
                  setDurVal(v);
                }}
              >
                <SelectTrigger data-testid="appt-duration">
                  <SelectValue placeholder={`${durVal} min`} />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {phase === 'choice' ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  data-testid="add-appt-manual"
                  disabled={!patientId}
                  onClick={() => {
                    setError(null);
                    setPhase('manual');
                  }}
                >
                  <CalendarPlus className="h-4 w-4" />
                  {t('addManual')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('addManualDesc')}</p>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="add-appt-link"
                  disabled={!patientId || !dentistId || loading}
                  onClick={generate}
                >
                  <Share2 className="h-4 w-4" />
                  {loading ? tCommon('loading') : tTp('shareButton')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('shareLinkDesc')}</p>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">
                    {tCommon('cancel')}
                  </Button>
                </Dialog.Close>
              </div>
            ) : null}

            {phase === 'manual' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="appt_date">{tCommon('date')}</Label>
                    <Input
                      id="appt_date"
                      name="appt_date"
                      type="date"
                      value={dateVal}
                      onChange={(e) => setDateVal(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('startTime')}</Label>
                    <Select value={timeVal} onValueChange={setTimeVal} name="appt_start_time">
                      <SelectTrigger data-testid="appt-start-time">
                        <SelectValue placeholder={t('startTime')} />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIME_OPTIONS.map((hm) => (
                          <SelectItem key={hm} value={hm}>
                            {hm}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">{t('reason')}</Label>
                  <Input
                    id="reason"
                    name="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">{tCommon('notes')}</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setForceMode(false);
                        setPhase('choice');
                      }}
                      data-testid="add-appt-back"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {tCommon('back')}
                    </Button>
                  </div>
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline">
                      {tCommon('cancel')}
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="button"
                    variant={forceMode ? 'warning' : 'default'}
                    disabled={loading || !patientId}
                    onClick={() => saveManual(forceMode)}
                  >
                    {loading
                      ? tCommon('loading')
                      : forceMode
                        ? t('saveOutsideHours')
                        : tCommon('save')}
                  </Button>
                </div>
              </div>
            ) : null}

            {phase === 'link' && url ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="add-appt-url">{tTp('link')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="add-appt-url"
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                      inputMode="url"
                      autoComplete="off"
                    />
                    <Button variant="outline" size="icon" onClick={() => copy()} aria-label={tTp('copyUrl')}>
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon" onClick={whatsapp} aria-label={tTp('whatsapp')} title={tTp('whatsapp')}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{tTp('idleNotice')}</p>
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <div className="flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goGenerateAnother}
                  >
                    {tTp('generateAnother')}
                  </Button>
                  <Button onClick={goDone}>{tCommon('done')}</Button>
                </div>
              </div>
            ) : null}

            {activeLinks.length > 0 ? (
              <div className="border-t pt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {tTp('activeLinks')}
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <NewPatientFullDialog
        open={newPatientOpen}
        onOpenChange={setNewPatientOpen}
        onCreated={onPatientCreated}
      />
      <ReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        onCopy={() => copy()}
        onWhatsapp={whatsapp}
        onCancel={() => setReminderOpen(false)}
        onDone={confirmLeave}
        copied={copied}
      />
    </Dialog.Root>
  );
}

function ReminderDialog({
  open,
  onOpenChange,
  onCopy,
  onWhatsapp,
  onCancel,
  onDone,
  copied,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCopy: () => void;
  onWhatsapp: () => void;
  onCancel: () => void;
  onDone: () => void;
  copied: boolean;
}) {
  const t = useTranslations('turnPicker');
  const tCommon = useTranslations('common');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <Dialog.Content
          data-testid="share-reminder-dialog"
          className="fixed inset-x-0 bottom-0 z-[70] w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <Dialog.Title className="text-lg font-semibold mb-2">
            {t('reminderTitle')}
          </Dialog.Title>
          <p className="text-sm text-muted-foreground mb-4">{t('reminderBody')}</p>
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="icon"
              onClick={onCopy}
              aria-label={t('copyUrl')}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onWhatsapp}
              aria-label={t('whatsapp')}
              title={t('whatsapp')}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={onDone}>{tCommon('done')}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
