import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listInsurers, createInsurerJson } from '@/server/actions/insurers';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  if (!can(session.user.role, 'insurers:read')) return NextResponse.json([], { status: 403 });
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const rows = await listInsurers(q);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(session.user.role, 'insurers:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const result = await createInsurerJson(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.insurer, { status: 201 });
}
