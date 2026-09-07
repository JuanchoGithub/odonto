'use client';
import { useMemo, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations, useLocale } from 'next-intl';
import { X, MessageCircle, Sparkles, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import {
  fillTemplate,
  pickAutoTemplate,
  templateBody,
  templateLabel,
  weekdayFromClinicDate,
  timeFromHhmm,
  waMePhone,
  type WhatsappTemplate,
} from '@/lib/whatsapp';
import { updatePatientPhoneInline } from '@/server/actions/whatsapp';
import { useWhatsapp } from '@/components/whatsapp-provider';

type AttendTemplateSheetProps = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  context: {
    clinicDate: string;
    startHhmm: string;
    dentistName?: string | null;
    reason?: string | null;
  };
  status: string;
  isFuture: boolean;
  templates: WhatsappTemplate[];
  countryCode: string;
  /** Resolve this dentist's per-user override when set. */
  dentistId?: string | null;
  /** Called when WhatsApp opens (so the parent can also refresh). */
  onOpened?: (newPhone?: string) => void;
};

/**
 * Template picker for the AttendSheet. Filters templates by the appointment
 * context, highlights the auto-picked one, and offers a "custom message"
 * textarea at the bottom for free-form one-offs. When the patient has no
 * phone on file, falls back to the same inline "add phone" prompt the
 * WhatsApp button uses.
 */
export function AttendTemplateSheet({
  open,
  onOpenChange,
  patientId,
  patientName,
  patientPhone,
  context,
  status,
  isFuture,
  templates,
  countryCode,
  dentistId,
  onOpened,
}: AttendTemplateSheetProps) {
  const locale = useLocale() as 'es' | 'en';
  const t = useTranslations('appointments');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  const { forUser } = useWhatsapp();
  const [pending, startTransition] = useTransition();
  const [customBody, setCustomBody] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [typedPhone, setTypedPhone] = useState('');

  // Prefer the dentist's per-user override when the appointment has one.
  const effective =
    dentistId !== undefined && dentistId !== null
      ? forUser(dentistId)
      : { templates, countryCode };

  const filtered = useMemo(() => {
    const enabled = effective.templates.filter((tpl) => Number(tpl.enabled) === 1);
    // Match the auto-pick preference exactly: keep "any" templates plus
    // those whose `applies_to` matches the context, so the user is never
    // shown a confirmation template when the patient missed their turn.
    const past = isFuture === false || status === 'no_show' || status === 'cancelled';
    return enabled.filter((tpl) => {
      if (tpl.applies_to === 'any') return true;
      return past ? tpl.applies_to === 'past' : tpl.applies_to === 'upcoming';
    });
  }, [effective.templates, isFuture, status]);

  const auto = useMemo(
    () => pickAutoTemplate(effective.templates, status, isFuture),
    [effective.templates, status, isFuture],
  );

  function fillBody(body: string): string {
    return fillTemplate(body, {
      patientName,
      weekday: weekdayFromClinicDate(context.clinicDate, locale),
      time: timeFromHhmm(context.startHhmm, locale),
      dentist: context.dentistName,
      reason: context.reason,
    });
  }

  function openWaMe(phone: string, body: string) {
    const cleaned = waMePhone(phone, effective.countryCode);
    if (!cleaned) return;
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onOpened?.(phone);
    onOpenChange(false);
  }

  function handleTemplateClick(tpl: WhatsappTemplate) {
    if (!patientPhone) {
      setMissingOpen(true);
      return;
    }
    openWaMe(patientPhone, fillBody(templateBody(tpl, locale)));
  }

  function handleCustomSend() {
    if (!customBody.trim()) return;
    if (!patientPhone) {
      setMissingOpen(true);
      return;
    }
    openWaMe(patientPhone, customBody.trim());
  }

  function handleSavePhone() {
    if (!typedPhone.trim()) return;
    startTransition(async () => {
      const res = await updatePatientPhoneInline(patientId, typedPhone.trim());
      if ('error' in res) {
        push({ title: tErr('generic'), variant: 'destructive' });
        return;
      }
      push({ title: t('whatsappSaved'), variant: 'success' });
      onOpened?.(res.phone);
      setMissingOpen(false);
      setTypedPhone('');
    });
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]">
            <div
              className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden"
              aria-hidden
            />
            <div className="flex items-center justify-between mb-3">
              <Dialog.Title className="text-lg font-semibold">
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  {t('whatsappTitle')}
                </span>
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label={tCommon('cancel')}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {t('whatsappChooseTemplate')}
            </p>

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('emptyList')}
              </p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((tpl) => {
                  const isAuto = tpl.id === auto.id;
                  const filled = fillBody(templateBody(tpl, locale));
                  return (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        onClick={() => handleTemplateClick(tpl)}
                        data-testid={`wa-tpl-${tpl.id}`}
                        className={`flex w-full min-h-[56px] flex-col items-start gap-1 rounded-xl border p-3 text-left active:bg-accent ${
                          isAuto ? 'border-emerald-500/60 bg-emerald-500/5' : ''
                        }`}
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="text-sm font-semibold">
                            {templateLabel(tpl, locale)}
                          </span>
                          {isAuto ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
                              <Sparkles className="h-3 w-3" />
                              {t('whatsappAuto')}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {filled}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 border-t pt-3">
              {!customMode ? (
                <Button
                  variant="ghost"
                  onClick={() => setCustomMode(true)}
                  className="min-h-[44px] w-full"
                  data-testid="wa-custom-toggle"
                >
                  <Pencil className="h-4 w-4" />
                  {t('whatsappCustomMessage')}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder={t('whatsappCustomPlaceholder')}
                    rows={3}
                    data-testid="wa-custom-body"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCustomMode(false);
                        setCustomBody('');
                      }}
                      className="min-h-[44px] flex-1"
                    >
                      {tCommon('cancel')}
                    </Button>
                    <Button
                      onClick={handleCustomSend}
                      disabled={!customBody.trim()}
                      data-testid="wa-custom-send"
                      className="min-h-[44px] flex-1"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {t('whatsappSend')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={missingOpen} onOpenChange={setMissingOpen}>
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
            <input
              type="tel"
              inputMode="tel"
              value={typedPhone}
              onChange={(e) => setTypedPhone(e.target.value)}
              placeholder="+54 11 5555-5555"
              autoComplete="tel"
              data-testid="wa-missing-phone-input"
              className="flex h-10 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline">{tCommon('cancel')}</Button>
              </Dialog.Close>
              <Button
                onClick={handleSavePhone}
                disabled={pending || !typedPhone.trim()}
                data-testid="wa-missing-phone-save"
              >
                {pending ? tCommon('loading') : t('whatsappSend')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
