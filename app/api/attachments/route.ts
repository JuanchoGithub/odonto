import { NextRequest, NextResponse } from 'next/server';
import { listAttachments } from '@/server/actions/attachments';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const patientId = req.nextUrl.searchParams.get('patient_id');
  if (!patientId) return NextResponse.json([], { status: 400 });
  const data = await listAttachments(patientId);
  return NextResponse.json(data);
}
