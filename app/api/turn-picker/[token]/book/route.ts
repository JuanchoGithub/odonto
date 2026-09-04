import { NextRequest, NextResponse } from 'next/server';
import { bookViaPicker } from '@/server/actions/turn-picker';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`tp-book:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { token } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const slotStart =
    typeof body === 'object' && body !== null
      ? (body as { slotStart?: unknown }).slotStart
      : undefined;
  if (typeof slotStart !== 'string') {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const result = await bookViaPicker(token, slotStart);
  if (!result.ok) {
    const status =
      result.reason === 'invalid'
        ? 404
        : result.reason === 'consumed'
          ? 410
          : result.reason === 'expired'
            ? 410
            : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(result, { status: 201 });
}
