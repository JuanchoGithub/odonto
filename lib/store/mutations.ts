'use client';

import { emitStore } from './bus';
import { upsertRow, removeRow, CONFLICT_KEY, MUTATION_KEY } from './snapshots';
import type { KindRow } from './snapshots';

/**
 * Offline-first write queue for low-risk bulk entities (patients, insurers,
 * catalog, treatments). Writes apply optimistically to the local snapshots
 * and flush to the DB at the next sync. Time-critical writes (appointments,
 * odontogram, invoices, payments, attachments) bypass the queue and flush
 * immediately via their server actions.
 */

export type BatchEntity = 'patient' | 'insurer' | 'catalog' | 'treatment';

export type MutationAction = 'create' | 'update' | 'delete';

export interface MutationOp {
  /** Client-generated op id (dedupe + reconciliation key). */
  id: string;
  entity: BatchEntity;
  action: MutationAction;
  /** Structured fields for the server replay core. */
  payload: Record<string, unknown>;
  /** Row id for update/delete (or temp id for create). */
  rowId: string;
  /** Server updated_at the client saw when the edit started (conflicts). */
  baseVersion: string | null;
  at: string;
}

export interface ConflictRec {
  opId: string;
  entity: BatchEntity;
  action: MutationAction;
  rowId: string;
  at: string;
  note: string;
}

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readKey<T>(key: string, fallback: T): T {
  if (!isClient()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return fallback;
}

function writeKey(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (queue/conflicts are small; quota failure is unlikely)
  }
}

export function getQueue(): MutationOp[] {
  return readKey<MutationOp[]>(MUTATION_KEY, []);
}

export function enqueueOp(op: MutationOp): void {
  const q = getQueue();
  q.push(op);
  writeKey(MUTATION_KEY, q);
  applyOptimistic(op);
}

export function dropOps(ids: string[]): void {
  if (ids.length === 0) return;
  const set = new Set(ids);
  writeKey(
    MUTATION_KEY,
    getQueue().filter((o) => !set.has(o.id)),
  );
  emitStore();
}

export function getConflicts(): ConflictRec[] {
  return readKey<ConflictRec[]>(CONFLICT_KEY, []);
}

export function addConflict(c: ConflictRec): void {
  const list = getConflicts();
  list.push(c);
  writeKey(CONFLICT_KEY, list.slice(-100));
  emitStore();
}

export function clearConflicts(): void {
  writeKey(CONFLICT_KEY, []);
  emitStore();
}

