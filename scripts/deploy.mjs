#!/usr/bin/env node
// Trigger a production deploy via a Vercel Deploy Hook (no token needed).
// Reads DEPLOY_HOOK_URL from the environment.
//
// Usage:
//   set -a; source .local/.env.production; set +a
//   node scripts/deploy.mjs
//
// Optional: --wait (polls https://midentista.vercel.app/es/login until 200)

import { spawnSync } from 'node:child_process';

const HOOK = process.env.DEPLOY_HOOK_URL;
if (!HOOK) {
  console.error('DEPLOY_HOOK_URL is not set. Add it to .local/.env.production');
  console.error('(Create one in Vercel → midentista → Settings → Git → Deploy Hooks)');
  process.exit(1);
}

const wait = process.argv.includes('--wait');

console.log('Triggering Vercel deploy hook…');
const res = spawnSync('curl', ['-sS', '-X', 'POST', HOOK, '-H', 'Content-Type: application/json'], {
  encoding: 'utf8',
});
if (res.status !== 0) {
  console.error('curl failed:', res.stderr);
  process.exit(1);
}
console.log('Response:', res.stdout.trim());
let jobId = null;
try {
  jobId = JSON.parse(res.stdout).job?.id;
} catch {}
if (jobId) {
  console.log(`Vercel job id: ${jobId}`);
  console.log('Watch: https://vercel.com/juanchogithub/odonto');
}

if (!wait) {
  console.log('Done. Pass --wait to poll the production URL until it is live.');
  process.exit(0);
}

console.log('\nPolling https://midentista.vercel.app/es/login (up to ~3 min)…');
for (let i = 1; i <= 30; i++) {
  await new Promise((r) => setTimeout(r, 6000));
  const c = spawnSync(
    'curl',
    ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L', '--max-time', '20', 'https://midentista.vercel.app/es/login'],
    { encoding: 'utf8' },
  );
  const code = (c.stdout || '000').trim();
  console.log(`  [${i}] /es/login -> ${code}`);
  if (code === '200') {
    console.log('\nProduction is live.');
    process.exit(0);
  }
}
console.log('\nProduction did not return 200 within 3 minutes. Check the Vercel dashboard.');
process.exit(1);
