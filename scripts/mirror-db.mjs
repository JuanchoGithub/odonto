#!/usr/bin/env node
/**
 * Mirror a source (Turso/libSQL/SQLite) database into a local SQLite file,
 * replacing whatever data is currently in the target. The target schema is
 * preserved (assumed identical — same migration set); only data is replaced.
 *
 * READ-ONLY against the source: it never writes to production.
 *
 * The remote read and the local write run in SEPARATE OS processes because
 * holding a remote (HTTP) client and a file client in one process panics the
 * native @libsql runtime (even after close()). So we dump to a temp JSON file
 * in a child process, then import it into the local file in this process.
 *
 * Usage:
 *   set -a; source .local/.env.production; set +a
 *   node scripts/mirror-db.mjs               # reads TURSO_URL/TURSO_TOKEN, writes file:./.e2e.db
 *   MIRROR_TARGET='file:./.local/production.db' node scripts/mirror-db.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

const SOURCE_URL = process.env.TURSO_URL;
const SOURCE_TOKEN = process.env.TURSO_TOKEN || undefined;
const TARGET_URL = process.env.MIRROR_TARGET || 'file:./.e2e.db';
const DUMP_PATH = process.env.MIRROR_DUMP || '/tmp/odonto-prod-dump.json';

if (!SOURCE_URL) {
  console.error('TURSO_URL is required (point at the source database).');
  process.exit(1);
}

function qident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// The dump code runs as a child so its native runtime stays isolated from the
// local-write client below.
const dumpCode = `
const { createClient } = require('@libsql/client');
const src = createClient({ url: process.env.DUMP_SRC_URL, authToken: process.env.DUMP_SRC_TOKEN || undefined });
(async () => {
  const names = (await src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map(r => r.name);
  const data = {};
  for (const t of names) {
    const r = await src.execute('SELECT * FROM "' + t + '"');
    // rows are objects keyed by column; the import needs positional arrays.
    data[t] = { columns: r.columns, rows: r.rows.map(row => r.columns.map(c => row[c])) };
  }
  src.close();
  require('node:fs').writeFileSync(process.env.DUMP_PATH, JSON.stringify(data));
  console.error('dumped ' + names.length + ' tables');
})().catch(e => { console.error(e); process.exit(1); });
`;

console.log(`Dumping ${SOURCE_URL} (child process) ...`);
const child = spawnSync(process.execPath, ['-e', dumpCode], {
  env: {
    ...process.env,
    DUMP_SRC_URL: SOURCE_URL,
    DUMP_SRC_TOKEN: SOURCE_TOKEN ?? '',
    DUMP_PATH,
  },
  encoding: 'utf8',
});
if (child.status !== 0) {
  console.error(child.stderr || child.stdout || 'dump child failed');
  process.exit(child.status ?? 1);
}

// Import the dump into the local file.
console.log(`Writing ${TARGET_URL} ...`);
const data = JSON.parse(readFileSync(DUMP_PATH, 'utf8'));
const dst = createClient({ url: TARGET_URL });
await dst.execute('PRAGMA foreign_keys = OFF');
for (const table of Object.keys(data)) {
  const { columns, rows } = data[table];
  if (columns.length === 0) continue;
  const colList = columns.map(qident).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${qident(table)} (${colList}) VALUES (${placeholders})`;
  await dst.execute(`DELETE FROM ${qident(table)}`);
  for (const row of rows) {
    await dst.execute({ sql: insertSql, args: row });
  }
  console.log(`  ${table}: ${rows.length} rows`);
}
dst.close();
console.log('Mirror complete.');