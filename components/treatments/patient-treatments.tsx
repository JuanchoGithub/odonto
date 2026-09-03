'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { createTreatment, type TreatmentRow } from '@/server/actions/treatments';
import { useRouter } from '@/lib/navigation';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { AppLocale, Currency } from '@/lib/schemas/common';

export function PatientTreatments({
  patientId,
  currency,
  locale,
}: {
  patientId: string;
  currency: Currency;
  locale: AppLocale;
}) {
  const t = useTranslations('treatments');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [list, setList] = useState<TreatmentRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    const res = await fetch(`/api/treatments?patient_id=${patientId}`);
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('new')}
        </Button>
      </CardHeader>
      <CardContent>
        <TreatmentsTable
          patientId={patientId}
          currency={currency}
          locale={locale}
          list={list}
          onRefresh={refresh}
        />
        <TreatmentDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) refresh();
          }}
          patientId={patientId}
        />
      </CardContent>
    </Card>
  );
}

function TreatmentsTable({
  patientId,
  currency,
  locale,
  list,
  onRefresh,
}: {
  patientId: string;
  currency: Currency;
  locale: AppLocale;
  list: TreatmentRow[] | null;
  onRefresh: () => void;
}) {
  const t = useTranslations('treatments');
  const tCommon = useTranslations('common');
  const [rows, setRows] = useState<TreatmentRow[] | null>(list);
  const [loading, setLoading] = useState(false);

  if (list && list !== rows) setRows(list);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/treatments?patient_id=${patientId}`)
      .then((r) => r.json())
      .then((data) => mounted && setRows(data));
    return () => {
      mounted = false;
    };
  }, [patientId]);

  if (!rows) return <p className="text-sm text-muted-foreground">…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">—</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-4">{t('description')}</th>
            <th className="py-2 pr-4">{t('tooth')}</th>
            <th className="py-2 pr-4">{t('cost')}</th>
            <th className="py-2 pr-4">{t('code')}</th>
            <th className="py-2 pr-4">{tCommon('status')}</th>
            <th className="py-2 pr-4">{tCommon('date')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2 pr-4">{r.description}</td>
              <td className="py-2 pr-4">{r.tooth_number ?? '—'}</td>
              <td className="py-2 pr-4">{formatMoney(r.cost_cents, currency, locale)}</td>
              <td className="py-2 pr-4">{r.code ?? '—'}</td>
              <td className="py-2 pr-4">
                <Badge
                  variant={
                    r.status === 'done'
                      ? 'success'
                      : r.status === 'cancelled'
                        ? 'destructive'
                        : r.status === 'in_progress'
                          ? 'warning'
                          : 'secondary'
                  }
                >
                  {t(`status.${r.status}` as any)}
                </Badge>
              </td>
              <td className="py-2 pr-4">
                {r.performed_at ? formatDateTime(r.performed_at, locale) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TreatmentDialog({
  open,
  onOpenChange,
  patientId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  patientId: string;
}) {
  const t = useTranslations('treatments');
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set('patient_id', patientId);
    await createTreatment(fd);
    setLoading(false);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">{t('new')}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">{t('description')}</Label>
              <Textarea id="description" name="description" required rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="tooth_number">{t('tooth')}</Label>
                <Input
                  id="tooth_number"
                  name="tooth_number"
                  type="number"
                  min={0}
                  max={48}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">{t('code')}</Label>
                <Input id="code" name="code" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">{t('cost')}</Label>
                <Input
                  id="cost"
                  name="cost"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={0}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tCommon('status')}</Label>
              <Select name="status" defaultValue="planned">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">{t('status.planned')}</SelectItem>
                  <SelectItem value="in_progress">{t('status.in_progress')}</SelectItem>
                  <SelectItem value="done">{t('status.done')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  {tCommon('cancel')}
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading}>
                {loading ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
