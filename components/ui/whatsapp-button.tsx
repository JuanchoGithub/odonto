'use client';
import { useState, useTransition, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations, useLocale } from 'next-intl';
import { MessageCircle, X, Bell, CalendarClock, Loader2 } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { useToast } from './toaster';
import { useWhatsapp } from '@/components/whatsapp-provider';
import {
  fillTemplate,
  pickAutoTemplate,
  templateBody,
  weekdayFromClinicDate,
  timeFromHhmm,
  waMeUrl,
  type WhatsappTemplate,
} from '@/lib/whatsapp';
import { openTurnPickerWhatsapp } from '@/lib/turn-picker-whatsapp';
import { updatePatientPhoneInline } from '@/server/actions/whatsapp';
import { createReprogramLink } from '@/server/actions/turn-picker';

export type WhatsappContext = {
  /** Already-known patient name (used to fill the template). */
  patientName: string;
  /** Clinic-local date "YYYY-MM-DD" — never browser TZ. */
  clinicDate: string;
  /** Clinic-local "HH:MM" — server-computed. */
  startHhmm: string;
  dentistName?: string | null;
  reason?: string | null;
};

type Variant = 'icon' | 'block';

type WhatsappButtonProps = {
  /** Patient phone as currently stored (null → opens missing-phone prompt). */
  patientPhone: string | null;
  patientId: string;
  /** Context to fill the template with. */
  context: WhatsappContext;
  /** Templates configured for the clinic. */
  templates: WhatsappTemplate[];
  /** Default country code. */
  countryCode: string;
  /** When set, resolve this dentist's per-user override (falls back to clinic). */
  dentistId?: string | null;
  /** Appointment status (drives the auto-pick). */
  status: string;
  /** Whether the appointment is in the future (drives the auto-pick). */
  isFuture: boolean;
  /** Visual variant. `icon` is a 44×44 square (used in cards). `block` is full-width (used in sheets). */
  variant?: Variant;
  /** Called after a successful inline phone save. */
  onPhoneSaved?: (newPhone: string) => void;
  /** Called after a reprogram link is issued (parent should refresh). */
  onReprogrammed?: () => void;
  /** Stop the parent click handler (when the WhatsApp icon is inside a card that's also tappable). */
  stopPropagation?: boolean;
  className?: string;
  testId?: string;
  /**
   * When set (and the turn is still active), tapping the button opens a
   * Notify / Reprogram menu instead of going straight to the reminder.
   * Reprogram issues a single-use link that MOVES this turn. Omit for
   * generic contact rows with no turn in context (legacy direct behavior).
   */
  appointmentId?: string | null;
};

const ACTIVE_FOR_REPROGRAM = ['scheduled', 'arrived', 'in_chair'];

/**
 * WhatsApp launcher. Without `appointmentId` it renders the legacy one-tap
 * `<a href="https://wa.me/...">` reminder. With `appointmentId` on an active
 * turn it opens a Notify / Reprogram menu: Notify sends the reminder as
 * before, Reprogram issues a single-use link that moves this turn.
 *
 * When `patientPhone` is empty, tapping opens a small "add the patient's
 * phone" dialog first; on save, the WhatsApp link opens in a new tab using
 * the freshly-saved number.
 */
