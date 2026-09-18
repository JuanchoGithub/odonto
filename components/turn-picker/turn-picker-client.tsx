'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Clock, Loader2 } from 'lucide-react';
import { wallClock } from '@/lib/store/time';
import { agendaEndDate } from '@/lib/agenda-horizon';

type Slot = { start: string; end: string; date: string };

type Props = {
  token: string;
  patientName: string;
  dentistName: string;
  slotMinutes: number;
  expiresAt: string;
  locale: 'es' | 'en';
  /** Clinic IANA timezone — slot times render in clinic wall-clock. */
  clinicTz?: string;
  /** Per-dentist manual agenda anchor (clinic-local YYYY-MM-DD, null = none). */
  manualUntil?: string | null;
  /** 'reprogram' moves the existing turn (dentist + duration locked). */
  purpose?: 'create' | 'reprogram';
  oldStartsAt?: string;
  oldEndsAt?: string;
};

const T = {
  es: {
    title: 'Reservá tu turno',
    reprogramTitle: 'Reprogramá tu turno',
    subtitle: (p: string, d: string, m: number) =>
      `${p} — turno de ${m} minutos con ${d}`,
    reprogramSubtitle: (p: string, d: string, m: number) =>
      `${p} — mové tu turno de ${m} minutos con ${d} a un nuevo horario`,
    oldTurn: (when: string) => `Tu turno actual: ${when}`,
    pickDay: 'Elegí un día',
    pickTime: 'Elegí un horario',
    noSlots: 'No hay horarios disponibles en los próximos días',
    confirm: 'Confirmar turno',
    reprogramConfirm: 'Mover turno',
    confirming: 'Reservando…',
    reprogramConfirming: 'Moviendo…',
    booked: (when: string) => `¡Listo! Tu turno quedó reservado para ${when}`,
    reprogramBooked: (when: string) => `¡Listo! Tu turno se movió para ${when}`,
    conflict:
      'Ese horario ya no está disponible. Elegí otro.',
    expired: 'Este enlace expiró',
    consumed: 'Este enlace ya fue utilizado',
    revoked: 'Este enlace fue revocado',
    error: 'Algo salió mal. Intentá de nuevo o contactá a la clínica.',
    loading: 'Cargando disponibilidad…',
    expires: (d: string) => `Este enlace vence el ${d}`,
    backToDays: '← Cambiar día',
    weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    months: [
      'enero','febrero','marzo','abril','mayo','junio',
      'julio','agosto','septiembre','octubre','noviembre','diciembre',
    ],
  },
  en: {
    title: 'Book your appointment',
    reprogramTitle: 'Reschedule your appointment',
    subtitle: (p: string, d: string, m: number) =>
      `${p} — ${m}-minute appointment with ${d}`,
    reprogramSubtitle: (p: string, d: string, m: number) =>
      `${p} — move your ${m}-minute appointment with ${d} to a new time`,
    oldTurn: (when: string) => `Your current appointment: ${when}`,
    pickDay: 'Pick a day',
    pickTime: 'Pick a time',
    noSlots: 'No available slots in the next days',
    confirm: 'Confirm appointment',
    reprogramConfirm: 'Move appointment',
    confirming: 'Booking…',
    reprogramConfirming: 'Moving…',
    booked: (when: string) => `Done! Your appointment is booked for ${when}`,
    reprogramBooked: (when: string) => `Done! Your appointment was moved to ${when}`,
    conflict: 'That slot is no longer available. Pick another.',
    expired: 'This link expired',
    consumed: 'This link has already been used',
    revoked: 'This link was revoked',
    error: 'Something went wrong. Try again or contact the clinic.',
    loading: 'Loading availability…',
    expires: (d: string) => `This link expires on ${d}`,
    backToDays: '← Change day',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December',
    ],
  },
} as const;

function dayLabel(date: string, locale: 'es' | 'en'): string {
  const d = new Date(date + 'T00:00:00');
  const t = T[locale];
  return `${t.weekdays[d.getDay()]} ${d.getDate()} ${t.months[d.getMonth()]}`;
}

