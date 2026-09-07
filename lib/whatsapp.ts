/**
 * WhatsApp deep-link helpers.
 *
 * `wa.me/<digits>?text=<urlencoded body>` opens the WhatsApp app (mobile) or
 * WhatsApp Web (desktop) with a pre-filled message. The phone number must be
 * digits only, no `+` and no spaces/dashes. We sanitize unnormalized user
 * input (which can be `+54 11 5555-5555` or `1155555555`) and optionally
 * auto-prefix a default country code when it is clearly missing.
 *
 * All message-body content is configurable per clinic; this module only
 * renders and substitutes the template — the templates themselves live in
 * `clinics.whatsapp_templates` (JSON) and are edited via Settings.
 */
import { uid } from './utils';

export type WhatsappTemplateKind = 'confirmation' | 'no_show' | 'custom';

export type WhatsappTemplate = {
  id: string;
  kind: WhatsappTemplateKind;
  /** Admin-facing label (es). */
  label_es: string;
  /** Admin-facing label (en). */
  label_en: string;
  /** Message body, es. Supports `{{name}} {{weekday}} {{time}} {{dentist}} {{reason}}`. */
  body_es: string;
  /** Message body, en. Same placeholders. */
  body_en: string;
  /** When this template is the right auto-pick. */
  applies_to: 'upcoming' | 'past' | 'any';
  enabled: 1 | 0;
};

/** Built-in template ids that the UI hides the delete button on. */
export const BUILTIN_TEMPLATE_IDS = new Set([
  'builtin_confirmation',
  'builtin_no_show',
]);

/** Built-in seeds — used as the canonical default if `clinics.whatsapp_templates` is empty. */
export const BUILTIN_TEMPLATES: WhatsappTemplate[] = [
  {
    id: 'builtin_confirmation',
    kind: 'confirmation',
    label_es: 'Confirmación de turno',
    label_en: 'Appointment confirmation',
    body_es:
      'Hola, {{name}}. Hoy {{weekday}} tiene turno a las {{time}}, confirme por favor.',
    body_en:
      'Hi {{name}}. Today {{weekday}} you have an appointment at {{time}}, please confirm.',
    applies_to: 'upcoming',
    enabled: 1,
  },
  {
    id: 'builtin_no_show',
    kind: 'no_show',
    label_es: 'Recordatorio de inasistencia',
    label_en: 'No-show follow-up',
    body_es:
      'Hola {{name}}, hoy {{weekday}} tenía un turno a las {{time}}, pero no se presentó, ¿podría confirmar si cancela el turno? Gracias.',
    body_en:
      'Hi {{name}}, today {{weekday}} you had an appointment at {{time}}, but you did not show up. Could you confirm whether you are cancelling the appointment? Thank you.',
    applies_to: 'past',
    enabled: 1,
  },
];

/** Parse the JSON column. Returns the built-in seeds when the column is empty/invalid. */
export function parseTemplates(raw: string | null | undefined): WhatsappTemplate[] {
  if (!raw) return [...BUILTIN_TEMPLATES];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...BUILTIN_TEMPLATES];
    return parsed.filter(isTemplate);
  } catch {
    return [...BUILTIN_TEMPLATES];
  }
}

function isTemplate(v: unknown): v is WhatsappTemplate {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.kind === 'string' &&
    typeof t.body_es === 'string' &&
    typeof t.body_en === 'string'
  );
}

/** Serialize templates to JSON for writing back to the DB column. */
export function serializeTemplates(templates: WhatsappTemplate[]): string {
  return JSON.stringify(templates);
}

/**
 * A user's WhatsApp override. All fields nullable — a null means "inherit
 * the clinic default" for that dimension.
 */
export type UserWhatsappOverride = {
  /** Serialized JSON or null (inherit). */
  templates: string | null;
  /** Dial code or null (inherit). */
  defaultCountryCode: string | null;
};

/**
 * Resolve the effective templates + country code for a user given their
 * override (nullable) and the clinic defaults. A user with a non-empty
 * override wins over the clinic; otherwise the clinic default is used.
 */
export function resolveWhatsappForUser(
  override: UserWhatsappOverride | null | undefined,
  clinicTemplates: WhatsappTemplate[],
  clinicCountryCode: string,
): { templates: WhatsappTemplate[]; countryCode: string } {
  const parsed = override?.templates
    ? parseTemplates(override.templates)
    : null;
  const templates = parsed && parsed.length > 0 ? parsed : clinicTemplates;
  const countryCode = override?.defaultCountryCode?.trim()
    ? override.defaultCountryCode.trim()
    : clinicCountryCode;
  return { templates, countryCode };
}

