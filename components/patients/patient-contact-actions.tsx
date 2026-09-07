'use client';
import { Mail, Phone, MessageCircle } from 'lucide-react';
import { WhatsappButton } from '@/components/ui/whatsapp-button';
import { useWhatsapp } from '@/components/whatsapp-provider';

type PatientContactActionsProps = {
  patientId: string;
  patientName: string;
  phone: string | null;
  email: string | null;
  /** Optional: clinic date + HH:MM to fill the WhatsApp template. When
   *  omitted, the template will use the ISO date/HH:MM (browser-local) as
   *  a fallback — the patient detail page doesn't have a specific turn in
   *  context, so we accept the slight imprecision. */
  clinicDate?: string;
  startHhmm?: string;
  dentistName?: string | null;
  reason?: string | null;
  onPhoneSaved?: () => void;
  variant?: 'inline' | 'block';
};

/**
 * Compact contact row with `tel:`, `mailto:`, and `wa.me` actions. Used
 * inside the patient overview (server component) — itself is a small
 * client island so it can use the WhatsApp context and button.
 */
export function PatientContactActions({
  patientId,
  patientName,
  phone,
  email,
  clinicDate,
  startHhmm,
  dentistName,
  reason,
  onPhoneSaved,
  variant = 'inline',
}: PatientContactActionsProps) {
  const { countryCode, templates } = useWhatsapp();
  const containerClass =
    variant === 'block'
      ? 'flex flex-wrap items-center gap-2'
      : 'flex flex-wrap items-center gap-2';
  if (!phone && !email) return null;
  return (
    <div className={containerClass}>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-primary hover:underline"
          data-testid="patient-call"
        >
          <Phone className="h-4 w-4" />
          {phone}
        </a>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-primary hover:underline"
          data-testid="patient-mail"
        >
          <Mail className="h-4 w-4" />
          <span className="break-all">{email}</span>
        </a>
      ) : null}
      <WhatsappButton
        patientId={patientId}
        patientPhone={phone}
        context={{
          patientName,
          clinicDate: clinicDate ?? '',
          startHhmm: startHhmm ?? '',
          dentistName: dentistName ?? null,
          reason: reason ?? null,
        }}
        templates={templates}
        countryCode={countryCode}
        status="scheduled"
        isFuture={false}
        variant="icon"
        onPhoneSaved={onPhoneSaved}
        testId={`overview-whatsapp-${patientId}`}
      />
    </div>
  );
}
