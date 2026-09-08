'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  softDeleteUser,
  restoreUser,
  hardDeleteUser,
} from '@/server/actions/settings';
import { useRouter } from '@/lib/navigation';

type Dentist = { id: string; name: string };

export function UserActions({
  userId,
  email,
  role,
  deleted,
  dentists,
}: {
  userId: string;
  email: string;
  role: string;
  deleted: boolean;
  dentists: Dentist[];
}) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successor, setSuccessor] = useState('');

  async function run(fn: () => Promise<{ error?: string } | { ok: true }>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fn();
      if ('error' in res && res.error) {
        setError(res.error === 'needs_successor' ? t('needsSuccessor') : res.error);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <span className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => restoreUser(userId))}
        >
          {t('restoreUser')}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </span>
    );
  }

  const successors = dentists.filter((d) => d.id !== userId);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => run(() => softDeleteUser(userId))}
      >
        {t('deactivateUser')}
      </Button>
      {role === 'dentist' && successors.length > 0 ? (
        <Select value={successor} onValueChange={setSuccessor}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder={t('successorDentist')} />
          </SelectTrigger>
          <SelectContent>
            {successors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => {
          if (
            !window.confirm(
              t('confirmHardDelete', { email }) as unknown as string,
            )
          )
            return;
          run(() => hardDeleteUser(userId, successor || undefined));
        }}
      >
        {t('hardDeleteUser')}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </span>
  );
}
