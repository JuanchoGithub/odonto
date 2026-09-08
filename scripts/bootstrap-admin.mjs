#!/usr/bin/env node
// Create the first (bootstrap) admin user on a wiped production DB.
// Reads credentials ONLY from the environment — never commit values.
//
// Usage:
//   set -a; source .local/.env.production; set +a   # provides TURSO_URL/TURSO_TOKEN
//   BOOTSTRAP_ADMIN_EMAIL=admin@clinic.com \
//   BOOTSTRAP_ADMIN_NAME="Site Admin" \
//   BOOTSTRAP_ADMIN_PASSWORD='<strong generated password>' \
//   node scripts/bootstrap-admin.mjs
//
// Afterwards log in and create dentists/receptionists via Settings → Users,
// then change this password. The script refuses to run in CI.
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

if (process.env.CI === 'true') {
  console.error('bootstrap-admin: refusing to run under CI (password would leak to logs).');
  process.exit(1);
}

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const name = (process.env.BOOTSTRAP_ADMIN_NAME || 'Admin').trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';

if (!email || !email.includes('@') || email === 'system@internal') {
  console.error('bootstrap-admin: set BOOTSTRAP_ADMIN_EMAIL to the real admin address.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('bootstrap-admin: BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const url = process.env.TURSO_URL || 'file:./local.db';
const authToken = process.env.TURSO_TOKEN || undefined;
const db = createClient({ url, authToken });

const hash = await bcrypt.hash(password, 10);
const now = new Date().toISOString();
try {
  await db.execute({
    sql: `INSERT INTO users (id, email, password_hash, name, role, locale, created_at)
          VALUES (?, ?, ?, ?, 'admin', 'es', ?)`,
    args: [randomUUID(), email, hash, name, now],
  });
  console.log(`bootstrap-admin: created admin ${email}`);
} catch (e) {
  if (String(e?.message ?? '').includes('UNIQUE')) {
    console.error(`bootstrap-admin: ${email} already exists — nothing to do.`);
    process.exit(2);
  }
  throw e;
}
