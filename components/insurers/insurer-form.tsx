'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createInsurer,
  updateInsurer,
  type InsurerFormState,
  type InsurerRow,
} from '@/server/actions/insurers';

export function InsurerForm({ insurer }: { insurer?: InsurerRow }) {
  const t = useTranslations('insurers');
  const tCommon = useTranslations('common');
  const bound = insurer
    ? updateInsurer.bind(null, insurer.id)
    : createInsurer;
  const [state, action, pending] = useActionState<InsurerFormState, FormData>(bound, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{t('name')}</Label>
          <Input id="name" name="name" defaultValue={insurer?.name ?? ''} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan">{t('plan')}</Label>
          <Input id="plan" name="plan" defaultValue={insurer?.plan ?? ''} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input id="phone" name="phone" defaultValue={insurer?.phone ?? ''} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" name="email" type="email" defaultValue={insurer?.email ?? ''} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">{t('notes')}</Label>
          <Textarea id="notes" name="notes" defaultValue={insurer?.notes ?? ''} rows={3} />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-600">Saved</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? tCommon('loading') : tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