/** Build a lookup of userId → resolved override given raw rows + clinic defaults. */
export function buildUserWhatsappMap(
  rows: {
    id: string;
    whatsapp_templates: string | null;
    whatsapp_default_country_code: string | null;
  }[],
  clinicTemplates: WhatsappTemplate[],
  clinicCountryCode: string,
): Map<string, { templates: WhatsappTemplate[]; countryCode: string }> {
  const map = new Map<
    string,
    { templates: WhatsappTemplate[]; countryCode: string }
  >();
  for (const r of rows) {
    map.set(
      r.id,
      resolveWhatsappForUser(
        {
          templates: r.whatsapp_templates,
          defaultCountryCode: r.whatsapp_default_country_code,
        },
        clinicTemplates,
        clinicCountryCode,
      ),
    );
  }
  return map;
}

/**
 * Normalize a free-text phone to a wa.me-safe digit string (no `+`).
 * Returns the empty string when the input has no digits.
 */
export function waMeDigits(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
  return digits;
}

/**
 * Normalize a free-text phone and auto-prefix `defaultCountryCode` when the
 * caller clearly didn't include one. The heuristic: if the digit count is
 * less than 11 (rough threshold: any number with a country code is 11+)
 * AND the digits don't already start with the country code, prefix it.
 *
 * Examples (default `+54`):
 *   `+54 9 11 5555-5555` → `5491155555555` (already has +54, untouched)
 *   `1155555555`         → `5411555555555`  (no country code → prefixed)
 *   `+1 555 555 5555`    → `15555555555`    (already has +1, untouched)
 */
export function waMePhone(
  raw: string | null | undefined,
  defaultCountryCode: string,
): string {
  const digits = waMeDigits(raw);
  if (!digits) return '';
  const ccDigits = (defaultCountryCode || '').replace(/[^\d]/g, '');
  if (!ccDigits) return digits;
  if (digits.startsWith(ccDigits)) return digits;
  if (digits.length >= 11) return digits;
  return ccDigits + digits;
}

/**
 * Build a wa.me URL with pre-filled body. Returns `null` when the phone is
 * empty after normalization.
 */
export function waMeUrl(
  rawPhone: string | null | undefined,
  body: string,
  defaultCountryCode: string,
): string | null {
  const cleaned = waMePhone(rawPhone, defaultCountryCode);
  if (!cleaned) return null;
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(body)}`;
}

/** Substituted placeholders. Whitespace is collapsed to keep messages clean. */
export type WhatsappContext = {
  patientName: string;
  weekday: string;
  time: string;
  dentist?: string | null;
  reason?: string | null;
};

export function fillTemplate(body: string, ctx: WhatsappContext): string {
  return body
    .replaceAll('{{name}}', ctx.patientName)
    .replaceAll('{{weekday}}', ctx.weekday)
    .replaceAll('{{time}}', ctx.time)
    .replaceAll('{{dentist}}', ctx.dentist ?? '')
    .replaceAll('{{reason}}', ctx.reason ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pick the body string for the active UI locale. */
export function templateBody(
  tpl: WhatsappTemplate,
  locale: 'es' | 'en',
): string {
  return locale === 'en' ? tpl.body_en : tpl.body_es;
}

/** Pick the label string for the active UI locale. */
export function templateLabel(
  tpl: WhatsappTemplate,
  locale: 'es' | 'en',
): string {
  return locale === 'en' ? tpl.label_en : tpl.label_es;
}

/**
 * Pick the most appropriate template for the appointment context. Order of
 * preference:
 *
 *  1. For `no_show` / `cancelled` → first enabled `applies_to: 'past'`.
 *  2. For overdue `scheduled`/`arrived` → first enabled `applies_to: 'past'`.
 *  3. For future / active → first enabled `applies_to: 'upcoming'`.
 *  4. Fallback to first enabled template.
 *  5. Last-resort: first built-in confirmation.
 */
export function pickAutoTemplate(
  templates: WhatsappTemplate[],
  status: string,
  isFuture: boolean,
): WhatsappTemplate {
  const enabled = templates.filter((t) => Number(t.enabled) === 1);
  const pool = enabled.length > 0 ? enabled : BUILTIN_TEMPLATES;
  const pastFirst = pool.find((t) => t.applies_to === 'past');
  const upcomingFirst = pool.find((t) => t.applies_to === 'upcoming');
  if (status === 'no_show' || status === 'cancelled') {
    return pastFirst ?? upcomingFirst ?? pool[0]!;
  }
  if (!isFuture) {
    return pastFirst ?? upcomingFirst ?? pool[0]!;
  }
  return upcomingFirst ?? pastFirst ?? pool[0]!;
}

/** Generate a stable id for new custom templates. */
export function newTemplateId(): string {
  return uid();
}

/** Localized weekday name from a clinic date (YYYY-MM-DD) string. */
export function weekdayFromClinicDate(
  date: string,
  locale: 'es' | 'en',
): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Localized HH:MM from a clinic-local time string ("HH:MM"). */
export function timeFromHhmm(hhmm: string, locale: 'es' | 'en'): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const sample = new Date(Date.UTC(2026, 0, 4, h, m));
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: locale === 'en',
    timeZone: 'UTC',
  }).format(sample);
}
