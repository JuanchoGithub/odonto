'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne, transaction } from '@/lib/db';
import { requireUser, can } from '@/lib/rbac';
import { uid, nowIso, amountToCents, normalizeDecimalInput } from '@/lib/utils';
import { splitTaxInclusive, bpsForTaxKind } from '@/lib/tax';

const CONSULTA_CODE = 'CONSULTA';

function isConsultaCode(code: string | null | undefined) {
  return (code ?? '').trim().toUpperCase() === CONSULTA_CODE;
}

async function getClinicTaxRates(): Promise<{ standard: number; reduced: number }> {
  try {
    const row = await queryOne<{ tax_rate_standard_bps: number | null; tax_rate_reduced_bps: number | null }>(
      `SELECT tax_rate_standard_bps, tax_rate_reduced_bps FROM clinics LIMIT 1`,
    );
    return {
      standard: row?.tax_rate_standard_bps ?? 2100,
      reduced: row?.tax_rate_reduced_bps ?? 1050,
    };
  } catch {
    return { standard: 2100, reduced: 1050 };
  }
}

const DecimalNumber = (inner: z.ZodTypeAny) => z.preprocess(normalizeDecimalInput, inner);

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: DecimalNumber(z.coerce.number().positive().default(1)),
  unit_price: DecimalNumber(z.coerce.number().min(0)),
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
  if (!can(user.role, 'billing:write')) return { error: 'Forbidden' };
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
  const number = `F-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 4).toUpperCase()}`;
  // Prices are FINAL (post-tax, IVA incluido). Clinic rates are authoritative;
  // the form-passed rates are a fallback for old clients. Back out the tax
  // portion per line instead of adding tax on top.
  const clinicRates = await getClinicTaxRates();
  const stdBps = clinicRates.standard ?? d.tax_rate_standard_bps;
  const redBps = clinicRates.reduced ?? d.tax_rate_reduced_bps;

  await transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO invoices (id, patient_id, number, issued_at, status, subtotal_cents, tax_cents, total_cents, notes, clinic_id, updated_at)
       VALUES (?, ?, ?, ?, 'issued', 0, 0, 0, ?, (SELECT id FROM clinics LIMIT 1), ?)`,
      [id, d.patient_id, number, nowIso(), d.notes || null, nowIso()],
    );
    let subtotal = 0;
    let taxTotal = 0;
    let grandTotal = 0;
    for (const line of d.lines) {
      // Integer-cents math only: final unit price once, then scale by qty.
      const unitFinalCents = amountToCents(line.unit_price);
      const lineTotal = Math.round(unitFinalCents * line.quantity);
      const bps = bpsForTaxKind(line.tax_kind, stdBps, redBps);
      const { net: lineSubtotal, tax } = splitTaxInclusive(lineTotal, bps);
      const total = lineTotal;
      subtotal += lineSubtotal;
      taxTotal += tax;
      grandTotal += total;
      await tx.execute(
        `INSERT INTO invoice_lines (id, invoice_id, treatment_id, description, quantity, unit_price_cents, tax_kind, tax_bps, total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid(),
          id,
          line.treatment_id || null,
          line.description,
          line.quantity,
          unitFinalCents,
          line.tax_kind,
          bps,
          total,
        ],
      );
    }
    await tx.execute(
      `UPDATE invoices SET subtotal_cents=?, tax_cents=?, total_cents=?, updated_at=? WHERE id=?`,
      [subtotal, taxTotal, grandTotal, nowIso(), id],
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
  amount: DecimalNumber(z.coerce.number().positive()),
  method: z.enum(['cash', 'card', 'transfer', 'insurance', 'other']),
  reference: z.string().optional().nullable(),
});

