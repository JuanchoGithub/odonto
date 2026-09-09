#!/usr/bin/env node
/**
 * Re-add e2e fixture data to an existing local DB (typically a mirror of the
 * production database created by `mirror-db.mjs`). Unlike `seed.mjs`, this
 * does NOT create a new clinic: it resolves the existing clinic + fixture user
 * ids from the DB so all FKs (invoices.clinic_id, patients.created_by,
 * appointments.dentist_id, ...) point at real rows.
 *
 * Only ever operates on the local target file — never on production.
 *
 * Usage:
 *   TURSO_URL='file:./.e2e.db' node scripts/e2e-fixtures.mjs
 */
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const url = process.env.TURSO_URL || 'file:./.e2e.db';
const authToken = process.env.TURSO_TOKEN || undefined;
const locale = (process.env.CLINIC_LOCALE || 'es').toLowerCase() === 'en' ? 'en' : 'es';
const db = createClient({ url, authToken });

async function queryOne(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0] ?? null;
}
async function scalar(sql, args = []) {
  const row = await queryOne(sql, args);
  return row ? Object.values(row)[0] : undefined;
}

async function run() {
  const now = new Date().toISOString();

  // Resolve (or create) the clinic.
  let clinic = await queryOne('SELECT id FROM clinics LIMIT 1');
  if (!clinic) {
    const id = randomUUID();
    await db.execute({
      sql: `INSERT INTO clinics (id, name, address, tax_id, tax_rate_standard_bps, tax_rate_reduced_bps, currency, locale, timezone, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UTC', ?, ?)`,
      args: [id, 'Clínica Odonto', 'Av. Principal 123', '20-12345678-9', 2100, 1050, 'ARS', locale, now, now],
    });
    clinic = { id };
  }
  const clinicId = clinic.id;

  // WhatsApp templates: seed the two built-ins only if the clinic has none.
  const wa = await scalar(
    `SELECT whatsapp_templates FROM clinics WHERE id = ?`,
    [clinicId],
  );
  if (!wa || wa === '[]' || wa.length === 0) {
    await db.execute({
      sql: `UPDATE clinics SET whatsapp_templates = ?, updated_at = ? WHERE id = ?`,
      args: [
        JSON.stringify([
          {
            id: 'builtin_confirmation',
            kind: 'confirmation',
            label_es: 'Confirmación de turno',
            label_en: 'Appointment confirmation',
            body_es: 'Hola, {{name}}. Hoy {{weekday}} tiene turno a las {{time}}, confirme por favor.',
            body_en: 'Hi {{name}}. Today {{weekday}} you have an appointment at {{time}}, please confirm.',
            applies_to: 'upcoming',
            enabled: 1,
          },
          {
            id: 'builtin_no_show',
            kind: 'no_show',
            label_es: 'Recordatorio de inasistencia',
            label_en: 'No-show follow-up',
            body_es: 'Hola {{name}}, hoy {{weekday}} tenía un turno a las {{time}}, pero no se presentó, ¿podría confirmar si cancela el turno? Gracias.',
            body_en: 'Hi {{name}}, today {{weekday}} you had an appointment at {{time}}, but you did not show up. Could you confirm whether you are cancelling the appointment? Thank you.',
            applies_to: 'past',
            enabled: 1,
          },
        ]),
        now,
        clinicId,
      ],
    });
  }

  // Clinic business hours fallback (Mon-Fri 09:00-18:00). INSERT OR IGNORE is
  // safe because clinic_business_hours has UNIQUE(clinic_id, day_of_week).
  for (let dow = 1; dow <= 5; dow++) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO clinic_business_hours (id, clinic_id, day_of_week, start_time, end_time)
            VALUES (?, ?, ?, '09:00', '18:00')`,
      args: [randomUUID(), clinicId, dow],
    });
  }

  // Fixture users. Resolve existing ids (e.g. bootstrap admin from the mirror)
  // or insert the seed users. INSERT OR IGNORE by email keeps ids stable.
  const fixtures = [
    { email: 'admin@local', name: 'Admin', role: 'admin', password: 'Admin123!', color: null },
    { email: 'doc@local', name: 'Dr. Demo', role: 'dentist', password: 'Doctor123!', color: '#2563eb' },
    { email: 'front@local', name: 'Front Desk', role: 'receptionist', password: 'Front123!', color: null },
  ];
  const userIds = {};
  for (const u of fixtures) {
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [u.email]);
    if (existing) {
      userIds[u.email] = existing.id;
      continue;
    }
    const id = randomUUID();
    const hash = await bcrypt.hash(u.password, 10);
    await db.execute({
      sql: `INSERT INTO users (id, email, password_hash, name, role, locale, color, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, u.email, hash, u.name, u.role, locale, u.color, now],
    });
    userIds[u.email] = id;
  }
  const adminId = userIds['admin@local'];
  const dentistId = userIds['doc@local'];

  // Patients — guarded so re-runs are idempotent.
  const patientSeed = [
    { first: 'Ana', last: 'García', doc: '30123456', age: 34, gender: 'female' },
    { first: 'Luis', last: 'Pérez', doc: '28999888', age: 52, gender: 'male' },
    { first: 'Sofía', last: 'Martínez', doc: '40111222', age: 28, gender: 'female' },
    { first: 'Carlos', last: 'López', doc: '25444777', age: 41, gender: 'male' },
    { first: 'María', last: 'Rodríguez', doc: '32111999', age: 19, gender: 'female' },
    { first: 'Jorge', last: 'Fernández', doc: '27666555', age: 60, gender: 'male' },
    { first: 'Lucía', last: 'Gómez', doc: '39333222', age: 8, gender: 'female' },
    { first: 'Diego', last: 'Suárez', doc: '41777888', age: 45, gender: 'male' },
    { first: 'Valeria', last: 'Castro', doc: '35555111', age: 30, gender: 'female' },
    { first: 'Tomás', last: 'Ruiz', doc: '22999000', age: 23, gender: 'male' },
  ];
  const existingPatient = await scalar(
    'SELECT COUNT(*) FROM patients WHERE document_id = ?',
    [patientSeed[0].doc],
  );
  const patientIds = [];
  if (Number(existingPatient) > 0) {
    console.log('Patients already present — skipping patient/appointment/invoice fixtures.');
  } else {
    for (const p of patientSeed) {
      const id = randomUUID();
      patientIds.push(id);
      const birth = new Date(Date.now() - p.age * 365.25 * 86400_000).toISOString().slice(0, 10);
      await db.execute({
        sql: `INSERT INTO patients (id, first_name, last_name, document_id, birth_date, gender, phone, email, address, medical_history, allergies, notes, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, p.first, p.last, p.doc, birth, p.gender,
          '+54 11 5555-' + Math.floor(1000 + Math.random() * 9000),
          `${p.first.toLowerCase()}.${p.last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
          'Calle Falsa 123', 'Sin antecedentes relevantes', 'Penicilina', '',
          adminId, now, now,
        ],
      });
    }

    // One past appointment + completed treatment + paid invoice per patient.
    for (let i = 0; i < patientIds.length; i++) {
      const patientId = patientIds[i];
      const apptId = randomUUID();
      const starts = new Date(Date.now() - (i + 1) * 86400_000).toISOString().replace('T', ' ').slice(0, 19);
      await db.execute({
        sql: `INSERT INTO appointments (id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
        args: [apptId, patientId, dentistId, starts, starts, 'Limpieza', '', now, now],
      });
      const treatmentId = randomUUID();
      const cost = 5000_00;
      await db.execute({
        sql: `INSERT INTO treatments (id, patient_id, appointment_id, tooth_number, description, code, cost_cents, tax_kind, status, performed_by, performed_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'standard', 'done', ?, ?, ?, ?)`,
        args: [treatmentId, patientId, apptId, 16, 'Limpieza dental', 'D1110', cost, dentistId, starts, now, now],
      });
      const invoiceId = randomUUID();
      const number = `F-${String(1000 + i).padStart(5, '0')}`;
      const tax = Math.round(cost * 0.21);
      await db.execute({
        sql: `INSERT INTO invoices (id, patient_id, number, issued_at, status, subtotal_cents, tax_cents, total_cents, notes, clinic_id, updated_at)
              VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)`,
        args: [invoiceId, patientId, number, starts, cost, tax, cost + tax, '', clinicId, now],
      });
      await db.execute({
        sql: `INSERT INTO invoice_lines (id, invoice_id, treatment_id, description, quantity, unit_price_cents, tax_kind, tax_bps, total_cents)
              VALUES (?, ?, ?, 'Limpieza dental', 1, ?, 'standard', 2100, ?)`,
        args: [randomUUID(), invoiceId, treatmentId, cost, cost],
      });
      await db.execute({
        sql: `INSERT INTO payments (id, invoice_id, paid_at, method, amount_cents, reference, updated_at)
              VALUES (?, ?, ?, 'card', ?, ?, ?)`,
        args: [randomUUID(), invoiceId, starts, cost + tax, `REF-${i}`, now],
      });
    }
  }

  console.log('--- E2E fixtures complete ---');
  console.log(`Clinic: ${clinicId}`);
  console.log('Fixture users:');
  for (const u of fixtures) console.log(`  ${u.email}  /  ${u.password}  (${u.role})`);
  console.log(`Patients inserted: ${patientIds.length}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});