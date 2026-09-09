'use client';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InsurerPicker } from '@/components/insurers/insurer-picker';
import { BirthDatePicker } from '@/components/patients/birth-date-picker';
import { TagTextarea } from '@/components/patients/tag-textarea';
import {
  createPatient,
  updatePatient,
  type PatientFormState,
  type PatientRow,
} from '@/server/actions/patients';
import { listAllMedicalTags } from '@/server/actions/medical-tags';
import {
  queuePatientCreate,
  queuePatientUpdate,
  patientPayloadFromFormData,
} from '@/lib/store/write';
import { useRouter } from '@/lib/navigation';
import { useDeltaRows } from '@/lib/store/snapshots';
import { useEnsureSeeded } from '@/lib/store/sync';
import { cn } from '@/lib/utils';

type Mode = 'general' | 'medical' | 'full' | 'quick';

/** Derive an approximate age from a stored birth_date (currentYear - year). */
function ageFromBirthDate(birthDate: string | null | undefined): string {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec((birthDate ?? '').trim());
  if (!m) return '';
  const age = new Date().getFullYear() - Number(m[1]);
  return age >= 0 && age <= 130 ? String(age) : '';
}

/** Quick-intake shorthand: age → Jan 1st of (currentYear - age). */
function birthDateFromAge(ageStr: string): string {
  const age = Number(ageStr);
  if (!Number.isInteger(age) || age < 0 || age > 130) return '';
  return `${new Date().getFullYear() - age}-01-01`;
}

