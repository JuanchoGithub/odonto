'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { upsertClinic } from '@/server/actions/settings';
import { useRouter } from '@/lib/navigation';

type Clinic = {
  name: string;
  address: string | null;
  tax_id: string | null;
  tax_rate_standard_bps: number;
  tax_rate_reduced_bps: number;
  currency: string;
  locale: string;
};

const CURRENCIES = [
  'ARS',
  'USD',
  'EUR',
  'MXN',
  'COP',
  'CLP',
  'PEN',
  'UYU',
  'BRL',
  'GBP',
];

export function ClinicForm({ clinic }: { clinic: Clinic | null }) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState(clinic?.currency ?? 'USD');
  const [locale, setLocale] = useState(clinic?.locale ?? 'es');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    fd.set('currency', currency);
    fd.set('locale', locale);
    await upsertClinic(fd);
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name">{t('clinicName')}</Label>
        <Input id="name" name="name" defaultValue={clinic?.name ?? ''} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tax_id">{t('taxId')}</Label>
        <Input id="tax_id" name="tax_id" defaultValue={clinic?.tax_id ?? ''} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="address">{t('address')}</Label>
        <Input id="address" name="address" defaultValue={clinic?.address ?? ''} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tax_rate_standard_bps">
          {t('taxRateStandard')}
        </Label>
        <Input
          id="tax_rate_standard_bps"
          name="tax_rate_standard_bps"
          type="number"
          min={0}
          max={10000}
          defaultValue={clinic?.tax_rate_standard_bps ?? 2100}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tax_rate_reduced_bps">
          {t('taxRateReduced')}
        </Label>
        <Input
          id="tax_rate_reduced_bps"
          name="tax_rate_reduced_bps"
          type="number"
          min={0}
          max={10000}
          defaultValue={clinic?.tax_rate_reduced_bps ?? 1050}
        />
      </div>
      <div className="space-y-2">
        <Label>{tCommon('currency')}</Label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{tCommon('locale')}</Label>
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? tCommon('loading') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
