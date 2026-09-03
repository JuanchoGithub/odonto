'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { createInvoice, type InvoiceFormState } from '@/server/actions/billing';
import { useActionState } from 'react';
import { useRouter } from '@/lib/navigation';
import { formatMoney, formatDate } from '@/lib/format';
import { Link } from '@/lib/navigation';
import { Badge } from '@/components/ui/badge';
import type { AppLocale, Currency } from '@/lib/schemas/common';

export function PatientInvoices({
  patientId,
  currency,
  locale,
}: {
  patientId: string;
  currency: Currency;
  locale: AppLocale;
}) {
  const t = useTranslations('billing');
  const [open, setOpen] = useState(false);
  const router = useRouter();

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
          {t('newInvoice')}
        </Button>
      </CardHeader>
      <CardContent>
        <InvoicesList patientId={patientId} currency={currency} locale={locale} />
        <NewInvoiceDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) router.refresh();
          }}
          patientId={patientId}
          currency={currency}
          locale={locale}
        />
      </CardContent>
    </Card>
  );
}

function InvoicesList({
  patientId,
  currency,
  locale,
}: {
  patientId: string;
  currency: Currency;
  locale: AppLocale;
}) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  useEffect(() => {
    fetch(`/api/invoices?patient_id=${patientId}`)
      .then((r) => r.json())
      .then(setRows);
  }, [patientId]);
  if (!rows) return <p className="text-sm text-muted-foreground">…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">—</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-4">{t('number')}</th>
            <th className="py-2 pr-4">{t('issuedAt')}</th>
            <th className="py-2 pr-4">{tCommon('total')}</th>
            <th className="py-2 pr-4">{tCommon('status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2 pr-4">
                <Link href={`/billing/${r.id}`} className="hover:underline">
                  {r.number}
                </Link>
              </td>
              <td className="py-2 pr-4">{formatDate(r.issued_at, locale)}</td>
              <td className="py-2 pr-4">{formatMoney(r.total_cents, currency, locale)}</td>
              <td className="py-2 pr-4">
                <Badge
                  variant={
                    r.status === 'paid'
                      ? 'success'
                      : r.status === 'void'
                        ? 'destructive'
                        : r.status === 'issued'
                          ? 'warning'
                          : 'secondary'
                  }
                >
                  {t(`status.${r.status}` as any)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type InvoiceRow = {
  id: string;
  number: string;
  issued_at: string;
  status: string;
  total_cents: number;
};

function NewInvoiceDialog({
  open,
  onOpenChange,
  patientId,
  currency,
  locale,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  patientId: string;
  currency: Currency;
  locale: AppLocale;
}) {
  const t = useTranslations('billing');
  const tBilling = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [state, action, pending] = useActionState<InvoiceFormState, FormData>(
    createInvoice,
    {},
  );
  const [lines, setLines] = useState([
    { description: '', quantity: 1, unit_price: 0, tax_kind: 'standard' },
  ]);

  function setLine(i: number, key: string, value: any) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }

  function addLine() {
    setLines((ls) => [
      ...ls,
      { description: '', quantity: 1, unit_price: 0, tax_kind: 'standard' },
    ]);
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  const subtotal = lines.reduce(
    (a, l) => a + l.unit_price * l.quantity,
    0,
  );

  return (
    <div>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => onOpenChange(false)} />
      ) : null}
      {open ? (
        <form
          action={(fd) => {
            fd.set('patient_id', patientId);
            fd.set('tax_rate_standard_bps', '2100');
            fd.set('tax_rate_reduced_bps', '1050');
            fd.set('lines', JSON.stringify(lines));
            return action(fd);
          }}
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t('newInvoice')}</h2>
            <Button variant="ghost" size="icon" type="button" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2 mb-4">
            <Label>{tCommon('notes')}</Label>
            <Textarea name="notes" rows={2} />
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6 space-y-1">
                  <Label className="text-xs">{t('lines')}</Label>
                  <Input
                    value={l.description}
                    onChange={(e) => setLine(i, 'description', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => setLine(i, 'quantity', Number(e.target.value))}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={l.unit_price}
                    onChange={(e) => setLine(i, 'unit_price', Number(e.target.value))}
                  />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">{tBilling('taxKind.standard')}</Label>
                  <Select
                    value={l.tax_kind}
                    onValueChange={(v) => setLine(i, 'tax_kind', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">S</SelectItem>
                      <SelectItem value="reduced">R</SelectItem>
                      <SelectItem value="none">—</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" />
              {t('addLine')}
            </Button>
          </div>
          <div className="text-right text-sm mt-4">
            {tCommon('subtotal')}: {formatMoney(Math.round(subtotal * 100), currency, locale)}
          </div>
          {state.error ? <p className="text-sm text-destructive mt-2">{state.error}</p> : null}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tCommon('loading') : tCommon('save')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
