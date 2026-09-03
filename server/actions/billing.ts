'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne, transaction } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { uid, nowIso, amountToCents } from '@/lib/utils';

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive().default(1),
  unit_price: z.coerce.number().min(0),
  tax_kind: z.enum(['standard', 'reduced', 'none']).default('standard'),
  treatment_id: z.string().optional().nullable(),
});

const InvoiceSchema = z.object({
  patient_id: z.string().min(1),
  notes: z.string().optional().nullable(),
  tax_rate_standard_bps: z.coerce.number().int().min(0).max(10000),
  tax_rate_reduced_bps: z.coerce.number().int().min(0).max(10000),
  lines: z.array(LineSchema).min(1),
});

export type InvoiceFormState = { error?: string; ok?: boolean; id?: string };

export async function createInvoice(
  _prev: InvoiceFormState,
  fd: FormData,
): Promise<InvoiceFormState> {
  const user = await requireUser();
  // Parse FormData into InvoiceSchema
  const linesRaw = fd.getAll('lines') as string[];
  const lines: unknown[] = [];
  for (const lr of linesRaw) {
    try {
      lines.push(JSON.parse(lr));
    } catch {
      return { error: 'Invalid line' };
    }
  }
  const parsed = InvoiceSchema.safeParse({
    patient_id: fd.get('patient_id'),
    notes: fd.get('notes') || null,
    tax_rate_standard_bps: fd.get('tax_rate_standard_bps'),
    tax_rate_reduced_bps: fd.get('tax_rate_reduced_bps'),
    lines,
  });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid' };
  const d = parsed.data;
  const id = uid();
  const number = `F-${Date.now().toString().slice(-7)}`;

  await transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO invoices (id, patient_id, number, issued_at, status, subtotal_cents, tax_cents, total_cents, notes, clinic_id)
       VALUES (?, ?, ?, ?, 'issued', 0, 0, 0, ?, (SELECT id FROM clinics LIMIT 1))`,
      [id, d.patient_id, number, nowIso(), d.notes || null],
    );
    let subtotal = 0;
    let taxTotal = 0;
    for (const line of d.lines) {
      const lineSubtotal = Math.round(line.unit_price * line.quantity * 100);
      const bps =
        line.tax_kind === 'standard'
          ? d.tax_rate_standard_bps
          : line.tax_kind === 'reduced'
            ? d.tax_rate_reduced_bps
            : 0;
      const tax = Math.round((lineSubtotal * bps) / 10000);
      const total = lineSubtotal + tax;
      subtotal += lineSubtotal;
      taxTotal += tax;
      await tx.execute(
        `INSERT INTO invoice_lines (id, invoice_id, treatment_id, description, quantity, unit_price_cents, tax_kind, tax_bps, total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid(),
          id,
          line.treatment_id || null,
          line.description,
          line.quantity,
          amountToCents(line.unit_price),
          line.tax_kind,
          bps,
          total,
        ],
      );
    }
    await tx.execute(
      `UPDATE invoices SET subtotal_cents=?, tax_cents=?, total_cents=? WHERE id=?`,
      [subtotal, taxTotal, subtotal + taxTotal, id],
    );
    await tx.execute(
      `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'invoice', ?)`,
      [uid(), user.id, id],
    );
  });

  revalidatePath('/billing');
  revalidatePath(`/patients/${d.patient_id}`);
  return { ok: true, id };
}

const PaymentSchema = z.object({
  invoice_id: z.string().min(1),
  amount: z.coerce.number().positive(),
  method: z.enum(['cash', 'card', 'transfer', 'insurance', 'other']),
  reference: z.string().optional().nullable(),
});

export async function recordPayment(fd: FormData) {
  const user = await requireUser();
  const parsed = PaymentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' };
  const d = parsed.data;
  const paymentId = uid();
  await query(
    `INSERT INTO payments (id, invoice_id, paid_at, method, amount_cents, reference)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [paymentId, d.invoice_id, nowIso(), d.method, amountToCents(d.amount), d.reference || null],
  );
  // Update invoice status
  const total = await queryOne<{ s: number }>(
    'SELECT COALESCE(SUM(amount_cents),0) as s FROM payments WHERE invoice_id = ?',
    [d.invoice_id],
  );
  const inv = await queryOne<{ total_cents: number }>(
    'SELECT total_cents FROM invoices WHERE id = ?',
    [d.invoice_id],
  );
  if (inv && total && total.s >= inv.total_cents) {
    await query("UPDATE invoices SET status = 'paid' WHERE id = ?", [d.invoice_id]);
  }
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'payment', ?)`,
    [uid(), user.id, paymentId],
  );
  revalidatePath(`/billing`);
  revalidatePath(`/billing/${d.invoice_id}`);
  return { ok: true };
}

export type InvoiceRow = {
  id: string;
  number: string;
  patient_id: string;
  patient_name: string;
  issued_at: string;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
};

export async function listInvoices() {
  return query<InvoiceRow>(
    `SELECT i.*, p.first_name || ' ' || p.last_name as patient_name,
            (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE invoice_id = i.id) as paid_cents
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     ORDER BY i.issued_at DESC LIMIT 200`,
  );
}

export async function getInvoice(id: string) {
  const inv = await queryOne<InvoiceRow & { notes: string | null; clinic_id: string | null }>(
    `SELECT i.*, p.first_name || ' ' || p.last_name as patient_name, p.document_id, p.email, p.address,
            (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE invoice_id = i.id) as paid_cents
     FROM invoices i
     JOIN patients p ON p.id = i.patient_id
     WHERE i.id = ?`,
    [id],
  );
  if (!inv) return null;
  const lines = await query<{
    id: string;
    description: string;
    quantity: number;
    unit_price_cents: number;
    tax_kind: string;
    tax_bps: number;
    total_cents: number;
  }>('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY rowid', [id]);
  const payments = await query<{
    id: string;
    paid_at: string;
    method: string;
    amount_cents: number;
    reference: string | null;
  }>('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at', [id]);
  return { invoice: inv, lines, payments };
}
