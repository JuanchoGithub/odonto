import { NextRequest, NextResponse } from 'next/server';
import { listAppointmentsForWeek } from '@/server/actions/appointments';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const start = req.nextUrl.searchParams.get('start');
  if (!start) return NextResponse.json([], { status: 400 });
  const data = await listAppointmentsForWeek(start);
  return NextResponse.json(data);
}
