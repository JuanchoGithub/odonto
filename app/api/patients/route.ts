import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listPatients, createPatientJson } from '@/server/actions/patients';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const rows = await listPatients(q, limit);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
