'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type InsurerFormState,
  type InsurerRow,
} from '@/server/actions/insurers';
import { useRouter } from '@/lib/navigation';

export function InsurerForm({ insurer }: { insurer?: InsurerRow }) {
  const t = useTranslations('insurers');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [state, action, pending] = useActionState<InsurerFormState, FormData>(
    async (prev, fd) => {
      // Offline-first: queue locally, flush at sync (zero invocations).
      const {
        queueInsurerCreate,
        queueInsurerUpdate,
      } = await import('@/lib/store/write');
      if (insurer) {
        queueInsurerUpdate(
          insurer.id,
          {
            name: String(fd.get('name') ?? ''),
            plan: fd.get('plan') || null,
            phone: fd.get('phone') || null,
            email: fd.get('email') || null,
            notes: fd.get('notes') || null,
          },
          insurer.updated_at ?? null,
        );
        return { ok: true };
      }
      const name = String(fd.get('name') ?? '').trim();
      // Client-side uniqueness pre-check (the server re-validates at sync).
      const { getSnapRows } = await import('@/lib/store/snapshots');
      const dup = (getSnapRows('insurers') as { name: string }[]).some(
        (r) => r.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (dup) return { error: t('duplicate') };
      queueInsurerCreate({
        name,
        plan: fd.get('plan') || null,
        phone: fd.get('phone') || null,
        email: fd.get('email') || null,
        notes: fd.get('notes') || null,
      });
      router.push('/insurers');
      return { ok: true };
    },
    {},
  );

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
          <Input id="phone" name="phone" defaultValue={insurer?.phone ?? ''} type="tel" inputMode="tel" autoComplete="tel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={insurer?.email ?? ''} />
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
