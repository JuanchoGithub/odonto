'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { X, Phone, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/lib/navigation';
import { dentistColor } from '@/lib/colors';
import {
  updateAppointmentStatus,
  type ApptRow,
} from '@/server/actions/appointments';
import { useToast } from '@/components/ui/toaster';

const FLOW = ['scheduled', 'arrived', 'in_chair', 'completed'] as const;

export function AttendSheet({
  appointment,
  open,
  onOpenChange,
  onAdvanced,
}: {
  appointment: ApptRow | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onAdvanced?: () => void;
}) {
  const t = useTranslations('appointments');
  const tPatients = useTranslations('patients');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  const [saving, setSaving] = useState(false);

  if (!appointment) return null;
  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const idx = FLOW.indexOf(appointment.status as (typeof FLOW)[number]);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  async function advance() {
    if (!next) return;
    setSaving(true);
    try {
      const res = await updateAppointmentStatus(appointment!.id, next);
      if (res && 'error' in res) {
        push({ title: tErr('generic'), variant: 'destructive' });
        return;
      }
      push({ title: t(`status.${next}`), variant: 'success' });
      if (onAdvanced) onAdvanced();
      // Keep the sheet open with fresh state after parent refreshes; close
      // when the visit is completed.
      if (next === 'completed') onOpenChange(false);
    } catch {
      push({ title: tErr('generic'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-3">
            <Dialog.Title className="text-lg font-semibold">
              {t('attendTitle')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label={tCommon('cancel')}>
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex items-center gap-3 rounded-xl border p-3">
            <span
              aria-hidden
              className="h-10 w-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor: dentistColor(
                  appointment.dentist_color,
                  appointment.dentist_id,
                ),
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">
                {appointment.patient_name}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(start, 'EEE d MMM · HH:mm')}–{format(end, 'HH:mm')} ·{' '}
                {appointment.dentist_name}
              </div>
              {appointment.reason ? (
                <div className="truncate text-sm">{appointment.reason}</div>
              ) : null}
            </div>
            <Badge variant="default">{t(`status.${appointment.status}`)}</Badge>
          </div>

          {appointment.patient_phone ? (
            <a
              href={`tel:${appointment.patient_phone}`}
              className="mt-2 flex min-h-[48px] items-center gap-2 rounded-xl border px-3 text-base font-medium text-primary active:bg-accent"
            >
              <Phone className="h-5 w-5" />
              {t('call')} · {appointment.patient_phone}
            </a>
          ) : null}

          {next ? (
            <Button
              size="lg"
              onClick={advance}
              disabled={saving}
              className="mt-3 min-h-[52px] w-full text-base"
              data-testid="attend-advance"
            >
              {saving
                ? tCommon('loading')
                : `${t('advanceTo')} · ${t(`status.${next}`)}`}
            </Button>
          ) : null}

          <div className="mt-2 grid grid-cols-1 gap-2">
            <Link
              href={`/patients/${appointment.patient_id}?tab=odontogram`}
              className="flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-base font-medium active:bg-accent"
              onClick={() => onOpenChange(false)}
            >
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1">{t('openChart')}</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              href={`/patients/${appointment.patient_id}?tab=treatments`}
              className="flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-base font-medium active:bg-accent"
              onClick={() => onOpenChange(false)}
            >
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1">{tPatients('tabs.treatments')}</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