export async function recordPayment(fd: FormData) {
  const user = await requireUser();
  if (!can(user.role, 'billing:write')) return { error: 'Forbidden' };
  const parsed = PaymentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Invalid' };
  const d = parsed.data;
  const paymentId = uid();
  const amountCents = amountToCents(d.amount);
  let paymentError: string | null = null;
  try {
    await transaction(async (tx) => {
      const inv = await tx.queryOne<{ total_cents: number }>(
        'SELECT total_cents FROM invoices WHERE id = ?',
        [d.invoice_id],
      );
      if (!inv) {
        paymentError = 'Invoice not found';
        throw new Error('invoice_not_found');
      }
      const total = await tx.queryOne<{ s: number }>(
        'SELECT COALESCE(SUM(amount_cents),0) as s FROM payments WHERE invoice_id = ?',
        [d.invoice_id],
      );
      const paidSoFar = total?.s ?? 0;
      if (paidSoFar + amountCents > inv.total_cents) {
        paymentError = 'Overpayment';
        throw new Error('overpayment');
      }
      await tx.execute(
        `INSERT INTO payments (id, invoice_id, paid_at, method, amount_cents, reference, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, d.invoice_id, nowIso(), d.method, amountCents, d.reference || null, nowIso()],
      );
      const newTotal = paidSoFar + amountCents;
      await tx.execute('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?', [
        newTotal >= inv.total_cents ? 'paid' : 'issued',
        nowIso(),
        d.invoice_id,
      ]);
      await tx.execute(
        `INSERT INTO audit_log (id, user_id, action, entity, entity_id) VALUES (?, ?, 'create', 'payment', ?)`,
        [uid(), user.id, paymentId],
      );
    });
  } catch (e) {
    if (paymentError) return { error: paymentError };
    throw e;
  }
  if (paymentError) return { error: paymentError };
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

export type VisitTreatment = {
  id: string;
  description: string;
  code: string | null;
  cost_cents: number;
  tax_kind: string;
};

export type VisitLinePreview = {
  treatment_id: string;
  description: string;
  quantity: number;
  unit_final_cents: number;
  tax_kind: string;
  tax_bps: number;
  net_cents: number;
  tax_cents: number;
  total_cents: number;
  bundled: boolean;
};

export type VisitPreview = {
  appointment_id: string;
  patient_id: string;
  already_invoiced: boolean;
  invoice_id: string | null;
  lines: VisitLinePreview[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
};

function canBillVisit(role: string) {
  return can(role as 'admin' | 'dentist' | 'receptionist', 'billing:write') || can(role as 'admin' | 'dentist' | 'receptionist', 'billing:invoice_visit');
}

async function loadUninvoicedVisitTreatments(appointmentId: string): Promise<VisitTreatment[]> {
  return query<VisitTreatment>(
    `SELECT t.id, t.description, t.code, t.cost_cents, t.tax_kind
     FROM treatments t
     LEFT JOIN invoice_lines il ON il.treatment_id = t.id
     WHERE t.appointment_id = ? AND t.status = 'done' AND il.id IS NULL
     ORDER BY t.created_at`,
    [appointmentId],
  );
}

/** Preview the automatic visit invoice (bundling applied, nothing written). */
export async function previewVisitInvoice(appointmentId: string): Promise<VisitPreview | { error: string }> {
  const user = await requireUser();
  if (!canBillVisit(user.role)) return { error: 'Forbidden' };
  const appt = await queryOne<{ id: string; patient_id: string }>(
    `SELECT id, patient_id FROM appointments WHERE id = ?`,
    [appointmentId],
  );
  if (!appt) return { error: 'Not found' };
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM invoices WHERE appointment_id = ? LIMIT 1`,
    [appointmentId],
  );
  if (existing) {
    return {
      appointment_id: appointmentId,
      patient_id: appt.patient_id,
      already_invoiced: true,
      invoice_id: existing.id,
      lines: [],
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
    };
  }
  const treatments = await loadUninvoicedVisitTreatments(appointmentId);
  const rates = await getClinicTaxRates();
  const hasConsulta = treatments.some((t) => isConsultaCode(t.code));
  const hasOther = treatments.some((t) => !isConsultaCode(t.code));
  const bundleConsulta = hasConsulta && hasOther;
  let subtotal = 0;
  let taxTotal = 0;
  let grand = 0;
  const lines: VisitLinePreview[] = treatments.map((t) => {
    const bundled = bundleConsulta && isConsultaCode(t.code);
    const finalEach = bundled ? 0 : t.cost_cents;
    const total = Math.round(finalEach * 1);
    const bps = bpsForTaxKind(t.tax_kind, rates.standard, rates.reduced);
    const { net, tax } = splitTaxInclusive(total, bps);
    subtotal += net;
    taxTotal += tax;
    grand += total;
    return {
      treatment_id: t.id,
      description: bundled ? `${t.description} (incluida)` : t.description,
      quantity: 1,
      unit_final_cents: finalEach,
      tax_kind: t.tax_kind,
      tax_bps: bps,
      net_cents: net,
      tax_cents: tax,
      total_cents: total,
      bundled,
    };
  });
  return {
    appointment_id: appointmentId,
    patient_id: appt.patient_id,
    already_invoiced: false,
    invoice_id: null,
    lines,
    subtotal_cents: subtotal,
    tax_cents: taxTotal,
    total_cents: grand,
  };
}

/**
 * Build the visit invoice automatically (status issued). One invoice per
 * appointment; safe to retry (returns already_invoiced). Bundling rule:
 * consulta + ≥1 other done treatment → consulta line at 0 (incluida).
 */
export async function buildVisitInvoice(appointmentId: string): Promise<{ ok: true; id: string } | { error: string }> {
  const user = await requireUser();
  if (!canBillVisit(user.role)) return { error: 'Forbidden' };
  const appt = await queryOne<{ id: string; patient_id: string; status: string }>(
    `SELECT id, patient_id, status FROM appointments WHERE id = ?`,
    [appointmentId],
  );
  if (!appt) return { error: 'Not found' };
  if (appt.status === 'cancelled' || appt.status === 'no_show') return { error: 'Invalid visit' };

  const preview = await previewVisitInvoice(appointmentId);
  if ('error' in preview) return { error: preview.error };
  if (preview.already_invoiced) return { error: 'already_invoiced' };
  if (preview.lines.length === 0) return { error: 'nothing_to_bill' };

  const id = uid();
  const number = `F-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 4).toUpperCase()}`;
  try {
    await transaction(async (tx) => {
      const dup = await tx.queryOne<{ id: string }>(
        `SELECT id FROM invoices WHERE appointment_id = ? LIMIT 1`,
        [appointmentId],
      );
      if (dup) throw new Error('already_invoiced');
      await tx.execute(
        `INSERT INTO invoices (id, patient_id, appointment_id, number, issued_at, status, subtotal_cents, tax_cents, total_cents, notes, clinic_id, updated_at)
         VALUES (?, ?, ?, ?, ?, 'issued', 0, 0, 0, ?, (SELECT id FROM clinics LIMIT 1), ?)`,
        [id, preview.patient_id, appointmentId, number, nowIso(), 'Visita', nowIso()],
      );
      for (const ln of preview.lines) {
        await tx.execute(
          `INSERT INTO invoice_lines (id, invoice_id, treatment_id, description, quantity, unit_price_cents, tax_kind, tax_bps, total_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid(), id, ln.treatment_id, ln.description, ln.quantity, ln.unit_final_cents, ln.tax_kind, ln.tax_bps, ln.total_cents],
        );
      }
      await tx.execute(
        `UPDATE invoices SET subtotal_cents=?, tax_cents=?, total_cents=?, updated_at=? WHERE id=?`,
        [preview.subtotal_cents, preview.tax_cents, preview.total_cents, nowIso(), id],
      );
      await tx.execute(
        `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'create', 'invoice', ?, ?)`,
        [uid(), user.id, id, JSON.stringify({ via: 'visit', appointment_id: appointmentId })],
      );
    });
  } catch (e) {
    if (String((e as Error)?.message ?? e).includes('already_invoiced')) {
      return { error: 'already_invoiced' };
    }
    // UNIQUE constraint race on appointment_id → same outcome.
    if (String((e as Error)?.message ?? e).includes('UNIQUE')) {
      return { error: 'already_invoiced' };
    }
    throw e;
  }
  revalidatePath('/billing');
  revalidatePath(`/patients/${preview.patient_id}`);
  revalidatePath('/appointments');
  return { ok: true, id };
}

/**
 * Ensure the default consulta treatment exists for a completed visit.
 * Called when a turno reaches `completed`; never duplicates.
 */
export async function ensureConsultaForAppointment(appointmentId: string, actorId?: string) {
  const appt = await queryOne<{ id: string; patient_id: string; status: string }>(
    `SELECT id, patient_id, status FROM appointments WHERE id = ?`,
    [appointmentId],
  );
  if (!appt) return null;
  if (appt.status !== 'completed') return null;
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM treatments WHERE appointment_id = ? AND upper(COALESCE(code,'')) = 'CONSULTA' LIMIT 1`,
    [appointmentId],
  );
  if (existing) return existing.id;
  const catalog = await queryOne<{ description: string; default_price_cents: number; tax_kind: string }>(
    `SELECT description, default_price_cents, tax_kind FROM treatment_catalog
     WHERE kind = 'consulta' AND archived_at IS NULL AND is_definitive = 1 ORDER BY created_at ASC LIMIT 1`,
  );
  const id = uid();
  const now = nowIso();
  await query(
    `INSERT INTO treatments (id, patient_id, appointment_id, description, code, cost_cents, tax_kind, status, performed_by, performed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'CONSULTA', ?, ?, 'done', ?, ?, ?, ?)`,
    [
      id,
      appt.patient_id,
      appointmentId,
      catalog?.description ?? 'Consulta',
      catalog?.default_price_cents ?? 5000000,
      catalog?.tax_kind ?? 'standard',
      actorId ?? null,
      now,
      now,
      now,
    ],
  );
  return id;
}
