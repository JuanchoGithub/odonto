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

/** Validate a term: length only (single- and multi-word allowed). */
export function validateTagTerm(field: string, raw: string): string | null {
  if (!MEDICAL_TAG_FIELDS.includes(field as MedicalTagField)) {
    return 'Invalid field';
  }
  const term = stripPunct(raw.trim());
  if (term.length < MIN_TAG_LENGTH) {
    return `Tag must be at least ${MIN_TAG_LENGTH} characters`;
  }
  return null;
}

/* ===========================================================================
 * Marker encoding.
 * A tag is persisted inside the text as a delimiter the HTML renderer strips:
 *   - single word : _word_          e.g. _hiv_
 *   - multi word  : _"word word"_   e.g. _"myocardial infarction"_
 * The quotes disambiguate multi-word so a plain _phrase_ isn't misread as a tag.
 * ========================================================================= */

const TAG_RE = /_"(?:[^"\\]|\\.)*"_|_(?:[^_\s"])+_/g;

export type TagSegment =
  | { type: 'text'; value: string }
  | { type: 'tag'; value: string };

/** Split text into free-text and tagged segments (tags first, then text). */
export function parseMarkers(text: string): TagSegment[] {
  const segments: TagSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) });
    const raw = m[0];
    let value: string;
    if (raw.startsWith('_"') && raw.endsWith('"_')) {
      value = raw.slice(2, -2);
    } else {
      value = raw.slice(1, -1);
    }
    segments.push({ type: 'tag', value });
    last = m.index + raw.length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

/** Strip markers, returning the plain text (for surfaces outside the editor). */
export function unmark(text: string): string {
  return parseMarkers(text)
    .map((s) => s.value)
    .join('');
}

/** Currently-tagged terms (marker-wrapped), length-filtered. */
export function findTaggedTerms(text: string): string[] {
  return parseMarkers(text)
    .filter((s) => s.type === 'tag')
    .map((s) => s.value)
    .filter((v) => v.length >= MIN_TAG_LENGTH);
}

/** Wrap a single term in markers (single- or multi-word). */
export function wrapTerm(term: string): string {
  return /\s/.test(term) ? `_"${term}"_` : `_${term}_`;
}

/** Tokenize text into words, keeping internal hyphens/apostrophes. */
function tokenizeWords(text: string): string[] {
  return text.split(/[^\p{L}\p{N}'’\-]+/u).filter(Boolean);
}

/**
 * Dictionary terms that appear in the text (case/accent-insensitive).
 * Single-word terms match a whole token; multi-word terms match a contiguous
 * token sequence. Returns the dictionary's display casing.
 */
export function findDictionaryMatches(text: string, dictionary: string[]): string[] {
  const plain = unmark(text);
  const tokens = tokenizeWords(plain).map(keyOf);
  const found: string[] = [];
  for (const term of dictionary) {
    const parts = keyOf(term).split(' ');
    if (parts.length === 1) {
      if (tokens.includes(parts[0])) found.push(term);
    } else {
      for (let i = 0; i + parts.length <= tokens.length; i++) {
        if (parts.every((p, j) => tokens[i + j] === p)) {
          found.push(term);
          break;
        }
      }
    }
  }
  return found;
}