export function WhatsappButton({
  patientPhone,
  patientId,
  context,
  templates,
  countryCode,
  dentistId,
  status,
  isFuture,
  variant = 'icon',
  onPhoneSaved,
  onReprogrammed,
  stopPropagation = false,
  className,
  testId = 'whatsapp-btn',
  appointmentId,
}: WhatsappButtonProps) {
  const locale = useLocale() as 'es' | 'en';
  const t = useTranslations('appointments');
  const tTp = useTranslations('turnPicker');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  const { forUser } = useWhatsapp();
  const [pending, startTransition] = useTransition();
  const [missingOpen, setMissingOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reprogramming, setReprogramming] = useState(false);
  /** Reprogram requested while the phone was missing — resume after save. */
  const [resumeReprogram, setResumeReprogram] = useState(false);

  const canReprogram =
    !!appointmentId && ACTIVE_FOR_REPROGRAM.includes(status);

  // If a dentist is specified, prefer their per-user override (falls back to
  // the clinic default). Otherwise use the clinic-wide config passed in.
  const effective =
    dentistId !== undefined && dentistId !== null
      ? forUser(dentistId)
      : { templates, countryCode };

  const { url, body } = useMemo(() => {
    const tpl = pickAutoTemplate(effective.templates, status, isFuture);
    const filled = fillTemplate(templateBody(tpl, locale), {
      patientName: context.patientName,
      weekday: weekdayFromClinicDate(context.clinicDate, locale),
      time: timeFromHhmm(context.startHhmm, locale),
      dentist: context.dentistName,
      reason: context.reason,
    });
    return {
      body: filled,
      url: waMeUrl(patientPhone, filled, effective.countryCode),
    };
  }, [
    effective.templates,
    effective.countryCode,
    status,
    isFuture,
    patientPhone,
    locale,
    context,
  ]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (stopPropagation) e.stopPropagation();
    if (!patientPhone) {
      e.preventDefault();
      setMissingOpen(true);
    }
  }

  function handleSave() {
    if (!typed.trim()) return;
    startTransition(async () => {
      const res = await updatePatientPhoneInline(patientId, typed.trim());
      if ('error' in res) {
        push({ title: tErr('generic'), variant: 'destructive' });
        return;
      }
      push({ title: t('whatsappSaved'), variant: 'success' });
      onPhoneSaved?.(res.phone);
      setMissingOpen(false);
      if (resumeReprogram) {
        setResumeReprogram(false);
        void runReprogram(res.phone);
        return;
      }
      // Open wa.me with the newly-saved number. Compute URL synchronously.
      const next = waMeUrl(res.phone, body, countryCode);
      if (next) window.open(next, '_blank', 'noopener,noreferrer');
    });
  }

  /** Issue (or reuse) the reprogram link and open it via WhatsApp. */
  async function runReprogram(phoneOverride?: string) {
    if (!appointmentId || reprogramming) return;
    const phone = phoneOverride ?? patientPhone;
    if (!phone) {
      // Capture the number first, then resume the reprogram after save.
      setResumeReprogram(true);
      setMenuOpen(false);
      setMissingOpen(true);
      return;
    }
    setReprogramming(true);
    try {
      const res = await createReprogramLink(appointmentId);
      if (!res.ok) {
        push({ title: t('whatsappReprogramError'), variant: 'destructive' });
        return;
      }
      const abs = `${window.location.origin}${res.url}`;
      const oldLabel = `${weekdayFromClinicDate(context.clinicDate, locale)} ${timeFromHhmm(context.startHhmm, locale)}`;
      const msg = tTp('reprogramWhatsappMessage', {
        name: context.patientName,
        old: oldLabel,
        link: abs,
      });
      openTurnPickerWhatsapp({
        phone,
        message: msg,
        countryCode: effective.countryCode,
      });
      setMenuOpen(false);
      onReprogrammed?.();
    } catch {
      push({ title: t('whatsappReprogramError'), variant: 'destructive' });
    } finally {
      setReprogramming(false);
    }
  }

  const label = t('whatsapp');
  const aria = `${t('whatsapp')} ${context.patientName}`;

  // No turn in context (or terminal turn): legacy one-tap reminder anchor.
  if (!canReprogram) {
    if (variant === 'icon') {
      return (
        <>
          <a
            href={url ?? '#'}
            onClick={handleClick}
            aria-label={aria}
            title={aria}
            data-testid={testId}
            target={url ? '_blank' : undefined}
            rel={url ? 'noopener noreferrer' : undefined}
            className={
              'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-emerald-600 active:bg-accent ' +
              (className ?? '')
            }
          >
            <MessageCircle className="h-5 w-5" />
          </a>
          <MissingPhoneDialog
            open={missingOpen}
            onOpenChange={setMissingOpen}
            patientName={context.patientName}
            value={typed}
            onValueChange={setTyped}
            onSave={handleSave}
            saving={pending}
            label={label}
          />
        </>
      );
    }

    // block variant — full-width row, used in AttendSheet
    return (
      <>
        <a
          href={url ?? '#'}
          onClick={handleClick}
          target={url ? '_blank' : undefined}
          rel={url ? 'noopener noreferrer' : undefined}
          data-testid={testId}
          className={
            'mt-2 flex min-h-[48px] items-center gap-2 rounded-xl border px-3 text-base font-medium text-emerald-600 active:bg-accent ' +
            (className ?? '')
          }
        >
          <MessageCircle className="h-5 w-5" />
          {label}
        </a>
        <MissingPhoneDialog
          open={missingOpen}
          onOpenChange={setMissingOpen}
          patientName={context.patientName}
          value={typed}
          onValueChange={setTyped}
          onSave={handleSave}
          saving={pending}
          label={label}
        />
      </>
    );
  }

  const triggerClassName =
    variant === 'icon'
      ? 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-emerald-600 active:bg-accent ' +
        (className ?? '')
      : 'mt-2 flex min-h-[48px] items-center gap-2 rounded-xl border px-3 text-base font-medium text-emerald-600 active:bg-accent ' +
        (className ?? '');

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation();
          setMenuOpen(true);
        }}
        aria-label={aria}
        title={aria}
        aria-haspopup="dialog"
        data-testid={testId}
        className={triggerClassName}
      >
        <MessageCircle className="h-5 w-5" />
        {variant === 'block' ? label : null}
      </button>
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
          <Dialog.Content
            className="fixed inset-x-0 bottom-0 z-[60] w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            data-testid="whatsapp-menu"
          >
            <div
              className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden"
              aria-hidden
            />
            <div className="flex items-center justify-between mb-3">
              <Dialog.Title className="text-lg font-semibold">
                {t('whatsappTitle')}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label={t('whatsappTitle')}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <div className="space-y-2">
              <a
                href={url ?? '#'}
                onClick={(e) => {
                  if (!patientPhone) {
                    e.preventDefault();
                    setMenuOpen(false);
                    setMissingOpen(true);
                  }
                }}
                target={url ? '_blank' : undefined}
                rel={url ? 'noopener noreferrer' : undefined}
                data-testid={`${testId}-notify`}
                className="flex min-h-[52px] items-center gap-3 rounded-xl border px-3 active:bg-accent"
              >
                <Bell className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-base font-medium">
                    {t('whatsappNotify')}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {t('whatsappNotifyDesc')}
                  </span>
                </span>
              </a>
              <button
                type="button"
                onClick={() => runReprogram()}
                disabled={reprogramming}
                data-testid={`${testId}-reprogram`}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3 text-left active:bg-accent disabled:opacity-60"
              >
                {reprogramming ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-emerald-600" />
                ) : (
                  <CalendarClock className="h-5 w-5 shrink-0 text-emerald-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium">
                    {t('whatsappReprogram')}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {t('whatsappReprogramDesc')}
                  </span>
                </span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <MissingPhoneDialog
        open={missingOpen}
        onOpenChange={(b) => {
          setMissingOpen(b);
          if (!b) setResumeReprogram(false);
        }}
        patientName={context.patientName}
        value={typed}
        onValueChange={setTyped}
        onSave={handleSave}
        saving={pending}
        label={label}
      />
    </>
  );

}

function MissingPhoneDialog({
  open,
  onOpenChange,
  patientName,
  value,
  onValueChange,
  onSave,
  saving,
  label,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  patientName: string;
  value: string;
  onValueChange: (s: string) => void;
  onSave: () => void;
  saving: boolean;
  label: string;
}) {
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[60] w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]">
          <div
            className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden"
            aria-hidden
          />
          <div className="flex items-center justify-between mb-3">
            <Dialog.Title className="text-lg font-semibold">
              {t('whatsappMissingPhoneTitle')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={tCommon('cancel')}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('whatsappMissingPhoneDesc', { name: patientName })}
          </p>
          <Label htmlFor="whatsapp-missing-phone" className="text-sm font-medium">
            {t('whatsappPhonePlaceholder')}
          </Label>
          <Input
            id="whatsapp-missing-phone"
            type="tel"
            inputMode="tel"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="+54 11 5555-5555"
            autoComplete="tel"
            className="mt-1"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline">{tCommon('cancel')}</Button>
            </Dialog.Close>
            <Button
              onClick={onSave}
              disabled={saving || !value.trim()}
              data-testid="whatsapp-save-phone"
            >
              {saving ? tCommon('loading') : label}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
