'use client';
import { useActionState, useEffect, useState } from 'react';
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
import { TagTextarea } from '@/components/patients/tag-textarea';
import {
  createPatient,
  updatePatient,
  type PatientFormState,
  type PatientRow,
} from '@/server/actions/patients';
import { listAllMedicalTags } from '@/server/actions/medical-tags';
import { cn } from '@/lib/utils';

type Mode = 'general' | 'medical' | 'full';

export function PatientForm({
  patient,
  action,
  onCreated,
  mode = 'general',
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
   * 'general' — demographics, contact, insurance, notes (default).
   * 'medical' — clinical history, allergies, conditions, meds, vitals.
   * 'full'    — both sections stacked vertically (used by the inline
   *             new-patient dialog in the appointment flow; no tabs there).
   * When mode is 'general' or 'medical', the OTHER mode's fields are
   * submitted as hidden inputs so a partial save doesn't wipe data the
   * user can't see.
   */
  mode?: Mode;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const isGeneral = mode === 'general';
  const isMedical = mode === 'medical';
  const showGeneral = isGeneral || mode === 'full';
  const showMedical = isMedical || mode === 'full';

  const [insurerId, setInsurerId] = useState<string | null>(patient?.insurer_id ?? null);
  const [freeText, setFreeText] = useState<{ name: string; plan: string }>({
    name: patient?.insurance_provider ?? '',
    plan: patient?.insurance_plan ?? '',
  });

  const [dictionaries, setDictionaries] = useState<Record<string, string[]>>({});
  useEffect(() => {
    listAllMedicalTags().then(setDictionaries).catch(() => {});
  }, []);
  const dictFor = (field: string) => dictionaries[field] ?? [];

  const baseBound = action
    ? action
    : patient
      ? updatePatient.bind(null, patient.id)
      : createPatient;

  const [state, formAction, pending] = useActionState<PatientFormState, FormData>(
    async (prev, fd) => {
      const res = await baseBound(prev, fd);
      if (res.ok && !patient && onCreated) {
        onCreated({
          id: '',
          first_name: String(fd.get('first_name') ?? ''),
          last_name: String(fd.get('last_name') ?? ''),
          document_id: null,
          birth_date: null,
          gender: null,
          phone: null,
          email: null,
          address: null,
          insurance_provider: freeText.name || null,
          insurance_number: null,
          insurer_id: insurerId,
          insurance_plan: freeText.plan || null,
          medical_history: null,
          allergies: null,
          notes: null,
          deleted_at: null,
          chronic_conditions: null,
          contagious_diseases: null,
          current_medications: null,
          allergies_medication: null,
          blood_pressure: null,
          blood_type: null,
          diabetes: null,
          pregnant: null,
          last_medical_update: null,
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
      {isMedical ? (
        <>
          <input type="hidden" name="first_name" value={patient?.first_name ?? ''} />
          <input type="hidden" name="last_name" value={patient?.last_name ?? ''} />
          <input type="hidden" name="document_id" value={patient?.document_id ?? ''} />
          <input type="hidden" name="birth_date" value={patient?.birth_date ?? ''} />
          <input type="hidden" name="gender" value={patient?.gender ?? ''} />
          <input type="hidden" name="phone" value={patient?.phone ?? ''} />
          <input type="hidden" name="email" value={patient?.email ?? ''} />
          <input type="hidden" name="address" value={patient?.address ?? ''} />
          <input type="hidden" name="insurance_provider" value={patient?.insurance_provider ?? ''} />
          <input type="hidden" name="insurance_number" value={patient?.insurance_number ?? ''} />
          <input type="hidden" name="insurer_id" value={patient?.insurer_id ?? ''} />
          <input type="hidden" name="insurance_plan" value={patient?.insurance_plan ?? ''} />
          <input type="hidden" name="notes" value={patient?.notes ?? ''} />
        </>
      ) : null}
      {isGeneral ? (
        <>
          <input type="hidden" name="medical_history" value={patient?.medical_history ?? ''} />
          <input type="hidden" name="allergies" value={patient?.allergies ?? ''} />
          <input type="hidden" name="chronic_conditions" value={patient?.chronic_conditions ?? ''} />
          <input type="hidden" name="contagious_diseases" value={patient?.contagious_diseases ?? ''} />
          <input type="hidden" name="current_medications" value={patient?.current_medications ?? ''} />
          <input type="hidden" name="allergies_medication" value={patient?.allergies_medication ?? ''} />
          <input type="hidden" name="blood_pressure" value={patient?.blood_pressure ?? ''} />
          <input type="hidden" name="blood_type" value={patient?.blood_type ?? ''} />
          <input type="hidden" name="diabetes" value={patient?.diabetes ?? ''} />
          <input type="hidden" name="pregnant" value={patient?.pregnant ?? ''} />
          <input type="hidden" name="last_medical_update" value={patient?.last_medical_update ?? ''} />
        </>
      ) : null}

      {/* ==== General fields (always visible in general/full) ==== */}
      {showGeneral ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">{t('firstName')}</Label>
            <Input id="first_name" name="first_name" defaultValue={patient?.first_name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">{t('lastName')}</Label>
            <Input id="last_name" name="last_name" defaultValue={patient?.last_name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_id">{t('documentId')}</Label>
            <Input id="document_id" name="document_id" defaultValue={patient?.document_id ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_date">{t('birthDate')}</Label>
            <Input
              id="birth_date"
              name="birth_date"
              type="date"
              defaultValue={patient?.birth_date ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gender">{t('gender')}</Label>
            <GenderSelect defaultValue={patient?.gender ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{tc('phone')}</Label>
            <Input id="phone" name="phone" defaultValue={patient?.phone ?? ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{tc('email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={patient?.email ?? ''}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">{t('address')}</Label>
            <Input id="address" name="address" defaultValue={patient?.address ?? ''} />
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