export function PatientForm({
  patient,
  action,
  onCreated,
  mode = 'general',
  queueMode = false,
}: {
  patient?: PatientRow;
  action?: (prev: PatientFormState, fd: FormData) => Promise<PatientFormState>;
  /**
   * If provided, called with the created patient after a successful create.
   * The form's server action `createPatient` redirects, so for inline flows
   * pass a custom `action` that does NOT redirect (see `createPatientJson`
   * via the inline dialog).
   */
  onCreated?: (p: PatientRow) => void;
  /**
   * Offline-first: queue the write locally and flush at the next sync
   * instead of calling a server action (zero invocations on save).
   */
  queueMode?: boolean;
  /**
   * 'general' — demographics, contact, insurance, notes (default).
   * 'medical' — clinical history, allergies, conditions, meds, vitals.
   * 'full'    — both sections stacked vertically (kept for compat).
   * 'quick'   — bare-minimum turn intake (post-call): Name, Last name,
   *             Phone, Age (→ 01/01 birth_date), Email, Insurance (no
   *             member number); everything else in collapsed <details>.
   * When mode is 'general' or 'medical', the OTHER mode's fields are
   * submitted as hidden inputs so a partial save doesn't wipe data the
   * user can't see.
   */
  mode?: Mode;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const router = useRouter();
  const isGeneral = mode === 'general';
  const isMedical = mode === 'medical';
  const isQuick = mode === 'quick';
  const showGeneral = isGeneral || mode === 'full';
  const showMedical = isMedical || mode === 'full';
  const showQuick = isQuick;

  const [insurerId, setInsurerId] = useState<string | null>(patient?.insurer_id ?? null);
  const [freeText, setFreeText] = useState<{ name: string; plan: string }>({
    name: patient?.insurance_provider ?? '',
    plan: patient?.insurance_plan ?? '',
  });

  useEnsureSeeded({ deltas: ['patients'] });

  const [dictionaries, setDictionaries] = useState<Record<string, string[]>>({});
  useEffect(() => {
    listAllMedicalTags().then(setDictionaries).catch(() => {});
  }, []);
  const dictFor = (field: string) => dictionaries[field] ?? [];

  const storePatients = useDeltaRows('patients');
  const patientFromStore = useMemo(
    () => storePatients.find((p) => p.id === (patient?.id ?? '')) ?? patient,
    [storePatients, patient],
  );
  const mergedPatient = patientFromStore ?? patient;

  // Quick-intake age shorthand (source of truth for birth_date in quick mode).
  const [birthIso, setBirthIso] = useState(patient?.birth_date ?? '');
  const [ageStr, setAgeStr] = useState(() => ageFromBirthDate(patient?.birth_date));

  function onAgeChange(v: string) {
    setAgeStr(v);
    if (v.trim() === '') {
      setBirthIso('');
      return;
    }
    const iso = birthDateFromAge(v.trim());
    if (iso) setBirthIso(iso);
  }

  function onExactDobChange(v: string) {
    setBirthIso(v);
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(v.trim());
    setAgeStr(m ? ageFromBirthDate(v) : '');
  }

  const baseBound = action
    ? action
    : patient
      ? updatePatient.bind(null, patient.id)
      : createPatient;

  const [state, formAction, pending] = useActionState<PatientFormState, FormData>(
    async (prev, fd) => {
      if (queueMode) {
        // Offline-first path: optimistic local write, DB flush at sync.
        const payload = patientPayloadFromFormData(fd);
        if (!patient) {
          const id = queuePatientCreate(fd);
          if (onCreated) {
            onCreated({
              id,
              first_name: String(payload.first_name ?? ''),
              last_name: String(payload.last_name ?? ''),
              document_id: (payload.document_id as string) || null,
              birth_date: (payload.birth_date as string) || null,
              gender: (payload.gender as string) || null,
              phone: (payload.phone as string) || null,
              email: (payload.email as string) || null,
              address: (payload.address as string) || null,
              insurance_provider: (payload.insurance_provider as string) || null,
              insurance_number: (payload.insurance_number as string) || null,
              insurer_id: (payload.insurer_id as string) || null,
              insurance_plan: (payload.insurance_plan as string) || null,
              medical_history: (payload.medical_history as string) || null,
              allergies: (payload.allergies as string) || null,
              notes: (payload.notes as string) || null,
              deleted_at: null,
              chronic_conditions: (payload.chronic_conditions as string) || null,
              contagious_diseases: (payload.contagious_diseases as string) || null,
              current_medications: (payload.current_medications as string) || null,
              allergies_medication: (payload.allergies_medication as string) || null,
              blood_pressure: (payload.blood_pressure as string) || null,
              blood_type: (payload.blood_type as string) || null,
              diabetes: (payload.diabetes as string) || null,
              pregnant: (payload.pregnant as string) || null,
              last_medical_update: (payload.last_medical_update as string) || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          } else {
            // Standalone create (e.g. /patients/new): land on the list —
            // the row is in the store + queue and syncs in the background.
            router.push('/patients');
          }
          return { ok: true };
        }
        queuePatientUpdate(patient.id, fd, patient.updated_at ?? null);
        router.refresh();
        return { ok: true };
      }
      const res = await baseBound(prev, fd);
      if (res.ok && !patient && onCreated) {
        onCreated({
          id: '',
          first_name: String(fd.get('first_name') ?? ''),
          last_name: String(fd.get('last_name') ?? ''),
          document_id: (fd.get('document_id') as string) || null,
          birth_date: (fd.get('birth_date') as string) || null,
          gender: (fd.get('gender') as string) || null,
          phone: (fd.get('phone') as string) || null,
          email: (fd.get('email') as string) || null,
          address: (fd.get('address') as string) || null,
          insurance_provider: freeText.name || null,
          insurance_number: (fd.get('insurance_number') as string) || null,
          insurer_id: insurerId,
          insurance_plan: freeText.plan || null,
          medical_history: (fd.get('medical_history') as string) || null,
          allergies: (fd.get('allergies') as string) || null,
          notes: (fd.get('notes') as string) || null,
          deleted_at: null,
          chronic_conditions: (fd.get('chronic_conditions') as string) || null,
          contagious_diseases: (fd.get('contagious_diseases') as string) || null,
          current_medications: (fd.get('current_medications') as string) || null,
          allergies_medication: (fd.get('allergies_medication') as string) || null,
          blood_pressure: (fd.get('blood_pressure') as string) || null,
          blood_type: (fd.get('blood_type') as string) || null,
          diabetes: (fd.get('diabetes') as string) || null,
          pregnant: (fd.get('pregnant') as string) || null,
          last_medical_update: (fd.get('last_medical_update') as string) || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      return res;
    },
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {/* ==== Hidden inputs: preserve the OTHER mode's values on submit ====
          (Not needed in 'full' mode, where everything is visible.) */}
      const mergedPatient = patientFromStore ?? patient;

{isMedical ? (
        <>
          <input type="hidden" name="first_name" value={mergedPatient?.first_name ?? ''} />
          <input type="hidden" name="last_name" value={mergedPatient?.last_name ?? ''} />
          <input type="hidden" name="document_id" value={mergedPatient?.document_id ?? ''} />
          <input type="hidden" name="birth_date" value={mergedPatient?.birth_date ?? ''} />
          <input type="hidden" name="gender" value={mergedPatient?.gender ?? ''} />
          <input type="hidden" name="phone" value={mergedPatient?.phone ?? ''} />
          <input type="hidden" name="email" value={mergedPatient?.email ?? ''} />
          <input type="hidden" name="address" value={mergedPatient?.address ?? ''} />
          <input type="hidden" name="insurance_provider" value={mergedPatient?.insurance_provider ?? ''} />
          <input type="hidden" name="insurance_number" value={mergedPatient?.insurance_number ?? ''} />
          <input type="hidden" name="insurer_id" value={mergedPatient?.insurer_id ?? ''} />
          <input type="hidden" name="insurance_plan" value={mergedPatient?.insurance_plan ?? ''} />
          <input type="hidden" name="notes" value={mergedPatient?.notes ?? ''} />
        </>
      ) : null}
      {isGeneral ? (
        <>
          <input type="hidden" name="medical_history" value={mergedPatient?.medical_history ?? ''} />
          <input type="hidden" name="allergies" value={mergedPatient?.allergies ?? ''} />
          <input type="hidden" name="chronic_conditions" value={mergedPatient?.chronic_conditions ?? ''} />
          <input type="hidden" name="contagious_diseases" value={mergedPatient?.contagious_diseases ?? ''} />
          <input type="hidden" name="current_medications" value={mergedPatient?.current_medications ?? ''} />
          <input type="hidden" name="allergies_medication" value={mergedPatient?.allergies_medication ?? ''} />
          <input type="hidden" name="blood_pressure" value={mergedPatient?.blood_pressure ?? ''} />
          <input type="hidden" name="blood_type" value={mergedPatient?.blood_type ?? ''} />
          <input type="hidden" name="diabetes" value={mergedPatient?.diabetes ?? ''} />
          <input type="hidden" name="pregnant" value={mergedPatient?.pregnant ?? ''} />
          <input type="hidden" name="last_medical_update" value={mergedPatient?.last_medical_update ?? ''} />
        </>
      ) : null}

      {/* ==== Quick turn intake: bare minimum, in call order ==== */}
      {showQuick ? (
        <div className="space-y-4">
          {/* Age shorthand drives this hidden birth_date (01/01 of year-age). */}
          <input type="hidden" name="birth_date" value={birthIso} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">{t('firstName')}</Label>
              <Input id="first_name" name="first_name" defaultValue={mergedPatient?.first_name} required autoComplete="given-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">{t('lastName')}</Label>
              <Input id="last_name" name="last_name" defaultValue={mergedPatient?.last_name} required autoComplete="family-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{tc('phone')}</Label>
              <Input id="phone" name="phone" defaultValue={mergedPatient?.phone ?? ''} type="tel" inputMode="tel" autoComplete="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient_age">{t('age')}</Label>
              <Input
                id="patient_age"
                data-testid="patient-age"
                type="number"
                min={0}
                max={130}
                inputMode="numeric"
                value={ageStr}
                onChange={(e) => onAgeChange(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="email">{tc('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                defaultValue={mergedPatient?.email ?? ''}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="insurer-picker-trigger">{t('insuranceProvider')}</Label>
              <InsurerPicker
                value={insurerId}
                onChange={setInsurerId}
                initialName={freeText.name}
                initialPlan={freeText.plan}
                onFreeTextChange={setFreeText}
                hideMemberNumber
              />
              <input type="hidden" name="insurer_id" value={insurerId ?? ''} />
              <input type="hidden" name="insurance_provider" value={freeText.name} />
              <input type="hidden" name="insurance_plan" value={freeText.plan} />
            </div>
          </div>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer py-1 text-sm font-medium">
              {t('sectionExtra')}
            </summary>
            <div className="grid gap-4 py-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="document_id">{t('documentId')}</Label>
                <Input id="document_id" name="document_id" defaultValue={mergedPatient?.document_id ?? ''} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">{t('gender')}</Label>
                <GenderSelect defaultValue={mergedPatient?.gender ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date_exact">{t('birthDate')}</Label>
                <Input
                  id="birth_date_exact"
                  type="date"
                  autoComplete="bday"
                  value={birthIso}
                  onChange={(e) => onExactDobChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">{t('address')}</Label>
                <Input id="address" name="address" defaultValue={patient?.address ?? ''} autoComplete="street-address" />
              </div>
            </div>
          </details>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer py-1 text-sm font-medium">
              {t('sectionInsuranceDetail')}
            </summary>
            <div className="grid gap-4 py-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="insurance_number">{t('insuranceNumber')}</Label>
                <Input id="insurance_number" name="insurance_number" defaultValue={patient?.insurance_number ?? ''} inputMode="numeric" />
              </div>
            </div>
          </details>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer py-1 text-sm font-medium">
              {t('sectionMedical')}
            </summary>
            <div className="py-3">
              <MedicalSections patient={patient} dictFor={dictFor} />
            </div>
          </details>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer py-1 text-sm font-medium">
              {tc('notes')}
            </summary>
            <div className="py-3">
              <Textarea id="notes" name="notes" defaultValue={patient?.notes ?? ''} rows={2} />
            </div>
          </details>
        </div>
      ) : null}

      {/* ==== General fields (always visible in general/full) ==== */}
      {showGeneral ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">{t('firstName')}</Label>
            <Input id="first_name" name="first_name" defaultValue={patient?.first_name} required autoComplete="given-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">{t('lastName')}</Label>
            <Input id="last_name" name="last_name" defaultValue={patient?.last_name} required autoComplete="family-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_id">{t('documentId')}</Label>
            <Input id="document_id" name="document_id" defaultValue={patient?.document_id ?? ''} inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_date">{t('birthDate')}</Label>
            <BirthDatePicker defaultValue={patient?.birth_date ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">{t('gender')}</Label>
            <GenderSelect defaultValue={patient?.gender ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{tc('phone')}</Label>
            <Input id="phone" name="phone" defaultValue={patient?.phone ?? ''} type="tel" inputMode="tel" autoComplete="tel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{tc('email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              defaultValue={patient?.email ?? ''}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">{t('address')}</Label>
            <Input id="address" name="address" defaultValue={patient?.address ?? ''} autoComplete="street-address" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="insurer-picker-trigger">{t('insuranceProvider')}</Label>
            <InsurerPicker
              value={insurerId}
              onChange={setInsurerId}
              initialName={freeText.name}
              initialPlan={freeText.plan}
              onFreeTextChange={setFreeText}
              memberNumber={patient?.insurance_number ?? ''}
            />
            <input type="hidden" name="insurer_id" value={insurerId ?? ''} />
            <input type="hidden" name="insurance_provider" value={freeText.name} />
            <input type="hidden" name="insurance_plan" value={freeText.plan} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">{tc('notes')}</Label>
            <Textarea id="notes" name="notes" defaultValue={patient?.notes ?? ''} rows={2} />
          </div>
        </div>
      ) : null}

      {/* ==== Medical sections (always visible in medical/full) ==== */}
      {showMedical ? (
        <MedicalSections patient={patient} dictFor={dictFor} />
      ) : null}

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Saved</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? tc('loading') : tc('save')}
        </Button>
      </div>
    </form>
  );
}

function MedicalSections({
  patient,
  dictFor,
}: {
  patient?: PatientRow;
  dictFor: (field: string) => string[];
}) {
  const t = useTranslations('patients');
  return (
    <div className="space-y-6">
      {/* Risk factors: shown prominently because they can change the
          treatment protocol (e.g. antibiotic prophylaxis, bleeding
          protocols, radiation avoidance). */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('sectionRisks')}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="contagious_diseases">{t('contagiousDiseases')}</Label>
            <TagTextarea
              name="contagious_diseases"
              defaultValue={patient?.contagious_diseases ?? ''}
              dictionary={dictFor('contagious_diseases')}
              placeholder={t('contagiousDiseasesHint')}
              rows={2}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="allergies_medication">{t('allergiesMedication')}</Label>
            <TagTextarea
              name="allergies_medication"
              defaultValue={patient?.allergies_medication ?? ''}
              dictionary={dictFor('allergies_medication')}
              placeholder={t('allergiesMedicationHint')}
              rows={2}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="current_medications">{t('currentMedications')}</Label>
            <TagTextarea
              name="current_medications"
              defaultValue={patient?.current_medications ?? ''}
              dictionary={dictFor('current_medications')}
              placeholder={t('currentMedicationsHint')}
              rows={2}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('sectionConditions')}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="chronic_conditions">{t('chronicConditions')}</Label>
            <TagTextarea
              name="chronic_conditions"
              defaultValue={patient?.chronic_conditions ?? ''}
              dictionary={dictFor('chronic_conditions')}
              placeholder={t('chronicConditionsHint')}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="diabetes">{t('diabetes')}</Label>
            <Input
              id="diabetes"
              name="diabetes"
              defaultValue={patient?.diabetes ?? ''}
              placeholder={t('diabetesHint')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pregnant">{t('pregnant')}</Label>
            <PregnantSelect defaultValue={patient?.pregnant ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blood_type">{t('bloodType')}</Label>
            <Input
              id="blood_type"
              name="blood_type"
              defaultValue={patient?.blood_type ?? ''}
              placeholder="A+ / O−"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blood_pressure">{t('bloodPressure')}</Label>
            <Input
              id="blood_pressure"
              name="blood_pressure"
              defaultValue={patient?.blood_pressure ?? ''}
              placeholder="120/80"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">
          {t('sectionHistory')}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="medical_history">{t('medicalHistory')}</Label>
            <TagTextarea
              name="medical_history"
              defaultValue={patient?.medical_history ?? ''}
              dictionary={dictFor('medical_history')}
              rows={3}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="allergies">{t('allergies')}</Label>
            <TagTextarea
              name="allergies"
              defaultValue={patient?.allergies ?? ''}
              dictionary={dictFor('allergies')}
              placeholder={t('allergiesHint')}
              rows={2}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="last_medical_update">{t('lastMedicalUpdate')}</Label>
            <Input
              id="last_medical_update"
              name="last_medical_update"
              type="date"
              defaultValue={patient?.last_medical_update ?? ''}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function GenderSelect({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('patients');
  return (
    <>
      <input id="gender" type="hidden" name="gender" defaultValue={defaultValue} />
      <Select defaultValue={defaultValue || 'none'} onValueChange={() => {}}>
        <SelectTrigger aria-labelledby="gender">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          <SelectItem value="male">{t('male')}</SelectItem>
          <SelectItem value="female">{t('female')}</SelectItem>
          <SelectItem value="other">{t('other')}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

function PregnantSelect({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('patients');
  return (
    <>
      <input id="pregnant" type="hidden" name="pregnant" defaultValue={defaultValue} />
      <Select defaultValue={defaultValue || 'unknown'} onValueChange={() => {}}>
        <SelectTrigger aria-labelledby="pregnant">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unknown">{t('pregnantUnknown')}</SelectItem>
          <SelectItem value="yes">{t('pregnantYes')}</SelectItem>
          <SelectItem value="no">{t('pregnantNo')}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
