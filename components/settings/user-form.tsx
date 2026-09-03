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
import { createUser } from '@/server/actions/settings';
import { useRouter } from '@/lib/navigation';

export function UserForm() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [role, setRole] = useState('receptionist');
  const [locale, setLocale] = useState('es');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    fd.set('role', role);
    fd.set('locale', locale);
    const res = await createUser(fd);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-5 items-end">
      <div className="space-y-1">
        <Label htmlFor="u_name">{tCommon('name')}</Label>
        <Input id="u_name" name="name" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="u_email">{tCommon('email')}</Label>
        <Input id="u_email" name="email" type="email" required />
      </div>
      <div className="space-y-1">
        <Label>{t('role')}</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="dentist">dentist</SelectItem>
            <SelectItem value="receptionist">receptionist</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="u_password">{t('password')}</Label>
        <Input id="u_password" name="password" type="password" minLength={6} required />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? tCommon('loading') : t('newUser')}
      </Button>
      {error ? (
        <p className="text-sm text-destructive md:col-span-5">{error}</p>
      ) : null}
    </form>
  );
}
