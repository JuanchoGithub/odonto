#!/usr/bin/env node
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const url = process.env.TURSO_URL || 'file:./local.db';
const authToken = process.env.TURSO_TOKEN || undefined;
const locale = (process.env.CLINIC_LOCALE || 'es').toLowerCase() === 'en' ? 'en' : 'es';
const defaultCurrency = locale === 'es' ? 'ARS' : 'USD';

const db = createClient({ url, authToken });

async function run() {
  const now = new Date().toISOString();

  // Clinic
  const clinicId = randomUUID();
  await db.execute({
    sql: `INSERT OR IGNORE INTO clinics (id, name, address, tax_id, tax_rate_standard_bps, tax_rate_reduced_bps, currency, locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      clinicId,
      locale === 'es' ? 'Clínica Odonto' : 'Odonto Clinic',
      locale === 'es' ? 'Av. Principal 123' : '123 Main St',
      '20-12345678-9',
      2100,
      1050,
      defaultCurrency,
      locale,
      now,
      now,
    ],
  });

  // Clinic business hours fallback (Mon–Fri 09:00–18:00). The 0003 migration
  // seeds these only for clinics that exist at migration time; a fresh
  // checkout runs migrations before seed, so the clinic doesn't exist yet.
  for (let dow = 1; dow <= 5; dow++) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO clinic_business_hours (id, clinic_id, day_of_week, start_time, end_time)
            VALUES (?, ?, ?, '09:00', '18:00')`,
      args: [randomUUID(), clinicId, dow],
    });
  }

  // Users
  const users = [
    { email: 'admin@local', name: 'Admin', role: 'admin', password: 'Admin123!', color: null },
    { email: 'doc@local', name: 'Dr. Demo', role: 'dentist', password: 'Doctor123!', color: '#2563eb' },
    { email: 'front@local', name: 'Front Desk', role: 'receptionist', password: 'Front123!', color: null },
  ];
  const userIds = {};
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const id = randomUUID();
    userIds[u.email] = id;
    await db.execute({
      sql: `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, locale, color, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, u.email, hash, u.name, u.role, locale, u.color, now],
    });
  }

  // Patients
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
  const patientIds = [];
  const adminId = userIds['admin@local'];
  for (const p of patientSeed) {
    const id = randomUUID();
    patientIds.push(id);
    const birth = new Date(Date.now() - p.age * 365.25 * 86400_000)
      .toISOString()
      .slice(0, 10);
    await db.execute({
      sql: `INSERT INTO patients (id, first_name, last_name, document_id, birth_date, gender, phone, email, address, medical_history, allergies, notes, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        p.first,
        p.last,
        p.doc,
        birth,
        p.gender,
        '+54 11 5555-' + Math.floor(1000 + Math.random() * 9000),
        `${p.first.toLowerCase()}.${p.last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
        'Calle Falsa 123',
        'Sin antecedentes relevantes',
        'Penicilina',
        '',
        adminId,
        now,
        now,
      ],
    });
  }

  // One past appointment + one completed treatment + one paid invoice per patient
  const dentistId = userIds['doc@local'];
  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const apptId = randomUUID();
    const starts = new Date(Date.now() - (i + 1) * 86400_000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    await db.execute({
      sql: `INSERT INTO appointments (id, patient_id, dentist_id, starts_at, ends_at, status, reason, notes, created_at)
            VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      args: [apptId, patientId, dentistId, starts, starts, 'Limpieza', '', now],
    });
    const treatmentId = randomUUID();
    const cost = 5000_00;
    await db.execute({
      sql: `INSERT INTO treatments (id, patient_id, appointment_id, tooth_number, description, code, cost_cents, tax_kind, status, performed_by, performed_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'standard', 'done', ?, ?, ?)`,
      args: [treatmentId, patientId, apptId, 16, 'Limpieza dental', 'D1110', cost, dentistId, starts, now],
    });
    const invoiceId = randomUUID();
    const number = `F-${String(1000 + i).padStart(5, '0')}`;
    const tax = Math.round(cost * 0.21);
    await db.execute({
      sql: `INSERT INTO invoices (id, patient_id, number, issued_at, status, subtotal_cents, tax_cents, total_cents, notes, clinic_id)
            VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?)`,
      args: [invoiceId, patientId, number, starts, cost, tax, cost + tax, '', clinicId],
    });
    await db.execute({
      sql: `INSERT INTO invoice_lines (id, invoice_id, treatment_id, description, quantity, unit_price_cents, tax_kind, tax_bps, total_cents)
            VALUES (?, ?, ?, 'Limpieza dental', 1, ?, 'standard', 2100, ?)`,
      args: [randomUUID(), invoiceId, treatmentId, cost, cost],
    });
    await db.execute({
      sql: `INSERT INTO payments (id, invoice_id, paid_at, method, amount_cents, reference)
            VALUES (?, ?, ?, 'card', ?, ?)`,
      args: [randomUUID(), invoiceId, starts, cost + tax, `REF-${i}`],
    });
  }

  console.log('--- Seed complete ---');
  console.log('Clinic:', { locale, currency: defaultCurrency, clinicId });
  console.log('Users:');
  for (const u of users) console.log(`  ${u.email}  /  ${u.password}  (${u.role})`);
  console.log(`Patients: ${patientIds.length}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
