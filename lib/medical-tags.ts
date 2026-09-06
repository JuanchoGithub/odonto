/** Shared constants + pure helpers for medical tags (Médico / Medical tab). */

/** The six free-text fields that accept tags. */
export const MEDICAL_TAG_FIELDS = [
  'contagious_diseases',
  'allergies_medication',
  'current_medications',
  'chronic_conditions',
  'medical_history',
  'allergies',
] as const;
export type MedicalTagField = (typeof MEDICAL_TAG_FIELDS)[number];

export const MIN_TAG_LENGTH = 3;

export const MEDICAL_TAG_FIELDS_LABEL_KEYS: Record<MedicalTagField, string> = {
  contagious_diseases: 'contagiousDiseases',
  allergies_medication: 'allergiesMedication',
  current_medications: 'currentMedications',
  chronic_conditions: 'chronicConditions',
  medical_history: 'medicalHistory',
  allergies: 'allergies',
};

/** Trim and strip surrounding punctuation so "aspirin," matches "aspirin". */
export function stripPunct(s: string): string {
  return s
    .replace(/^[.,;:!?()[\]{}"'\u00AB\u00BB*]+/, '')
    .replace(/[.,;:!?()[\]{}"'\u00AB\u00BB*]+$/, '');
}

/** Lowercase, accent-insensitive key used for matching/dedup. */
export function keyOf(term: string): string {
  return term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Validate a term: length, single-word. Returns error string or null when valid. */
export function validateTagTerm(field: string, raw: string): string | null {
  if (!MEDICAL_TAG_FIELDS.includes(field as MedicalTagField)) {
    return 'Invalid field';
  }
  const term = stripPunct(raw.trim());
  if (term.length < MIN_TAG_LENGTH) {
    return `Tag must be at least ${MIN_TAG_LENGTH} characters`;
  }
  if (/\s/.test(term)) {
    return 'Tags must be a single word';
  }
  return null;
}