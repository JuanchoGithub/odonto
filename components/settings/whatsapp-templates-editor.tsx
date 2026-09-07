'use client';
import { useState, useTransition, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { CountryCodeSelect } from './country-code-select';
import {
  BUILTIN_TEMPLATES,
  fillTemplate,
  newTemplateId,
  templateBody,
  type WhatsappTemplate,
  type WhatsappTemplateKind,
} from '@/lib/whatsapp';

type WhatsappTemplatesEditorProps = {
  initial: { countryCode: string; templates: WhatsappTemplate[] };
  /** Save the edited templates + country code. Return an error string on failure. */
  onSave: (
    countryCode: string,
    templates: WhatsappTemplate[],
  ) => Promise<string | null>;
  /** Optional small note shown under the heading (e.g. per-doctor context). */
  note?: string;
  testIdPrefix?: string;
};

/**
 * Reusable WhatsApp message-template editor: country code picker + template
 * list (edit/add/remove) + live preview + submit. Used by the clinic-wide
 * default editor (Communication tab) and by the per-user "my messages"
 * editor (Profile). The parent supplies `onSave`, so this stays agnostic to
 * whether it's writing to `clinics` or a `users` override.
 */
export function WhatsappTemplatesEditor({
  initial,
  onSave,
  note,
  testIdPrefix = 'whatsapp',
}: WhatsappTemplatesEditorProps) {
  const t = useTranslations('settings');
  const tAppt = useTranslations('appointments');
  const locale = useLocale() as 'es' | 'en';
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [countryCode, setCountryCode] = useState(initial.countryCode);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>(
    initial.templates.length > 0 ? initial.templates : BUILTIN_TEMPLATES,
  );

  function updateTemplate(id: string, patch: Partial<WhatsappTemplate>) {
    setTemplates((s) => s.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function addTemplate() {
    setTemplates((s) => [
      ...s,
      {
        id: newTemplateId(),
        kind: 'custom',
        label_es: 'Nueva plantilla',
        label_en: 'New template',
        body_es: 'Hola, {{name}}. Hoy {{weekday}} tiene turno a las {{time}}.',
        body_en: 'Hi {{name}}. Today {{weekday}} you have an appointment at {{time}}.',
        applies_to: 'any',
        enabled: 1,
      },
    ]);
  }
  function removeTemplate(id: string) {
    setTemplates((s) => s.filter((t) => t.id !== id));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const err = await onSave(countryCode, templates);
      if (err) {
        push({ title: err, variant: 'destructive' });
        return;
      }
      push({ title: tAppt('whatsappSaved'), variant: 'success' });
    });
  }

  const placeholders = useMemo(
    () => [
      { token: '{{name}}', label: t('whatsappPlaceholderName') },
      { token: '{{weekday}}', label: t('whatsappPlaceholderWeekday') },
      { token: '{{time}}', label: t('whatsappPlaceholderTime') },
      { token: '{{dentist}}', label: t('whatsappPlaceholderDentist') },
      { token: '{{reason}}', label: t('whatsappPlaceholderReason') },
    ],
    [t],
  );

  const previewBody = fillTemplate(
    templateBody(pickPreview(templates, locale), locale),
    {
      patientName: t('whatsappPreviewName'),
      weekday: t('whatsappPreviewWeekday'),
      time: t('whatsappPreviewTime'),
    },
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid={testIdPrefix}>
      {note ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{note}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-country-code`}>
          {t('whatsappCountryCode')}
        </Label>
        <CountryCodeSelect
          id={`${testIdPrefix}-country-code`}
          value={countryCode}
          onChange={setCountryCode}
        />
        <p className="text-xs text-muted-foreground">
          {t('whatsappCountryCodeHint')}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">{t('whatsappTemplates')}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTemplate}
            data-testid={`${testIdPrefix}-add-template`}
            className="min-h-[40px]"
          >
            <Plus className="h-4 w-4" />
            {t('whatsappAddTemplate')}
          </Button>
        </div>

        <ul className="space-y-3">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              data-testid={`${testIdPrefix}-tpl-${tpl.id}`}
              className="rounded-xl border p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{kindLabel(t, tpl.kind)}</Badge>
                    {isBuiltIn(tpl.id) ? (
                      <Badge variant="outline">{t('whatsappBuiltIn')}</Badge>
                    ) : null}
                    <span className="truncate text-sm font-medium">
                      {tpl.kind === 'confirmation'
                        ? tAppt('whatsappDefault')
                        : tpl.kind === 'no_show'
                          ? tAppt('whatsappNoShow')
                          : t('whatsappCustom')}
                    </span>
                  </div>
                </div>
                {!isBuiltIn(tpl.id) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTemplate(tpl.id)}
                    aria-label={t('whatsappRemoveTemplate')}
                    data-testid={`${testIdPrefix}-tpl-remove-${tpl.id}`}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{t('whatsappTemplateLabelEs')}</Label>
                  <Input
                    value={tpl.label_es}
                    onChange={(e) =>
                      updateTemplate(tpl.id, { label_es: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('whatsappTemplateLabelEn')}</Label>
                  <Input
                    value={tpl.label_en}
                    onChange={(e) =>
                      updateTemplate(tpl.id, { label_en: e.target.value })
                    }
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">{t('whatsappTemplateBodyEs')}</Label>
                <Textarea
                  value={tpl.body_es}
                  onChange={(e) =>
                    updateTemplate(tpl.id, { body_es: e.target.value })
                  }
                  rows={3}
                  className="mt-1"
                  data-testid={`${testIdPrefix}-tpl-body-es-${tpl.id}`}
                />
              </div>
              <div>
                <Label className="text-xs">{t('whatsappTemplateBodyEn')}</Label>
                <Textarea
                  value={tpl.body_en}
                  onChange={(e) =>
                    updateTemplate(tpl.id, { body_en: e.target.value })
                  }
                  rows={3}
                  className="mt-1"
                  data-testid={`${testIdPrefix}-tpl-body-en-${tpl.id}`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('whatsappAppliesTo')}</Label>
                  <select
                    value={tpl.applies_to}
                    onChange={(e) =>
                      updateTemplate(tpl.id, {
                        applies_to: e.target.value as WhatsappTemplate['applies_to'],
                      })
                    }
                    className="flex h-10 min-h-[40px] w-full rounded-md border border-input bg-background px-3 text-sm"
                    data-testid={`${testIdPrefix}-tpl-applies-${tpl.id}`}
                  >
                    <option value="upcoming">{t('whatsappAppliesUpcoming')}</option>
                    <option value="past">{t('whatsappAppliesPast')}</option>
                    <option value="any">{t('whatsappAppliesAny')}</option>
                  </select>
                </div>
                <label className="inline-flex items-center gap-2 text-sm pt-5">
                  <input
                    type="checkbox"
                    checked={Number(tpl.enabled) === 1}
                    onChange={(e) =>
                      updateTemplate(tpl.id, {
                        enabled: e.target.checked ? 1 : 0,
                      })
                    }
                    data-testid={`${testIdPrefix}-tpl-enabled-${tpl.id}`}
                    className="h-4 w-4"
                  />
                  {Number(tpl.enabled) === 1
                    ? t('whatsappEnabled')
                    : t('whatsappDisabled')}
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
        <p className="text-sm font-semibold">{t('whatsappPreview')}</p>
        <p className="text-sm whitespace-pre-wrap" data-testid={`${testIdPrefix}-preview`}>
          {previewBody}
        </p>
        <p className="text-xs text-muted-foreground">{t('whatsappPlaceholders')}</p>
        <ul className="flex flex-wrap gap-1.5">
          {placeholders.map((p) => (
            <li
              key={p.token}
              className="rounded-full border bg-background px-2 py-0.5 text-xs"
            >
              <code className="font-mono">{p.token}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending}
          data-testid={`${testIdPrefix}-save`}
          className="min-h-[48px]"
        >
          {pending ? '…' : t('whatsappSaveButton')}
        </Button>
      </div>
    </form>
  );
}

function isBuiltIn(id: string): boolean {
  return id === 'builtin_confirmation' || id === 'builtin_no_show';
}

function pickPreview(
  templates: WhatsappTemplate[],
  locale: 'es' | 'en',
): WhatsappTemplate {
  const enabled = templates.filter((t) => Number(t.enabled) === 1);
  const first = enabled[0];
  if (first) return first;
  const fallback = BUILTIN_TEMPLATES.find((t) => t.id === 'builtin_confirmation');
  return fallback ?? BUILTIN_TEMPLATES[0]!;
}

function kindLabel(
  t: ReturnType<typeof useTranslations<'settings'>>,
  kind: WhatsappTemplateKind,
): string {
  if (kind === 'confirmation') return t('whatsappKindConfirmation');
  if (kind === 'no_show') return t('whatsappKindNoShow');
  return t('whatsappKindCustom');
}