import { z } from 'zod';
import { normalizeDecimalInput } from '@/lib/utils';

/**
 * Shared entity schemas. These live outside 'use server' modules because
 * Next.js forbids exporting non-function values (e.g. zod objects) from
 * server-action files — the actions and the /api/sync replay import them
 * from here.
 */

export const PatientSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  document_id: z.string().optional().nullable(),
  birth_date: z.string().optional().nullable(),
  gender: z.enum(['male', 'female', 'other', '']).optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  insurance_provider: z.string().optional().nullable(),
  insurance_number: z.string().optional().nullable(),
  insurer_id: z.string().optional().nullable(),
  insurance_plan: z.string().optional().nullable(),
  medical_history: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Clinical summary fields (Médico / Medical tab)
  chronic_conditions: z.string().optional().nullable(),
  contagious_diseases: z.string().optional().nullable(),
  current_medications: z.string().optional().nullable(),
  allergies_medication: z.string().optional().nullable(),
  blood_pressure: z.string().optional().nullable(),
  blood_type: z.string().optional().nullable(),
  diabetes: z.string().optional().nullable(),
  pregnant: z.enum(['yes', 'no', 'unknown', '']).optional().nullable(),
  last_medical_update: z.string().optional().nullable(),
});

export type PatientData = z.infer<typeof PatientSchema>;

export const InsurerSchema = z.object({
  name: z.string().min(1),
  plan: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
});

export type InsurerData = z.infer<typeof InsurerSchema>;

export const CatalogSchema = z.object({
  description: z.string().min(1),
  code: z.string().optional().nullable(),
  price: z.preprocess(normalizeDecimalInput, z.coerce.number().min(0).default(0)),
  tax_kind: z.enum(['standard', 'reduced', 'none']).default('standard'),
  kind: z.enum(['consulta', 'general']).default('general'),
});

export type CatalogData = z.infer<typeof CatalogSchema>;

export const TreatmentStatusSchema = z.enum([
  'planned',
  'in_progress',
  'done',
  'cancelled',
]);

export const TreatmentSchema = z.object({
  patient_id: z.string().min(1),
  appointment_id: z.string().optional().nullable(),
  tooth_number: z.coerce.number().int().min(0).max(48).optional().nullable(),
  description: z.string().min(1),
  code: z.string().optional().nullable(),
  cost: z.preprocess(normalizeDecimalInput, z.coerce.number().min(0).default(0)),
  tax_kind: z.enum(['standard', 'reduced', 'none']).default('standard'),
  status: TreatmentStatusSchema.default('planned'),
});

export type TreatmentData = z.infer<typeof TreatmentSchema>;
