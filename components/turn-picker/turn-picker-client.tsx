'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Clock, Loader2 } from 'lucide-react';

type Slot = { start: string; end: string; date: string };

type Props = {
  token: string;
  patientName: string;
  dentistName: string;
  slotMinutes: number;
  expiresAt: string;
  locale: 'es' | 'en';
};

const T = {
  es: {
    title: 'Reservá tu turno',
    subtitle: (p: string, d: string, m: number) =>
      `${p} — turno de ${m} minutos con ${d}`,
    pickDay: 'Elegí un día',
    pickTime: 'Elegí un horario',
    noSlots: 'No hay horarios disponibles en los próximos días',
    confirm: 'Confirmar turno',
    confirming: 'Reservando…',
    booked: (when: string) => `¡Listo! Tu turno quedó reservado para ${when}`,
    conflict:
      'Ese horario ya no está disponible. Elegí otro.',
    expired: 'Este enlace expiró',
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
    subtitle: (p: string, d: string, m: number) =>
      `${p} — ${m}-minute appointment with ${d}`,
    pickDay: 'Pick a day',
    pickTime: 'Pick a time',
    noSlots: 'No available slots in the next days',
    confirm: 'Confirm appointment',
    confirming: 'Booking…',
    booked: (when: string) => `Done! Your appointment is booked for ${when}`,
    conflict: 'That slot is no longer available. Pick another.',
    expired: 'This link expired',
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

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TurnPickerClient({
  token,
  patientName,
  dentistName,
  slotMinutes,
  expiresAt,
  locale,
}: Props) {
  const t = T[locale];
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [state, setState] = useState<
    'idle' | 'booking' | 'booked' | 'conflict' | 'error'
  >('idle');
  const [bookedLabel, setBookedLabel] = useState('');

  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const endD = new Date(now.getTime() + 14 * 86400_000);
    const to = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`;
    fetch(
      `/api/turn-picker/${encodeURIComponent(token)}/availability?from=${from}&to=${to}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch'))))
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]));
  }, [token]);

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
    try {
      const r = await fetch(
        `/api/turn-picker/${encodeURIComponent(token)}/book`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotStart: selectedSlot }),
        },
      );
      const data = await r.json();
      if (r.ok && data.startsAt) {
        const label = `${dayLabel(
          data.startsAt.slice(0, 10),
          locale,
        )} · ${timeLabel(data.startsAt)}`;
        setBookedLabel(label);
        setState('booked');
      } else if (data.error === 'slot_unavailable' || data.error === 'conflict') {
        setState('conflict');
        // Refresh availability to hide the taken slot.
        setSlots(null);
        setSelectedSlot(null);
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const endD = new Date(now.getTime() + 14 * 86400_000);
        const to = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`;
        const rr = await fetch(
          `/api/turn-picker/${encodeURIComponent(token)}/availability?from=${from}&to=${to}`,
        );
        if (rr.ok) {
          const dd = await rr.json();
          setSlots(dd.slots ?? []);
        }
      } else if (data.error === 'expired' || data.error === 'consumed') {
        setState('error');
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
          <p className="text-lg font-semibold">{t.booked(bookedLabel)}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-28 sm:pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground mt-1">
          {t.subtitle(patientName, dentistName, slotMinutes)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t.expires(dayLabel(expiresAt.slice(0, 10), locale))}
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
              <CardContent className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {days.map((d) => (
                  <Button
                    key={d}
                    variant="outline"
                    onClick={() => {
                      setSelectedDate(d);
                      setSelectedSlot(null);
                    }}
                    className="min-h-[52px] shrink-0 px-4 text-base"
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
                      {timeLabel(s.start)}
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
                {state === 'error' ? (
                  <p className="text-sm text-destructive">{t.expired}</p>
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
                {timeLabel(selectedSlot)} · {slotMinutes} min
              </div>
            </div>
            <Button
              size="lg"
              disabled={state === 'booking'}
              onClick={confirm}
              className="min-h-[52px] flex-1 text-base"
            >
              {state === 'booking' ? t.confirming : t.confirm}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
