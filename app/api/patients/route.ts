import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listPatients, createPatientJson } from '@/server/actions/patients';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  if (!can(session.user.role, 'patients:read')) return NextResponse.json([], { status: 403 });
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 200;
  const rows = await listPatients(q, limit);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(session.user.role, 'patients:write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const result = await createPatientJson(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.patient, { status: 201 });
}
