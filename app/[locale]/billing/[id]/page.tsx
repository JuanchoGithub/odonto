import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/rbac';
import { getInvoice, recordPayment } from '@/server/actions/billing';
import { queryOne } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/lib/navigation';
import { formatMoney, formatDate, formatDateTime } from '@/lib/format';
import { ExportInvoiceButton } from '@/components/billing/export-invoice-button';
import { PaymentForm } from '@/components/billing/payment-form';
import type { AppLocale, Currency } from '@/lib/schemas/common';

type Clinic = {
  id: string;
  name: string;
  address: string | null;
  tax_id: string | null;
  currency: Currency;
  locale: AppLocale;
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser();
  const t = await getTranslations('billing');
  const tCommon = await getTranslations('common');
  const data = await getInvoice(id);
  if (!data) notFound();
  const clinic = await queryOne<Clinic>(
    'SELECT id, name, address, tax_id, currency, locale FROM clinics LIMIT 1',
  );
  const c = (clinic?.currency ?? 'USD') as Currency;
  const l = (clinic?.locale ?? locale) as AppLocale;
  const { invoice, lines, payments } = data;
  const balance = invoice.total_cents - invoice.paid_cents;

  return (
    <div className="container py-8 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/billing" className="text-sm text-muted-foreground hover:underline">
            ← {t('title')}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">
            {invoice.number}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(invoice.issued_at, l)} · {invoice.patient_name} ·{' '}
            <Badge
              variant={
                invoice.status === 'paid'
                  ? 'success'
                  : invoice.status === 'void'
                    ? 'destructive'
                    : invoice.status === 'issued'
                      ? 'warning'
                      : 'secondary'
              }
            >
              {t(`status.${invoice.status}` as any)}
            </Badge>
          </p>
        </div>
        <ExportInvoiceButton
          invoice={{ ...invoice, lines, payments }}
          clinic={clinic ?? null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('lines')}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Tax</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
                <tr key={ln.id} className="border-b">
                  <td className="py-2">{ln.description}</td>
                  <td className="py-2 text-right">{ln.quantity}</td>
                  <td className="py-2 text-right">
                    {formatMoney(ln.unit_price_cents, c, l)}
                  </td>
                  <td className="py-2 text-right">
                    {t(`taxKind.${ln.tax_kind}` as any)} ({ln.tax_bps / 100}%)
                  </td>
                  <td className="py-2 text-right">
                    {formatMoney(ln.total_cents, c, l)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-2 text-right text-muted-foreground">
                  {tCommon('subtotal')}
                </td>
                <td className="py-2 text-right">{formatMoney(invoice.subtotal_cents, c, l)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="py-2 text-right text-muted-foreground">
                  {tCommon('tax')}
                </td>
                <td className="py-2 text-right">{formatMoney(invoice.tax_cents, c, l)}</td>
              </tr>
              <tr className="font-semibold border-t">
                <td colSpan={4} className="py-2 text-right">
                  {tCommon('total')}
                </td>
                <td className="py-2 text-right">
                  {formatMoney(invoice.total_cents, c, l)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2">{formatDateTime(p.paid_at, l)}</td>
                    <td className="py-2">{t(`methods.${p.method}` as any)}</td>
                    <td className="py-2 text-right">{formatMoney(p.amount_cents, c, l)}</td>
                    <td className="py-2">{p.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {balance > 0 && invoice.status !== 'void' ? (
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-medium mb-2">{t('recordPayment')}</h3>
              <PaymentForm invoiceId={id} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
