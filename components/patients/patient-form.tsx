'use client';
import { useActionState } from 'react';
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
import {
  createPatient,
  updatePatient,
  type PatientFormState,
  type PatientRow,
} from '@/server/actions/patients';

export function PatientForm({
  patient,
  action,
}: {
  patient?: PatientRow;
  action?: (prev: PatientFormState, fd: FormData) => Promise<PatientFormState>;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const bound = action
    ? action
    : patient
      ? updatePatient.bind(null, patient.id)
      : createPatient;
  const [state, formAction, pending] = useActionState<PatientFormState, FormData>(
    bound,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
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
        <div className="space-y-2">
          <Label htmlFor="insurance_provider">{t('insuranceProvider')}</Label>
          <Input
            id="insurance_provider"
            name="insurance_provider"
            defaultValue={patient?.insurance_provider ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="insurance_number">{t('insuranceNumber')}</Label>
          <Input
            id="insurance_number"
            name="insurance_number"
            defaultValue={patient?.insurance_number ?? ''}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="medical_history">{t('medicalHistory')}</Label>
          <Textarea
            id="medical_history"
            name="medical_history"
            defaultValue={patient?.medical_history ?? ''}
            rows={3}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="allergies">{t('allergies')}</Label>
          <Textarea
            id="allergies"
            name="allergies"
            defaultValue={patient?.allergies ?? ''}
            rows={2}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">{tc('notes')}</Label>
          <Textarea id="notes" name="notes" defaultValue={patient?.notes ?? ''} rows={2} />
        </div>
      </div>
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
      <input type="hidden" name="gender" defaultValue={defaultValue} />
      <Select defaultValue={defaultValue || 'none'} onValueChange={() => {}}>
        <SelectTrigger>
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
