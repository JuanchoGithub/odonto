#!/usr/bin/env node
// Apply SQL migrations in order from /migrations, tracking applied files in _migrations.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createClient } from '@libsql/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = resolve(__dirname, '..', 'migrations');

const url = process.env.TURSO_URL || 'file:./local.db';
const authToken = process.env.TURSO_TOKEN || undefined;

const db = createClient({ url, authToken });

async function ensureMigrationsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function appliedFiles() {
  const res = await db.execute('SELECT filename FROM _migrations');
  return new Set(res.rows.map((r) => r.filename));
}

async function run() {
  await ensureMigrationsTable();
  const applied = await appliedFiles();
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    // Strip comment lines, then split into statements on `;` at end of line.
    const stripped = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = stripped
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (statements.length === 0) continue;
    for (const stmt of statements) {
      await db.execute(stmt);
    }
    await db.execute({
      sql: 'INSERT INTO _migrations (filename) VALUES (?)',
      args: [file],
    });
    console.log(`applied ${file}`);
    count++;
  }
  if (count === 0) console.log('no migrations to apply');
  else console.log(`done: ${count} migration(s) applied`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
