'use client';
import { useState, useTransition, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations, useLocale } from 'next-intl';
import { MessageCircle, X } from 'lucide-react';
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
import { updatePatientPhoneInline } from '@/server/actions/whatsapp';

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
  /** Stop the parent click handler (when the WhatsApp icon is inside a card that's also tappable). */
  stopPropagation?: boolean;
  className?: string;
  testId?: string;
};

/**
 * One-tap WhatsApp launcher. Renders an `<a href="https://wa.me/...">` that
 * opens WhatsApp (mobile app or WhatsApp Web) with a pre-filled message. The
 * template is auto-picked from `templates` based on `status`/`isFuture` so
 * the wrong default is never loaded.
 *
 * When `patientPhone` is empty, tapping the button opens a small
 * "add the patient's phone" dialog first; on save, the WhatsApp link opens
 * in a new tab using the freshly-saved number.
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
  stopPropagation = false,
  className,
  testId = 'whatsapp-btn',
}: WhatsappButtonProps) {
  const locale = useLocale() as 'es' | 'en';
  const t = useTranslations('appointments');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  const { forUser } = useWhatsapp();
  const [pending, startTransition] = useTransition();
  const [missingOpen, setMissingOpen] = useState(false);
  const [typed, setTyped] = useState('');

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
      // Open wa.me with the newly-saved number. Compute URL synchronously.
      const next = waMeUrl(res.phone, body, countryCode);
      if (next) window.open(next, '_blank', 'noopener,noreferrer');
    });
  }

  const label = t('whatsapp');
  const aria = `${t('whatsapp')} ${context.patientName}`;

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
