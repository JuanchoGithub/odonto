'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2, X, AlertTriangle } from 'lucide-react';
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRouter } from '@/lib/navigation';
import {
  saveWeeklySchedule,
  findOrphanedAppointments,
  saveClinicBusinessHours,
  addClinicException,
  deleteClinicException,
  addDentistException,
  deleteDentistException,
  type DentistScheduleRow,
  type DentistExceptionRow,
  type ClinicBusinessHoursRow,
  type ClinicExceptionRow,
} from '@/server/actions/dentist-schedules';

type Window = { day_of_week: number; start_time: string; end_time: string };

type Orphan = {
  id: string;
  starts_at: string;
  ends_at: string;
  patient_name: string;
};

type Decision = {
  action: 'reschedule' | 'cancel' | 'exception';
  new_starts_at: string;
  new_ends_at: string;
};

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function SchedulesClient({
  targetDentistId,
  isAdmin,
  weekly,
  exceptions,
  businessHours,
  clinicExceptions,
  dentists,
}: {
  targetDentistId: string;
  isAdmin: boolean;
  weekly: DentistScheduleRow[];
  exceptions: DentistExceptionRow[];
  businessHours: ClinicBusinessHoursRow[];
  clinicExceptions: ClinicExceptionRow[];
  dentists: { id: string; name: string }[];
}) {
  const t = useTranslations('schedules');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [windows, setWindows] = useState<Window[]>(
    weekly.map((w) => ({
      day_of_week: w.day_of_week,
      start_time: w.start_time,
      end_time: w.end_time,
    })),
  );
  const [bizWindows, setBizWindows] = useState<Window[]>(
    businessHours.map((b) => ({
      day_of_week: b.day_of_week,
      start_time: b.start_time,
      end_time: b.end_time,
    })),
  );
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function weekdayLabel(d: number) {
    return t(`weekdays.${d}` as 'weekdays.0');
  }

  function updateWindow(i: number, patch: Partial<Window>) {
    setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  }
  function removeWindow(i: number) {
    setWindows((ws) => ws.filter((_, j) => j !== i));
  }
  function addWindow(dow: number) {
    setWindows((ws) => [
      ...ws,
      { day_of_week: dow, start_time: '09:00', end_time: '13:00' },
    ]);
  }

  async function saveWeekly() {
    setSaving(true);
    setError(null);
    try {
      const proposed = windows.map((w) => ({
        day_of_week: w.day_of_week,
        start_min: toMin(w.start_time),
        end_min: toMin(w.end_time),
      }));
      const found = await findOrphanedAppointments(targetDentistId, proposed);
      if (found.length > 0) {
        setOrphans(found);
        setDecisions(
          Object.fromEntries(
            found.map((o) => [
              o.id,
              {
                action: 'cancel' as const,
                new_starts_at: '',
                new_ends_at: '',
              },
            ]),
          ),
        );
        return;
      }
      const res = await saveWeeklySchedule({
        dentist_id: targetDentistId,
        windows,
        decisions: {},
      });
      if (!res.ok) setError(res.error ?? 'error');
      else router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDecisions() {
    if (!orphans) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveWeeklySchedule({
        dentist_id: targetDentistId,
        windows,
        decisions: Object.fromEntries(
          Object.entries(decisions).map(([id, d]) => [
            id,
            {
              action: d.action,
              new_starts_at: d.new_starts_at || undefined,
              new_ends_at: d.new_ends_at || undefined,
            },
          ]),
        ),
      });
      if (!res.ok) {
        setError(t('needsDecisions', { count: res.orphanedCount ?? 0 }));
      } else {
        setOrphans(null);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveBiz() {
    setSaving(true);
    setError(null);
    try {
      const res = await saveClinicBusinessHours({ windows: bizWindows });
      if (!res.ok) setError(res.error ?? 'error');
      else router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Dentist selector for admins */}
      {isAdmin && dentists.length > 1 ? (
        <Card>
          <CardContent className="pt-6">
            <Label>{t('day')}</Label>
            <Select
              value={targetDentistId}
              onValueChange={(v) =>
                router.push(`/settings/schedules?dentist=${v}`)
              }
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
          </CardContent>
        </Card>
      ) : null}

      {/* Weekly schedule */}
      <Card data-testid="weekly-schedule">
        <CardHeader>
          <CardTitle className="text-base">{t('weekly')}</CardTitle>
          <CardDescription>
            {dentists.find((d) => d.id === targetDentistId)?.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const rows = windows
              .map((w, i) => ({ ...w, i }))
              .filter((w) => w.day_of_week === dow);
            return (
              <div key={dow} className="flex items-start gap-4 border-b pb-3" data-testid={`weekly-day-${dow}`}>
                <div className="w-28 pt-2 text-sm font-medium">
                  {weekdayLabel(dow)}
                </div>
                <div className="flex-1 space-y-2">
                  {rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground pt-2">—</div>
                  ) : (
                    rows.map((w) => (
                      <div key={w.i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={w.start_time}
                          onChange={(e) =>
                            updateWindow(w.i, { start_time: e.target.value })
                          }
                          className="w-28"
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={w.end_time}
                          onChange={(e) =>
                            updateWindow(w.i, { end_time: e.target.value })
                          }
                          className="w-28"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid="remove-window"
                          onClick={() => removeWindow(w.i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => addWindow(dow)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('addWindow')}
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button onClick={saveWeekly} disabled={saving}>
              {saving ? tCommon('loading') : tCommon('save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dentist exceptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dentistTimeOff')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exceptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tCommon('none')}</p>
          ) : (
            <ul className="space-y-2">
              {exceptions.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                >
                  <span>
                    <Badge
                      variant={
                        e.kind === 'time_off' ? 'secondary' : 'default'
                      }
                      className="mr-2"
                    >
                      {e.kind === 'time_off' ? t('timeOff') : t('customHours')}
                    </Badge>
                    {e.date}
                    {e.start_time && e.end_time
                      ? ` · ${e.start_time}–${e.end_time}`
                      : ''}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void deleteDentistException(e.id).then(() =>
                        router.refresh(),
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <AddExceptionForm
            dentistId={targetDentistId}
            onAdded={() => router.refresh()}
          />
        </CardContent>
      </Card>

      {/* Clinic business hours — admin only */}
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('clinicHours')}</CardTitle>
            <CardDescription>{t('clinicHoursDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const i = bizWindows.findIndex((w) => w.day_of_week === dow);
              const w = i >= 0 ? bizWindows[i] : null;
              return (
                <div key={dow} className="flex items-center gap-3">
                  <div className="w-28 text-sm font-medium">
                    {weekdayLabel(dow)}
                  </div>
                  {w ? (
                    <>
                      <Input
                        type="time"
                        value={w.start_time}
                        className="w-28"
                        onChange={(e) => {
                          const v = e.target.value;
                          setBizWindows((ws) =>
                            ws.map((x, j) =>
                              j === i ? { ...x, start_time: v } : x,
                            ),
                          );
                        }}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={w.end_time}
                        className="w-28"
                        onChange={(e) => {
                          const v = e.target.value;
                          setBizWindows((ws) =>
                            ws.map((x, j) =>
                              j === i ? { ...x, end_time: v } : x,
                            ),
                          );
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setBizWindows((ws) =>
                            ws.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() =>
                        setBizWindows((ws) => [
                          ...ws,
                          {
                            day_of_week: dow,
                            start_time: '09:00',
                            end_time: '18:00',
                          },
                        ])
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('addWindow')}
                    </Button>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end">
              <Button onClick={saveBiz} disabled={saving}>
                {saving ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Clinic exceptions — admin only */}
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('clinicHolidays')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {clinicExceptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tCommon('none')}</p>
            ) : (
              <ul className="space-y-2">
                {clinicExceptions.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                  >
                    <span>
                      {e.date}
                      {e.label ? ` · ${e.label}` : ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        void deleteClinicException(e.id).then(() =>
                          router.refresh(),
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <AddClinicHolidayForm onAdded={() => router.refresh()} />
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Orphan decision dialog */}
      <Dialog.Root open={!!orphans} onOpenChange={() => setOrphans(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <Dialog.Title className="text-lg font-semibold">
                {t('warnTitle')}
              </Dialog.Title>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{t('warnBody')}</p>
            <div className="space-y-4">
              {(orphans ?? []).map((o) => {
                const dec = decisions[o.id];
                const when = `${o.starts_at.slice(0, 10)} ${o.starts_at.slice(11, 16)}–${o.ends_at.slice(11, 16)}`;
                return (
                  <div key={o.id} className="border rounded-md p-3 space-y-2">
                    <p className="text-sm font-medium">
                      {o.patient_name} · <span className="text-muted-foreground">{when}</span>
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <Select
                        value={dec?.action ?? 'cancel'}
                        onValueChange={(v) =>
                          setDecisions((d) => ({
                            ...d,
                            [o.id]: {
                              ...(d[o.id] ?? {
                                action: 'cancel' as const,
                                new_starts_at: '',
                                new_ends_at: '',
                              }),
                              action: v as Decision['action'],
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reschedule">
                            {t('reschedule')}
                          </SelectItem>
                          <SelectItem value="cancel">{t('cancelAppt')}</SelectItem>
                          <SelectItem value="exception">
                            {t('keepException')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {dec?.action === 'reschedule' ? (
                        <>
                          <Input
                            type="datetime-local"
                            className="w-56"
                            value={dec.new_starts_at}
                            onChange={(e) =>
                              setDecisions((d) => ({
                                ...d,
                                [o.id]: { ...d[o.id], new_starts_at: e.target.value },
                              }))
                            }
                          />
                          <Input
                            type="datetime-local"
                            className="w-56"
                            value={dec.new_ends_at}
                            onChange={(e) =>
                              setDecisions((d) => ({
                                ...d,
                                [o.id]: { ...d[o.id], new_ends_at: e.target.value },
                              }))
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {error ? (
              <p className="text-sm text-destructive mt-3">{error}</p>
            ) : null}
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setOrphans(null)}>
                {tCommon('cancel')}
              </Button>
              <Button onClick={confirmDecisions} disabled={saving}>
                {saving ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function AddExceptionForm({
  dentistId,
  onAdded,
}: {
  dentistId: string;
  onAdded: () => void;
}) {
  const t = useTranslations('schedules');
  const tCommon = useTranslations('common');
  const [kind, setKind] = useState<'time_off' | 'custom_hours'>('time_off');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!date) return;
    setSaving(true);
    try {
      await addDentistException({
        dentist_id: dentistId,
        date,
        kind,
        start_time: kind === 'custom_hours' ? start : null,
        end_time: kind === 'custom_hours' ? end : null,
        reason: reason || null,
      });
      setDate('');
      setReason('');
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <div className="space-y-1">
        <Label className="text-xs">{t('day')}</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('reason')}</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-48"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">—</Label>
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as 'time_off' | 'custom_hours')}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="time_off">{t('timeOff')}</SelectItem>
            <SelectItem value="custom_hours">{t('customHours')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {kind === 'custom_hours' ? (
        <>
          <Input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-28"
          />
          <Input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-28"
          />
        </>
      ) : null}
      <Button onClick={submit} disabled={saving || !date} size="sm">
        {saving ? tCommon('loading') : t('addException')}
      </Button>
    </div>
  );
}

function AddClinicHolidayForm({ onAdded }: { onAdded: () => void }) {
  const t = useTranslations('schedules');
  const tCommon = useTranslations('common');
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!date) return;
    setSaving(true);
    try {
      await addClinicException({ date, kind: 'holiday', label: label || null });
      setDate('');
      setLabel('');
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <div className="space-y-1">
        <Label className="text-xs">{t('day')}</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('label')}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-64"
        />
      </div>
      <Button onClick={submit} disabled={saving || !date} size="sm">
        {saving ? tCommon('loading') : t('addHoliday')}
      </Button>
    </div>
  );
}
