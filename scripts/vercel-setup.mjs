#!/usr/bin/env node
// One-shot Vercel + GitHub setup. Runs locally with creds in env.
// Required: VERCEL_TOKEN, TURSO_URL, TURSO_TOKEN
// Optional: BLOB_READ_WRITE_TOKEN (will be created via Vercel API if absent)

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;
let BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

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

console.log('\n=== 1. Linking Vercel project ===\n');
// vercel link with --yes to skip prompts; needs the project to already exist
// or it will create one. We use a stable project name from package.json.
const pkg = JSON.parse(runCapture('cat', ['package.json']));
const projectName = pkg.name; // "odonto"

run('npx', ['vercel', 'link', '--yes', '--token', VERCEL_TOKEN, projectName], {
  continueOnError: true,
});

console.log('\n=== 2. Pulling project info ===\n');
// We need projectId + teamId for the REST API calls.
const projectJsonRaw = runCapture('cat', ['.vercel/project.json']);
const { projectId, orgId } = JSON.parse(projectJsonRaw);
console.log(`projectId=${projectId} orgId=${orgId}`);

console.log('\n=== 3. Ensuring Vercel Blob store ===\n');
if (!BLOB_READ_WRITE_TOKEN) {
  // Create a Blob store via REST API
  const name = 'odonto';
  const res = runCapture(
    'curl',
    [
      '-sS',
      '-X', 'POST',
      `https://api.vercel.com/v1/storage/stores`,
      '-H', `Authorization: Bearer ${VERCEL_TOKEN}`,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ name }),
    ],
    { allowFail: true },
  );
  let store;
  try {
    store = JSON.parse(res);
  } catch {
    store = null;
  }
  if (store?.token) {
    BLOB_READ_WRITE_TOKEN = store.token;
    console.log('Created Vercel Blob store:', name);
  } else if (res.includes('already exists') || res.toLowerCase().includes('store_already_exists')) {
    // The token isn't returned on already-exists; user must set BLOB_READ_WRITE_TOKEN manually
    console.log('Blob store already exists. Re-using requires BLOB_READ_WRITE_TOKEN env var.');
  } else {
    console.error('Could not create Vercel Blob store automatically. Response:', res);
    console.error('Re-run with BLOB_READ_WRITE_TOKEN=<existing token> in your env.');
    process.exit(1);
  }
}

if (!BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN. Provide it as env and re-run.');
  process.exit(1);
}

console.log('\n=== 4. Pushing env vars to Vercel ===\n');

const AUTH_SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('base64');

const envVars = {
  TURSO_URL: TURSO_URL,
  TURSO_TOKEN: TURSO_TOKEN,
  AUTH_SECRET: AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL || `https://${projectName}.vercel.app`,
  BLOB_READ_WRITE_TOKEN: BLOB_READ_WRITE_TOKEN,
};

async function setEnv(key, value, target) {
  const body = JSON.stringify({ key, value, target: [target], type: target === 'production' ? 'production' : 'sensitive' });
  const url = `https://api.vercel.com/v10/projects/${projectId}/env${orgId ? `?teamId=${orgId}` : ''}`;
  const res = spawnSync('curl', [
    '-sS', '-X', 'POST', url,
    '-H', `Authorization: Bearer ${VERCEL_TOKEN}`,
    '-H', 'Content-Type: application/json',
    '-d', body,
  ], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`Failed to set ${key} (${target}):`, res.stderr);
    return false;
  }
  return true;
}

(async () => {
  for (const [key, value] of Object.entries(envVars)) {
    for (const target of ENV_TARGETS) {
      const ok = await setEnv(key, value, target);
      console.log(`  ${ok ? '✓' : '✗'} ${key} @ ${target}`);
    }
  }

  console.log('\n=== 5. Pushing secrets to GitHub Actions ===\n');
  for (const [key, value] of Object.entries(envVars)) {
    const r = spawnSync('gh', [
      'secret', 'set', key, '--body', value, '--repo', 'JuanchoGithub/odonto',
    ], { stdio: 'inherit' });
    if (r.status === 0) console.log(`  ✓ ${key}`);
    else console.log(`  ✗ ${key} (skipping — set it manually in repo settings)`);
  }

  console.log('\n=== 6. Running prod migrations ===\n');
  // Apply migrations against the production Turso DB
  const r = spawnSync('npm', ['run', 'migrate'], {
    stdio: 'inherit',
    env: { ...process.env, TURSO_URL, TURSO_TOKEN },
  });
  if (r.status !== 0) {
    console.error('Migrations failed. Re-run after fixing.');
    process.exit(1);
  }

  console.log('\n=== 7. Triggering first deploy ===\n');
  // Push to main to trigger the deploy workflow
  const push = spawnSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
  if (push.status !== 0) {
    console.error('git push failed. Push manually to trigger deploy.');
    process.exit(1);
  }

  console.log('\n✅ Setup complete.');
  console.log('   - Env vars set on Vercel for all targets');
  console.log('   - Secrets set on GitHub Actions');
  console.log('   - Migrations applied to prod Turso');
  console.log('   - First deploy triggered');
  console.log(`\nVisit: https://${projectName}.vercel.app`);
  console.log('Watch deploy: gh run watch');
})();
