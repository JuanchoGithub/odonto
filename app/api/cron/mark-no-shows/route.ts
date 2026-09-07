import { NextRequest, NextResponse } from 'next/server';
import { sweepOverdueNoShows } from '@/server/actions/appointments';

/**
 * Vercel Cron → automatic no-show sweep (hourly, see vercel.json).
 * Protected by CRON_SECRET; Vercel sends `Authorization: Bearer <secret>`
 * automatically when the env var is set. Local dev can hit it without auth.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('authorization');
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else if (process.env.VERCEL) {
    return NextResponse.json({ error: 'cron_not_configured' }, { status: 503 });
  }
  const grace = Number(process.env.NO_SHOW_GRACE_MIN ?? 60);
  const result = await sweepOverdueNoShows(
    Number.isFinite(grace) && grace > 0 ? grace : 60,
  );
  return NextResponse.json({ ok: true, ...result });
}

// Vercel Cron hits with GET; POST supported for manual admin triggers via curl.
export const POST = GET;
