'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { requireRole, requireCan } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import {
  parseTemplates,
  serializeTemplates,
  BUILTIN_TEMPLATES,
  type WhatsappTemplate,
} from '@/lib/whatsapp';

const CountryCodeSchema = z
  .string()
  .min(1)
  .max(8)
  .regex(/^\+?\d{1,5}$/, 'Invalid country code');

const TemplateSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['confirmation', 'no_show', 'custom']),
  label_es: z.string().min(1).max(80),
  label_en: z.string().min(1).max(80),
  body_es: z.string().min(1).max(800),
  body_en: z.string().min(1).max(800),
  applies_to: z.enum(['upcoming', 'past', 'any']),
  enabled: z.union([z.literal(0), z.literal(1)]),
});

const SettingsSchema = z.object({
  countryCode: CountryCodeSchema,
  templates: z.array(TemplateSchema).max(20),
});

export type WhatsappSettingsInput = z.infer<typeof SettingsSchema>;

/**
 * Persist per-clinic WhatsApp settings (default country code + message
 * templates). Admin-only. Built-in templates (`confirmation`, `no_show`)
 * are preserved even if the admin removes them from the list — they get
 * restored from `BUILTIN_TEMPLATES` so the panel always has at least
 * something to ship.
 */
export async function updateWhatsappSettings(input: WhatsappSettingsInput) {
  const me = await requireRole(['admin']);
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const clinic = await queryOne<{ id: string }>('SELECT id FROM clinics LIMIT 1');
  if (!clinic) return { error: 'no_clinic' as const };
  const templates = ensureBuiltins(parsed.data.templates);
  const cc = parsed.data.countryCode.startsWith('+')
    ? parsed.data.countryCode
    : `+${parsed.data.countryCode}`;
  await query(
    `UPDATE clinics SET whatsapp_default_country_code = ?, whatsapp_templates = ?, updated_at = ? WHERE id = ?`,
    [cc, serializeTemplates(templates), nowIso(), clinic.id],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'clinic', ?, ?)`,
    [
      uid(),
      me.id,
      clinic.id,
      JSON.stringify({
        kind: 'whatsapp_settings',
        country_code: cc,
        template_count: templates.length,
      }),
    ],
  );
  revalidatePath('/', 'layout');
  revalidatePath('/settings');
  return { ok: true as const };
}

/** Make sure the two built-in templates are always present and in canonical order. */
function ensureBuiltins(templates: WhatsappTemplate[]): WhatsappTemplate[] {
  const byId = new Map(templates.map((t) => [t.id, t] as const));
  for (const built of BUILTIN_TEMPLATES) {
    const existing = byId.get(built.id);
    if (!existing) {
      byId.set(built.id, built);
    } else {
      // Built-in kind is fixed (we don't let admin flip confirmation ↔ no_show).
      byId.set(built.id, { ...existing, kind: built.kind });
    }
  }
  const order = ['builtin_confirmation', 'builtin_no_show'];
  return [...byId.values()].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
}

const PhoneSchema = z
  .string()
  .min(1, 'Required')
  .max(64)
  .regex(/^[+0-9 ()-]+$/, 'Invalid phone');

/**
 * Capture a patient phone on the fly from the missing-phone prompt. The
 * phone is stored as-typed (so search/display stays consistent with the
 * existing `PatientForm` flow); wa.me URL is built by `waMePhone` which
 * strips non-digits on the fly. Re-validates the patient still exists
 * before writing.
 */
export async function updatePatientPhoneInline(
  patientId: string,
  phone: string,
): Promise<
  | { ok: true; phone: string; patient_name: string; patient_id: string }
  | { error: 'forbidden' | 'invalid' | 'not_found' }
> {
  const guard = await requireCan('patients:write');
  if (guard.error === 'unauthorized') return { error: 'forbidden' };
  if (guard.error === 'forbidden') return { error: 'forbidden' };
  const trimmed = phone.trim();
  if (!PhoneSchema.safeParse(trimmed).success) return { error: 'invalid' };
  const existing = await queryOne<{ id: string; first_name: string; last_name: string }>(
    `SELECT id, first_name, last_name FROM patients WHERE id = ? AND deleted_at IS NULL`,
    [patientId],
  );
  if (!existing) return { error: 'not_found' };
  await query(
    `UPDATE patients SET phone = ?, updated_at = ? WHERE id = ?`,
    [trimmed, nowIso(), patientId],
  );
  await query(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, meta) VALUES (?, ?, 'update', 'patient', ?, ?)`,
    [
      uid(),
      guard.user!.id,
      patientId,
      JSON.stringify({ kind: 'phone_inline', phone: trimmed }),
    ],
  );
  revalidatePath('/', 'layout');
  return {
    ok: true,
    phone: trimmed,
    patient_name: `${existing.first_name} ${existing.last_name}`.trim(),
    patient_id: patientId,
  };
}

/** Read the clinic's current WhatsApp settings (server-side). */
export async function getWhatsappSettings(): Promise<{
  countryCode: string;
  templates: WhatsappTemplate[];
}> {
  const row = await queryOne<{
    whatsapp_default_country_code: string;
    whatsapp_templates: string;
  }>('SELECT whatsapp_default_country_code, whatsapp_templates FROM clinics LIMIT 1');
  if (!row) {
    return {
      countryCode: '+54',
      templates: parseTemplates(null),
    };
  }
  return {
    countryCode: row.whatsapp_default_country_code || '+54',
    templates: parseTemplates(row.whatsapp_templates),
  };
}
