import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listPatients } from '@/server/actions/patients';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const rows = await listPatients(q);
  return NextResponse.json(rows);
}
