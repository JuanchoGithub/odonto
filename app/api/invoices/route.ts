import { NextRequest, NextResponse } from 'next/server';
import { listInvoices } from '@/server/actions/billing';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  if (!can(session.user.role, 'billing:read')) return NextResponse.json([], { status: 403 });
  const patientId = req.nextUrl.searchParams.get('patient_id');
  if (patientId) {
    const rows = await query(
      `SELECT i.id, i.number, i.issued_at, i.status, i.total_cents
       FROM invoices i WHERE i.patient_id = ? ORDER BY i.issued_at DESC`,
      [patientId],
    );
    return NextResponse.json(rows);
  }
  const rows = await listInvoices();
  return NextResponse.json(rows);
}
