import { auth } from './auth';
import { redirect } from 'next/navigation';
import type { Role } from './schemas/common';

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return session.user;
}

export async function requireRole(allowed: Role[]) {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect('/dashboard');
  }
  return user;
}

export function can(role: Role, action: string): boolean {
  const matrix: Record<Role, string[]> = {
    admin: ['*'],
    dentist: [
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'odontogram:read',
      'odontogram:write',
      'treatments:read',
      'treatments:write',
      'billing:read',
      'reports:read',
      'insurers:read',
      'insurers:write',
    ],
    receptionist: [
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'billing:read',
      'billing:write',
      'reports:read',
      'insurers:read',
      'insurers:write',
    ],
  };
  if (matrix[role].includes('*')) return true;
  return matrix[role].includes(action);
}