function timeLabel(iso: string, tz?: string): string {
  if (tz) {
    const w = wallClock(iso, tz);
    if (w.hhmm) return w.hhmm;
  }
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Clinic-local YYYY-MM-DD for an instant (slice(0,10) is the UTC date). */
function clinicDay(iso: string, tz?: string): string {
  if (tz) {
    const w = wallClock(iso, tz);
    if (w.date) return w.date;
  }
  return iso.slice(0, 10);
}

export function TurnPickerClient({
  token,
  patientName,
  dentistName,
  slotMinutes,
  expiresAt,
  locale,
  clinicTz,
  manualUntil,
  purpose,
  oldStartsAt,
}: Props) {
  const t = T[locale];
  const isReprogram = purpose === 'reprogram';
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [state, setState] = useState<
    'idle' | 'booking' | 'booked' | 'conflict' | 'expired' | 'consumed' | 'revoked' | 'error'
  >('idle');
  const [bookedLabel, setBookedLabel] = useState('');

  // Agenda horizon: 14-day base, automatic month-end anchor once past
  // the 15th, manual per-dentist opening — resolved on clinic-local today
  // so the window matches the server's wall-clock (never browser TZ).
  function range(): { from: string; to: string } {
    const nowIso = new Date().toISOString();
    const from = clinicTz ? wallClock(nowIso, clinicTz).date || nowIso.slice(0, 10) : nowIso.slice(0, 10);
    return { from, to: agendaEndDate(from, manualUntil) };
  }

  useEffect(() => {
    const { from, to } = range();
    fetch(
      `/api/turn-picker/${encodeURIComponent(token)}/availability?from=${from}&to=${to}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch'))))
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clinicTz, manualUntil]);

  const days = useMemo(() => {
    if (!slots) return [];
    const seen = new Set<string>();
    for (const s of slots) seen.add(s.date);
    return [...seen].sort();
  }, [slots]);

  const daySlots = useMemo(
    () => (slots && selectedDate ? slots.filter((s) => s.date === selectedDate) : []),
    [slots, selectedDate],
  );

  async function confirm() {
    if (!selectedSlot) return;
    setState('booking');
    let data: { startsAt?: string; error?: string };
    try {
      const r = await fetch(
        `/api/turn-picker/${encodeURIComponent(token)}/book`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotStart: selectedSlot }),
        },
      );
      try {
        data = await r.json();
      } catch {
        setState('error');
        return;
      }
      if (r.ok && data.startsAt) {
        const label = `${dayLabel(
          clinicDay(data.startsAt, clinicTz),
          locale,
        )} · ${timeLabel(data.startsAt, clinicTz)}`;
        setBookedLabel(label);
        setState('booked');
      } else if (data.error === 'slot_unavailable' || data.error === 'conflict') {
        setState('conflict');
        // Refresh availability to hide the taken slot.
        setSlots(null);
        setSelectedSlot(null);
        const { from, to } = range();
        const rr = await fetch(
          `/api/turn-picker/${encodeURIComponent(token)}/availability?from=${from}&to=${to}`,
        );
        if (rr.ok) {
          const dd = await rr.json();
          setSlots(dd.slots ?? []);
        }
      } else if (data.error === 'expired') {
        setState('expired');
      } else if (data.error === 'consumed') {
        setState('consumed');
      } else if (data.error === 'revoked') {
        setState('revoked');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  if (state === 'booked') {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <CalendarCheck className="h-12 w-12 mx-auto text-primary" />
          <p className="text-lg font-semibold">{isReprogram ? t.reprogramBooked(bookedLabel) : t.booked(bookedLabel)}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-28 sm:pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isReprogram ? t.reprogramTitle : t.title}</h1>
        <p className="text-muted-foreground mt-1">
          {isReprogram
            ? t.reprogramSubtitle(patientName, dentistName, slotMinutes)
            : t.subtitle(patientName, dentistName, slotMinutes)}
        </p>
        {isReprogram && oldStartsAt ? (
          <p className="mt-1">
            <Badge variant="secondary">
              {t.oldTurn(
                `${dayLabel(clinicDay(oldStartsAt, clinicTz), locale)} · ${timeLabel(oldStartsAt, clinicTz)}`,
              )}
            </Badge>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-1">
          {t.expires(dayLabel(clinicDay(expiresAt, clinicTz), locale))}
        </p>
      </div>

      {slots === null ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.loading}
        </div>
      ) : slots.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {t.noSlots}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {!selectedDate ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.pickDay}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {days.map((d) => (
                  <Button
                    key={d}
                    variant="outline"
                    onClick={() => {
                      setSelectedDate(d);
                      setSelectedSlot(null);
                    }}
                    className="min-h-[52px] text-base"
                  >
                    {dayLabel(d, locale)}
                  </Button>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  {t.pickTime}
                  <Badge variant="secondary">{dayLabel(selectedDate, locale)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {daySlots.map((s) => (
                    <Button
                      key={s.start}
                      variant={selectedSlot === s.start ? 'default' : 'outline'}
                      className="min-h-[52px] gap-1 text-base"
                      aria-pressed={selectedSlot === s.start}
                      onClick={() => setSelectedSlot(s.start)}
                    >
                      <Clock className="h-4 w-4" />
                      {timeLabel(s.start, clinicTz)}
                    </Button>
                  ))}
                </div>
                <div className="flex min-h-[48px] items-center">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelectedDate(null);
                      setSelectedSlot(null);
                    }}
                    className="min-h-[48px]"
                  >
                    {t.backToDays}
                  </Button>
                </div>
                {state === 'conflict' ? (
                  <p className="text-sm text-destructive">{t.conflict}</p>
                ) : null}
                {state === 'expired' ? (
                  <p className="text-sm text-destructive">{t.expired}</p>
                ) : null}
                {state === 'consumed' ? (
                  <p className="text-sm text-destructive">{t.consumed}</p>
                ) : null}
                {state === 'revoked' ? (
                  <p className="text-sm text-destructive">{t.revoked}</p>
                ) : null}
                {state === 'error' ? (
                  <p className="text-sm text-destructive">{t.error}</p>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {/* Sticky confirm bar: thumb-reachable, safe-area padded. */}
      {selectedDate && selectedSlot ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-2xl items-center gap-3 p-3 pb-safe">
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-semibold">
                {dayLabel(selectedDate, locale)}
              </div>
              <div className="text-muted-foreground">
                {timeLabel(selectedSlot, clinicTz)} · {slotMinutes} min
              </div>
            </div>
            <Button
              size="lg"
              disabled={state === 'booking'}
              onClick={confirm}
              className="min-h-[52px] flex-1 text-base"
            >
              {state === 'booking'
                ? isReprogram
                  ? t.reprogramConfirming
                  : t.confirming
                : isReprogram
                  ? t.reprogramConfirm
                  : t.confirm}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