export function clearMutationState(): void {
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(MUTATION_KEY);
    window.localStorage.removeItem(CONFLICT_KEY);
  } catch {
    // ignore
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function tempId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export function newOpId(): string {
  return tempId();
}

/**
 * Apply a queued op to the local snapshots so the UI reflects the write
 * instantly. Server reconciliation at sync time replaces temp rows.
 */
function applyOptimistic(op: MutationOp): void {
  const p = op.payload;
  try {
    if (op.entity === 'patient') {
      if (op.action === 'create') {
        upsertRow('patients', {
          id: op.rowId,
          first_name: String(p.first_name ?? ''),
          last_name: String(p.last_name ?? ''),
          document_id: (p.document_id as string) || null,
          birth_date: (p.birth_date as string) || null,
          gender: (p.gender as string) || null,
          phone: (p.phone as string) || null,
          email: (p.email as string) || null,
          address: (p.address as string) || null,
          insurance_provider: (p.insurance_provider as string) || null,
          insurance_number: (p.insurance_number as string) || null,
          insurer_id: (p.insurer_id as string) || null,
          insurance_plan: (p.insurance_plan as string) || null,
          medical_history: (p.medical_history as string) || null,
          allergies: (p.allergies as string) || null,
          notes: (p.notes as string) || null,
          deleted_at: null,
          chronic_conditions: (p.chronic_conditions as string) || null,
          contagious_diseases: (p.contagious_diseases as string) || null,
          current_medications: (p.current_medications as string) || null,
          allergies_medication: (p.allergies_medication as string) || null,
          blood_pressure: (p.blood_pressure as string) || null,
          blood_type: (p.blood_type as string) || null,
          diabetes: (p.diabetes as string) || null,
          pregnant: (p.pregnant as string) || null,
          last_medical_update: (p.last_medical_update as string) || null,
          created_at: op.at,
          updated_at: op.at,
        } as KindRow['patients']);
      } else if (op.action === 'update') {
        upsertRow('patients', {
          id: op.rowId,
          first_name: String(p.first_name ?? ''),
          last_name: String(p.last_name ?? ''),
          document_id: (p.document_id as string) || null,
          birth_date: (p.birth_date as string) || null,
          gender: (p.gender as string) || null,
          phone: (p.phone as string) || null,
          email: (p.email as string) || null,
          address: (p.address as string) || null,
          insurance_provider: (p.insurance_provider as string) || null,
          insurance_number: (p.insurance_number as string) || null,
          insurer_id: (p.insurer_id as string) || null,
          insurance_plan: (p.insurance_plan as string) || null,
          medical_history: (p.medical_history as string) || null,
          allergies: (p.allergies as string) || null,
          notes: (p.notes as string) || null,
          deleted_at: null,
          chronic_conditions: (p.chronic_conditions as string) || null,
          contagious_diseases: (p.contagious_diseases as string) || null,
          current_medications: (p.current_medications as string) || null,
          allergies_medication: (p.allergies_medication as string) || null,
          blood_pressure: (p.blood_pressure as string) || null,
          blood_type: (p.blood_type as string) || null,
          diabetes: (p.diabetes as string) || null,
          pregnant: (p.pregnant as string) || null,
          last_medical_update: (p.last_medical_update as string) || null,
          created_at: (p.created_at as string) || op.at,
          updated_at: op.at,
        } as KindRow['patients']);
      } else {
        // delete → soft-delete marker; the sync confirms against the server.
        upsertRow('patients', {
          id: op.rowId,
          first_name: '',
          last_name: '',
          document_id: null,
          birth_date: null,
          gender: null,
          phone: null,
          email: null,
          address: null,
          insurance_provider: null,
          insurance_number: null,
          insurer_id: null,
          insurance_plan: null,
          medical_history: null,
          allergies: null,
          notes: null,
          deleted_at: op.at,
          chronic_conditions: null,
          contagious_diseases: null,
          current_medications: null,
          allergies_medication: null,
          blood_pressure: null,
          blood_type: null,
          diabetes: null,
          pregnant: null,
          last_medical_update: null,
          created_at: op.at,
          updated_at: op.at,
        } as KindRow['patients']);
      }
    } else if (op.entity === 'insurer') {
      if (op.action === 'delete') {
        removeRow('insurers', op.rowId);
      } else {
        upsertRow('insurers', {
          id: op.rowId,
          name: String(p.name ?? ''),
          plan: (p.plan as string) || null,
          phone: (p.phone as string) || null,
          email: (p.email as string) || null,
          notes: (p.notes as string) || null,
          created_at: (p.created_at as string) || op.at,
          updated_at: op.at,
        } as KindRow['insurers']);
      }
    } else if (op.entity === 'catalog') {
      if (op.action === 'delete') {
        upsertRow('catalog', {
          id: op.rowId,
          code: (p.code as string) ?? null,
          description: String(p.description ?? ''),
          default_price_cents: Number(p.default_price_cents ?? 0),
          tax_kind: String(p.tax_kind ?? 'standard'),
          kind: String(p.kind ?? 'general'),
          is_definitive: Number(p.is_definitive ?? 0),
          created_by: (p.created_by as string) ?? null,
          created_at: (p.created_at as string) || op.at,
          archived_at: op.at,
          updated_at: op.at,
        } as unknown as KindRow['catalog']);
      } else {
        upsertRow('catalog', {
          id: op.rowId,
          code: (p.code as string) ?? null,
          description: String(p.description ?? ''),
          default_price_cents: Number(p.default_price_cents ?? 0),
          tax_kind: String(p.tax_kind ?? 'standard'),
          kind: String(p.kind ?? 'general'),
          is_definitive: Number(p.is_definitive ?? ('definitive' in p ? p.definitive : 0)),
          created_by: (p.created_by as string) ?? null,
          created_at: (p.created_at as string) || op.at,
          archived_at: (p.archived_at as string) ?? null,
          updated_at: op.at,
        } as unknown as KindRow['catalog']);
      }
    } else if (op.entity === 'treatment') {
      if (op.action === 'delete') {
        upsertRow('treatments', {
          id: op.rowId,
          patient_id: String(p.patient_id ?? ''),
          patient_name: String(p.patient_name ?? ''),
          description: String(p.description ?? ''),
          code: (p.code as string) ?? null,
          cost_cents: Number(p.cost_cents ?? 0),
          tax_kind: String(p.tax_kind ?? 'standard'),
          status: 'cancelled',
          tooth_number: (p.tooth_number as number) ?? null,
          performed_at: (p.performed_at as string) ?? null,
          created_at: (p.created_at as string) || op.at,
          updated_at: op.at,
        } as unknown as KindRow['treatments']);
      } else {
        upsertRow('treatments', {
          id: op.rowId,
          patient_id: String(p.patient_id ?? ''),
          patient_name: String(p.patient_name ?? ''),
          appointment_id: (p.appointment_id as string) ?? null,
          description: String(p.description ?? ''),
          code: (p.code as string) ?? null,
          cost_cents: Number(p.cost_cents ?? 0),
          tax_kind: String(p.tax_kind ?? 'standard'),
          status: String(p.status ?? 'planned'),
          tooth_number: (p.tooth_number as number) ?? null,
          performed_at: (p.performed_at as string) ?? null,
          performed_by: (p.performed_by as string) ?? null,
          created_at: (p.created_at as string) || op.at,
          updated_at: op.at,
        } as unknown as KindRow['treatments']);
      }
    }
  } catch {
    // Optimistic apply is best-effort; the sync will reconcile.
  }
  emitStore();
}

/** Build a create/update/delete op with a fresh temp row id when needed. */
export function buildOp(
  entity: BatchEntity,
  action: MutationAction,
  payload: Record<string, unknown>,
  rowId?: string,
  baseVersion?: string | null,
): MutationOp {
  const at = nowIso();
  return {
    id: newOpId(),
    entity,
    action,
    payload,
    rowId: rowId ?? tempId(),
    baseVersion: baseVersion ?? null,
    at,
  };
}
