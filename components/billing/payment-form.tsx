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
import { recordPayment } from '@/server/actions/billing';
import { useRouter } from '@/lib/navigation';

export function PaymentForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState('cash');
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set('invoice_id', invoiceId);
    fd.set('method', method);
    await recordPayment(fd);
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-4 gap-2 items-end">
      <div className="space-y-1">
        <Label htmlFor="amount" className="text-xs">
          {t('amount')}
        </Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min={0}
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('method')}</Label>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">{t('methods.cash')}</SelectItem>
            <SelectItem value="card">{t('methods.card')}</SelectItem>
            <SelectItem value="transfer">{t('methods.transfer')}</SelectItem>
            <SelectItem value="insurance">{t('methods.insurance')}</SelectItem>
            <SelectItem value="other">{t('methods.other')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reference" className="text-xs">
          {t('reference')}
        </Label>
        <Input id="reference" name="reference" />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? tCommon('loading') : tCommon('save')}
      </Button>
    </form>
  );
}
