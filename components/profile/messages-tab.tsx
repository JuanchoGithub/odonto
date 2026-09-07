'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Pencil, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsappTemplatesEditor } from '@/components/settings/whatsapp-templates-editor';
import { updateUserWhatsappOverride } from '@/server/actions/whatsapp';
import type { WhatsappTemplate } from '@/lib/whatsapp';

type MessagesTabProps = {
  targetUserId: string;
  /** Resolved clinic-wide defaults (what the user inherits). */
  clinic: { countryCode: string; templates: WhatsappTemplate[] };
  /** The user's stored override (nulls = inherit clinic). */
  override: { countryCode: string | null; templates: string | null };
};

/**
 * "Messages" tab on the Profile page — a dentist edits their own WhatsApp
 * message override, or opts back into inheriting the clinic-wide defaults.
 */
export function MessagesTab({
  targetUserId,
  clinic,
  override,
}: MessagesTabProps) {
  const t = useTranslations('profile');
  const [pending, startTransition] = useTransition();

  const hasOverride = !!(override.countryCode || override.templates);
  const [editing, setEditing] = useState<boolean>(hasOverride);

  const resolvedTemplates =
    override.templates && override.templates.length > 2
      ? safeParse(override.templates)
      : clinic.templates;
  const resolvedCountryCode = override.countryCode || clinic.countryCode;

  function handleSave(countryCode: string, templates: WhatsappTemplate[]) {
    return startAction(() =>
      updateUserWhatsappOverride(targetUserId, { countryCode, templates }),
    );
  }

  function handleReset() {
    return startAction(() => updateUserWhatsappOverride(targetUserId, null));
  }

  function startAction(fn: () => Promise<{ error?: unknown }>) {
    return new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const res = await fn();
        if (res && 'error' in res) {
          resolve('Error');
        } else {
          resolve(null);
        }
      });
    });
  }

  return (
    <div className="space-y-4" data-testid="profile-messages">
      {!editing ? (
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">{t('myMessagesHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => setEditing(true)}
              data-testid="messages-customize"
              className="min-h-[44px]"
            >
              <Pencil className="h-4 w-4" />
              {t('overrideMessages')}
            </Button>
            {hasOverride ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={pending}
                data-testid="messages-reset"
                className="min-h-[44px]"
              >
                <Undo2 className="h-4 w-4" />
                {t('resetToClinic')}
              </Button>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
            {t('inheriting')}
          </div>
        </div>
      ) : (
        <WhatsappTemplatesEditor
          initial={{
            countryCode: resolvedCountryCode,
            templates: resolvedTemplates,
          }}
          onSave={handleSave}
          note={t('myMessagesHint')}
          testIdPrefix="messages"
        />
      )}
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