#!/usr/bin/env node
// One-shot Vercel setup. Runs locally with creds in env.
//
// Required:
//   VERCEL_TOKEN     — Vercel personal token (https://vercel.com/account/tokens)
//   TURSO_URL        — libsql://...  (production Turso DB URL)
//   TURSO_TOKEN      — Turso DB auth token
//
// Optional:
//   VERCEL_PROJECT   — name of an existing Vercel project to re-use.
//                      If omitted, the script tries to look up a project whose
//                      production URL matches the URL Vercel would assign to
//                      the current `name` from package.json; if nothing is
//                      found it links under that name (creating a new project).
//   BLOB_READ_WRITE_TOKEN — Vercel Blob token. If absent, the script tries to
//                      create a store named "odonto" via the Vercel API and
//                      capture the token from the response. If the store
//                      already exists, you must provide the token via env.
//   AUTH_URL         — public URL of the deploy (e.g. https://clinica-odonto-jet.vercel.app).
//                      Defaults to https://<VERCEL_PROJECT or package.name>.vercel.app.
//
// What this script does:
//   1. Links the Vercel project (existing or new).
//   2. Creates a Vercel Blob store if needed.
//   3. Pushes env vars to Vercel (production / preview / development).
//   4. Runs `npm run migrate` against the production Turso DB.
//   5. Triggers a fresh production deploy by pushing to `main`.
//
// This script does NOT touch GitHub secrets. The deploy workflow reads
// env from Vercel at deploy time.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;
let BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const VERCEL_PROJECT_OVERRIDE = process.env.VERCEL_PROJECT;

if (!VERCEL_TOKEN) {
  console.error('VERCEL_TOKEN is required. Generate one at https://vercel.com/account/tokens');
  process.exit(1);
}
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('TURSO_URL and TURSO_TOKEN are required.');
  process.exit(1);
}

const ENV_TARGETS = ['production', 'preview', 'development'];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    if (!opts.continueOnError) process.exit(1);
  }
  return r;
}

function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}\n${r.stderr}`);
    process.exit(1);
  }
  return r.stdout.trim();
}

function vercelApi(path, init = {}) {
  const args = [
    '-sS',
    '-H', `Authorization: Bearer ${VERCEL_TOKEN}`,
  ];
  if (init.method) args.push('-X', init.method);
  if (init.body) {
    args.push('-H', 'Content-Type: application/json', '-d', init.body);
  }
  args.push(`https://api.vercel.com${path}`);
  const r = spawnSync('curl', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`Vercel API call failed: ${r.stderr}`);
  }
  return r.stdout.trim();
}

function findProjectByName(name) {
  const json = vercelApi(`/v9/projects/${encodeURIComponent(name)}`);
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const pkg = JSON.parse(runCapture('cat', ['package.json']));
const desiredName = VERCEL_PROJECT_OVERRIDE || pkg.name;
console.log(`\n=== 1. Resolving Vercel project (${desiredName}) ===\n`);

let project = findProjectByName(desiredName);
let createdNew = false;
if (project && project.id) {
  console.log(`Found existing project: ${project.name} (id=${project.id})`);
} else {
  console.log(`No project named "${desiredName}". Creating a new one…`);
  // `vercel link` with the name as the second positional arg creates the project
  run(
    'npx',
    ['vercel', 'link', '--yes', '--token', VERCEL_TOKEN, desiredName],
    { continueOnError: false },
  );
  createdNew = true;
  const projectJsonRaw = runCapture('cat', ['.vercel/project.json']);
  project = JSON.parse(projectJsonRaw);
}

const projectId = project.id;
const orgId = project.teamId || project.accountId;
console.log(`projectId=${projectId} orgId=${orgId}`);

console.log('\n=== 2. Ensuring Vercel Blob store ===\n');
if (!BLOB_READ_WRITE_TOKEN) {
  const blobName = 'odonto';
  const body = JSON.stringify({ name: blobName });
  const res = vercelApi('/v1/storage/stores', {
    method: 'POST',
    body,
  });
  let store;
  try {
    store = JSON.parse(res);
  } catch {
    store = null;
  }
  if (store?.token) {
    BLOB_READ_WRITE_TOKEN = store.token;
    console.log(`Created Vercel Blob store: ${blobName}`);
  } else if (
    res.toLowerCase().includes('already exists') ||
    res.toLowerCase().includes('store_already_exists')
  ) {
    console.error(
      `Blob store "${blobName}" already exists. The token is not returned on re-create.\n` +
        'Re-run with BLOB_READ_WRITE_TOKEN=<existing token> in your env.',
    );
    process.exit(1);
  } else {
    console.error('Could not create Vercel Blob store. Response:', res);
    process.exit(1);
  }
}

if (!BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN.');
  process.exit(1);
}

console.log('\n=== 3. Pushing env vars to Vercel ===\n');

const AUTH_SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('base64');
const productionUrl =
  process.env.AUTH_URL ||
  (project.alias && project.alias[0]) ||
  `https://${desiredName}.vercel.app`;

const envVars = {
  TURSO_URL: TURSO_URL,
  TURSO_TOKEN: TURSO_TOKEN,
  AUTH_SECRET: AUTH_SECRET,
  AUTH_URL: productionUrl,
  BLOB_READ_WRITE_TOKEN: BLOB_READ_WRITE_TOKEN,
};

function setEnv(key, value, target) {
  const body = JSON.stringify({
    key,
    value,
    target: [target],
    type: target === 'production' ? 'production' : 'sensitive',
  });
  const qs = orgId ? `?teamId=${orgId}` : '';
  const url = `https://api.vercel.com/v10/projects/${projectId}/env${qs}`;
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '-X', 'POST',
      url,
      '-H', `Authorization: Bearer ${VERCEL_TOKEN}`,
      '-H', 'Content-Type: application/json',
      '-d', body,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(`Failed to set ${key} (${target}):`, r.stderr);
    return false;
  }
  return true;
}

for (const [key, value] of Object.entries(envVars)) {
  for (const target of ENV_TARGETS) {
    const ok = setEnv(key, value, target);
    console.log(`  ${ok ? '✓' : '✗'} ${key} @ ${target}`);
  }
}

console.log('\n=== 4. Running prod migrations ===\n');
const migrate = spawnSync('npm', ['run', 'migrate'], {
  stdio: 'inherit',
  env: { ...process.env, TURSO_URL, TURSO_TOKEN },
});
if (migrate.status !== 0) {
  console.error('Migrations failed.');
  process.exit(1);
}

console.log('\n=== 5. Triggering first deploy ===\n');
const push = spawnSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
if (push.status !== 0) {
  console.error('git push failed. Push manually to trigger deploy.');
  process.exit(1);
}

console.log('\n✅ Setup complete.');
console.log(`   - Project: ${desiredName} (${createdNew ? 'new' : 'existing'})`);
console.log('   - Env vars set on Vercel (production / preview / development)');
console.log('   - Migrations applied to prod Turso');
console.log('   - First deploy triggered');
console.log(`\nVisit: https://${desiredName}.vercel.app`);
console.log('Watch: gh run watch');
