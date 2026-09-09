export type PatientOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

/**
 * Patient type-ahead over the offline-first store (cached snapshot, synced
 * every sync run). Zero function invocations per keystroke. The `signal`
 * param is kept for call-site compatibility and is a no-op locally.
 */
export async function fetchPatientOptions(
  q: string,
  _signal?: AbortSignal,
): Promise<PatientOption[]> {
  const { searchPatientsLocal, ensurePatientsSeeded } = await import('@/lib/store/options');
  await ensurePatientsSeeded();
  return searchPatientsLocal(q, 50).map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    email: p.email,
  }));
}
