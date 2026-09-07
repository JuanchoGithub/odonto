'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WhatsappTemplatesEditor } from '@/components/settings/whatsapp-templates-editor';
import {
  updateWhatsappSettings,
  updateUserWhatsappOverride,
} from '@/server/actions/whatsapp';
import type { WhatsappTemplate } from '@/lib/whatsapp';

export type CommUser = {
  id: string;
  name: string;
  countryCode: string | null;
  templates: string | null;
};

type CommunicationTabProps = {
  clinic: { countryCode: string; templates: WhatsappTemplate[] };
  users: CommUser[];
};

/**
 * "Communication" tab on the Profile page — admins and receptionists manage
 * the clinic-wide WhatsApp message defaults and any dentist's per-user
 * override.
 */
export function CommunicationTab({ clinic, users }: CommunicationTabProps) {
  const t = useTranslations('profile');
  const tProfile = useTranslations('profile');
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(users[0]?.id ?? '');

  const dentist = users.find((u) => u.id === selected);
  const hasOverride = !!dentist?.countryCode || !!dentist?.templates;
  const resolvedTemplates = dentist?.templates
    ? safeParse(dentist.templates)
    : clinic.templates;
  const resolvedCountryCode = dentist?.countryCode || clinic.countryCode;

  function run<T extends { error?: unknown }>(fn: () => Promise<T>) {
    return new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const res = await fn();
        resolve(res && 'error' in res ? 'Error' : null);
      });
    });
  }

  return (
    <div className="space-y-6" data-testid="profile-communication">
      <p className="text-sm text-muted-foreground">{t('communicationHint')}</p>

      {/* Clinic-wide defaults */}
      <section aria-label={t('clinicDefault')}>
        <h2 className="mb-1 text-lg font-semibold">{t('clinicDefault')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('clinicDefaultHint')}</p>
        <WhatsappTemplatesEditor
          initial={clinic}
          onSave={(countryCode, templates) =>
            run(() => updateWhatsappSettings({ countryCode, templates }))
          }
          testIdPrefix="comm-clinic"
        />
      </section>

      {/* Per-dentist overrides */}
      <section aria-label={t('perDentist')} className="border-t pt-5">
        <h2 className="mb-1 text-lg font-semibold">{t('perDentist')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('perDentistHint')}</p>

        <div className="mb-3 max-w-sm">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger data-testid="comm-dentist-select">
              <SelectValue placeholder={tProfile('perDentist')} />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {dentist ? (
          <div className="space-y-3">
            {hasOverride ? (
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {t('customized')}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    run(() => updateUserWhatsappOverride(dentist.id, null))
                  }
                  disabled={pending}
                  data-testid="comm-reset"
                  className="min-h-[44px]"
                >
                  <Undo2 className="h-4 w-4" />
                  {t('resetToClinic')}
                </Button>
              </div>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {t('inheriting')}
              </span>
            )}
            <WhatsappTemplatesEditor
              initial={{
                countryCode: resolvedCountryCode,
                templates: resolvedTemplates,
              }}
              onSave={(countryCode, templates) =>
                run(() =>
                  updateUserWhatsappOverride(dentist.id, { countryCode, templates }),
                )
              }
              testIdPrefix={`comm-${dentist.id}`}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('perDentistHint')}</p>
        )}
      </section>
    </div>
  );
}

function safeParse(raw: string): WhatsappTemplate[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}