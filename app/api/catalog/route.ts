import { NextRequest, NextResponse } from 'next/server';
import { listCatalog, searchCatalog } from '@/server/actions/catalog';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });
  if (!can(session.user.role, 'catalog:read') && !can(session.user.role, 'treatments:read')) {
    return NextResponse.json([], { status: 403 });
  }
  const q = req.nextUrl.searchParams.get('q');
  const data = q ? await searchCatalog(q) : await listCatalog();
  return NextResponse.json(data);
}
