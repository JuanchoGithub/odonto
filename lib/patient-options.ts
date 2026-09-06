import type { PatientRow } from '@/server/actions/patients';

export type PatientOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

/**
 * Server-side patient search (name, document, phone, email) shared by the
 * appointment dialog picker and the turn-link generator picker.
 */
export async function fetchPatientOptions(
  q: string,
  signal: AbortSignal,
): Promise<PatientOption[]> {
  const r = await fetch(`/api/patients?q=${encodeURIComponent(q)}&limit=50`, {
    signal,
  });
  if (!r.ok) return [];
  const data = await r.json();
  if (!Array.isArray(data)) return [];
  return data.map((p: PatientRow) => ({
    id: p.id,
    name: `${p.last_name}, ${p.first_name}`,
    phone: p.phone,
    email: p.email,
  }));
}
