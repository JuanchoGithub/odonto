import { NextRequest, NextResponse } from 'next/server';
import { getAvailability } from '@/server/actions/turn-picker';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`tp-avail:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { token } = await params;
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const result = await getAvailability(token, from, to);
  if (!result.ok) {
    return NextResponse.json({ error: 'invalid' }, { status: 404 });
  }
  return NextResponse.json(result);
}
