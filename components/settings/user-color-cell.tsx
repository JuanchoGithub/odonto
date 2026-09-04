'use client';
import { useState, useTransition } from 'react';
import { updateUserColor } from '@/server/actions/settings';
import { fallbackDentistColor } from '@/lib/colors';

/** Small color picker persisted on change (admin only, rendered for dentists). */
export function UserColorCell({
  userId,
  color,
}: {
  userId: string;
  color: string | null;
}) {
  const [value, setValue] = useState(color ?? fallbackDentistColor(userId));
  const [, startTransition] = useTransition();

  return (
    <input
      type="color"
      aria-label="color"
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        startTransition(() => {
          void updateUserColor(userId, next);
        });
      }}
      className="h-7 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
    />
  );
}
