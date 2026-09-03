'use client';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import type { AppLocale, Currency } from '@/lib/schemas/common';

type Line = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_kind: string;
  tax_bps: number;
  total_cents: number;
};

type Payment = {
  paid_at: string;
  method: string;
  amount_cents: number;
  reference: string | null;
};

export function ExportInvoiceButton({
  invoice,
  clinic,
}: {
  invoice: {
    number: string;
    patient_name: string;
    document_id?: string | null;
    address?: string | null;
    issued_at: string;
    total_cents: number;
    subtotal_cents: number;
    tax_cents: number;
    status: string;
    lines: Line[];
    payments: Payment[];
  };
  clinic: {
    name: string;
    address: string | null;
    tax_id: string | null;
    currency: Currency;
    locale: AppLocale;
  } | null;
}) {
  function exportPdf() {
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    const cur = clinic?.currency ?? 'USD';
    const loc = (clinic?.locale ?? 'en') as AppLocale;
    let y = 14;
    doc.setFontSize(16).setFont('helvetica', 'bold');
    doc.text(clinic?.name ?? 'Odonto', 14, y);
    y += 6;
    doc.setFontSize(9).setFont('helvetica', 'normal');
    if (clinic?.address) {
      doc.text(clinic.address, 14, y);
      y += 4;
    }
    if (clinic?.tax_id) {
      doc.text(`Tax ID: ${clinic.tax_id}`, 14, y);
      y += 4;
    }
    doc.setFontSize(18).setFont('helvetica', 'bold');
    doc.text(`Invoice ${invoice.number}`, w - 14, 14, { align: 'right' });
    doc.setFontSize(9).setFont('helvetica', 'normal');
    doc.text(`Issued: ${formatDate(invoice.issued_at, loc)}`, w - 14, 20, {
      align: 'right',
    });
    doc.text(`Status: ${invoice.status.toUpperCase()}`, w - 14, 25, { align: 'right' });
    y = Math.max(y, 32);
    doc.setFontSize(10).setFont('helvetica', 'bold').text('Bill to', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal').text(invoice.patient_name, 14, y);
    y += 4;
    if (invoice.document_id) {
      doc.text(`ID: ${invoice.document_id}`, 14, y);
      y += 4;
    }
    if (invoice.address) {
      doc.text(invoice.address, 14, y);
      y += 4;
    }
    y += 6;
    // lines table
    doc.setFont('helvetica', 'bold');
    doc.text('Description', 14, y);
    doc.text('Qty', 110, y, { align: 'right' });
    doc.text('Unit', 135, y, { align: 'right' });
    doc.text('Tax%', 160, y, { align: 'right' });
    doc.text('Total', w - 14, y, { align: 'right' });
    y += 3;
    doc.setLineWidth(0.2).line(14, y, w - 14, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    for (const ln of invoice.lines) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(ln.description.slice(0, 50), 14, y);
      doc.text(String(ln.quantity), 110, y, { align: 'right' });
      doc.text(formatMoney(ln.unit_price_cents, cur, loc), 135, y, { align: 'right' });
      doc.text(`${(ln.tax_bps / 100).toFixed(2)}`, 160, y, { align: 'right' });
      doc.text(formatMoney(ln.total_cents, cur, loc), w - 14, y, { align: 'right' });
      y += 5;
    }
    y += 4;
    doc.line(14, y, w - 14, y);
    y += 6;
    doc.text('Subtotal', w - 60, y, { align: 'right' });
    doc.text(formatMoney(invoice.subtotal_cents, cur, loc), w - 14, y, { align: 'right' });
    y += 5;
    doc.text('Tax', w - 60, y, { align: 'right' });
    doc.text(formatMoney(invoice.tax_cents, cur, loc), w - 14, y, { align: 'right' });
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Total', w - 60, y, { align: 'right' });
    doc.text(formatMoney(invoice.total_cents, cur, loc), w - 14, y, { align: 'right' });
    doc.save(`${invoice.number}.pdf`);
  }
  return (
    <Button onClick={exportPdf} variant="outline">
      <Download className="h-4 w-4" />
      PDF
    </Button>
  );
}
