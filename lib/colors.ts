// Curated palette of distinguishable, readable colors for dentist
// calendar blocks. White text works on all of these.
export const DENTIST_PALETTE = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
  '#ea580c', // orange
  '#4f46e5', // indigo
] as const;

export function randomDentistColor(): string {
  return DENTIST_PALETTE[Math.floor(Math.random() * DENTIST_PALETTE.length)];
}

/** Deterministic fallback color when users.color is NULL. */
export function fallbackDentistColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return DENTIST_PALETTE[h % DENTIST_PALETTE.length];
}

export function dentistColor(
  color: string | null | undefined,
  seed: string,
): string {
  return color || fallbackDentistColor(seed);
}
