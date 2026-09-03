import { NextRequest, NextResponse } from 'next/server';
import { listTreatmentsForPatient, listAllTreatments } from '@/server/actions/treatments';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const patientId = req.nextUrl.searchParams.get('patient_id');
  const data = patientId
    ? await listTreatmentsForPatient(patientId)
    : await listAllTreatments();
  return NextResponse.json(data);
}
