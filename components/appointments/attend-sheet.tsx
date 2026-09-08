'use client';
import { useState, useMemo, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { X, Phone, FileText, ChevronRight, MessageCircle, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/lib/navigation';
import { dentistColor } from '@/lib/colors';
import {
  updateAppointmentStatus,
  type ApptRow,
} from '@/server/actions/appointments';
import {
  previewVisitInvoice,
  buildVisitInvoice,
  type VisitPreview,
} from '@/server/actions/billing';
import { createTreatment } from '@/server/actions/treatments';
import { useToast } from '@/components/ui/toaster';
import { AttendTemplateSheet } from './attend-template-sheet';
import { useWhatsapp } from '@/components/whatsapp-provider';

function fmtArs(cents: number) {
  return `$ ${(cents / 100).toLocaleString('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}

const FLOW = ['scheduled', 'arrived', 'in_chair', 'completed'] as const;

export function AttendSheet({
  appointment,
  open,
  onOpenChange,
  onAdvanced,
  clinicDate,
  startHhmm,
  onRefresh,
}: {
  appointment: ApptRow | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onAdvanced?: () => void;
  /** Clinic-local YYYY-MM-DD. Required for WhatsApp template rendering. */
  clinicDate?: string;
  /** Clinic-local HH:MM. Required for WhatsApp template rendering. */
  startHhmm?: string;
  /** Optional callback when WhatsApp updated the patient phone so the parent can refresh. */
  onRefresh?: () => void;
}) {
  const t = useTranslations('appointments');
  const tPatients = useTranslations('patients');
  const tCommon = useTranslations('common');
  const tErr = useTranslations('errors');
  const { push } = useToast();
  const { countryCode, templates } = useWhatsapp();
  const [saving, setSaving] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  const effectiveClinicDate = useMemo(() => {
    if (clinicDate) return clinicDate;
    if (!appointment) return '';
    // Fallback: derive from ISO date portion (UTC slice — only used when
    // the caller didn't supply clinic-local fields).
    return appointment.starts_at.slice(0, 10);
  }, [clinicDate, appointment]);
  const effectiveStartHhmm = useMemo(() => {
    if (startHhmm) return startHhmm;
    if (!appointment) return '';
    return appointment.starts_at.slice(11, 16);
  }, [startHhmm, appointment]);
  const isFuture = useMemo(
    () => (appointment ? Date.parse(appointment.starts_at) > Date.now() : false),
    [appointment],
  );

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

          <button
            type="button"
            onClick={() => setWaOpen(true)}
            data-testid="attend-whatsapp"
            className="mt-2 flex w-full min-h-[48px] items-center gap-2 rounded-xl border px-3 text-base font-medium text-emerald-600 active:bg-accent"
          >
            <MessageCircle className="h-5 w-5" />
            {t('whatsapp')}
          </button>

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

          {appointment.status !== 'cancelled' && appointment.status !== 'no_show' ? (
            <VisitBilling
              appointment={appointment}
              open={open}
              onBilled={onAdvanced}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
      <AttendTemplateSheet
        open={waOpen}
        onOpenChange={setWaOpen}
        patientId={appointment.patient_id}
        patientName={appointment.patient_name}
        patientPhone={appointment.patient_phone}
        context={{
          clinicDate: effectiveClinicDate,
          startHhmm: effectiveStartHhmm,
          dentistName: appointment.dentist_name,
          reason: appointment.reason,
        }}
        status={appointment.status}
        isFuture={isFuture}
        templates={templates}
        countryCode={countryCode}
        dentistId={appointment.dentist_id}
        onOpened={onRefresh}
      />
    </Dialog.Root>
  );
}

type CatalogOption = {
  id: string;
  code: string | null;
  description: string;
  default_price_cents: number;
  tax_kind: string;
  is_definitive: number;
};

function VisitBilling({
  appointment,
  open,
  onBilled,
}: {
  appointment: ApptRow;
  open: boolean;
  onBilled?: () => void;
}) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const { push } = useToast();
  const [preview, setPreview] = useState<VisitPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [billing, setBilling] = useState(false);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [q, setQ] = useState('');
  const [price, setPrice] = useState('');
  const [adding, setAdding] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const p = await previewVisitInvoice(appointment.id);
      if (!('error' in p)) setPreview(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      refresh();
      fetch('/api/catalog')
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setCatalog(Array.isArray(rows) ? rows : []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment.id, appointment.status]);

  async function bill() {
    setBilling(true);
    try {
      const res = await buildVisitInvoice(appointment.id);
      if ('error' in res) {
        push({ title: res.error, variant: 'destructive' });
      } else {
        push({ title: t('billed'), variant: 'success' });
        await refresh();
        if (onBilled) onBilled();
      }
    } finally {
      setBilling(false);
    }
  }

  async function addTreatment(opt: CatalogOption | null) {
    const desc = opt?.description ?? q.trim();
    if (!desc) return;
    const rawPrice = price.trim() === '' ? (opt ? opt.default_price_cents / 100 : 0) : Number(price.replace(',', '.'));
    if (!Number.isFinite(rawPrice) || rawPrice < 0) return;
    setAdding(true);
    try {
      const fd = new FormData();
      fd.set('patient_id', appointment.patient_id);
      fd.set('appointment_id', appointment.id);
      fd.set('description', desc);
      if (opt?.code) fd.set('code', opt.code);
      fd.set('cost', String(rawPrice));
      fd.set('tax_kind', opt?.tax_kind ?? 'standard');
      fd.set('status', 'done');
      const res = await createTreatment(fd);
      if (res && 'error' in res) {
        push({ title: String(res.error), variant: 'destructive' });
      } else {
        setQ('');
        setPrice('');
        await refresh();
      }
    } finally {
      setAdding(false);
    }
  }

  const filtered = q.trim()
    ? catalog.filter((c) => c.description.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
    : catalog.filter((c) => c.is_definitive).slice(0, 6);

  return (
    <div className="mt-3 rounded-xl border p-3" data-testid="visit-billing">
      <div className="mb-2 flex items-center gap-2 text-base font-semibold">
        <Receipt className="h-5 w-5 text-muted-foreground" />
        {t('billVisit')}
      </div>
      {loading || !preview ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : preview.already_invoiced ? (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="success">{t('billed')}</Badge>
          <Link
            href={`/billing/${preview.invoice_id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('viewInvoice')}
          </Link>
        </div>
      ) : (
        <>
          {preview.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('nothingToBill')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {preview.lines.map((l) => (
                <li key={l.treatment_id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {l.description}
                    {l.bundled ? ` · ${t('included')}` : ''}
                  </span>
                  <span className="shrink-0 font-medium">{fmtArs(l.total_cents)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 border-t pt-1 font-semibold">
                <span>{tCommon('total')}</span>
                <span>{fmtArs(preview.total_cents)}</span>
              </li>
            </ul>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{t('vatIncluded')}</p>
          {preview.lines.length > 0 ? (
            <Button
              size="lg"
              onClick={bill}
              disabled={billing}
              className="mt-2 min-h-[52px] w-full text-base"
              data-testid="visit-bill"
            >
              {billing ? tCommon('loading') : `${t('billVisit')} · ${fmtArs(preview.total_cents)}`}
            </Button>
          ) : null}
        </>
      )}
      {!preview?.already_invoiced ? (
        <div className="mt-3 border-t pt-3">
          <Label className="text-xs">{t('addTreatment')}</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('treatmentPlaceholder')}
              className="min-h-[44px]"
            />
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="50000"
              inputMode="decimal"
              className="min-h-[44px] w-28"
            />
          </div>
          {filtered.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => addTreatment(c)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border px-2 text-left text-sm active:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {c.description}
                      {c.is_definitive ? '' : ` · ${t('provisional')}`}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{fmtArs(c.default_price_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {q.trim() ? (
            <Button
              size="sm"
              variant="outline"
              disabled={adding}
              onClick={() => addTreatment(null)}
              className="mt-1 min-h-[44px]"
            >
              {t('addCustom', { name: q.trim() })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
