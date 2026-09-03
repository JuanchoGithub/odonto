'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type InsurerOption = {
  id: string;
  name: string;
  plan: string | null;
};

export function InsurerPicker({
  value,
  onChange,
  initialName,
  initialPlan,
  onFreeTextChange,
  memberNumber,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  initialName?: string;
  initialPlan?: string;
  onFreeTextChange?: (s: { name: string; plan: string }) => void;
  memberNumber?: string;
}) {
  const t = useTranslations('insurers');
  const tPi = useTranslations('patientOnboarding');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [insurers, setInsurers] = useState<InsurerOption[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [freeText, setFreeText] = useState<{ name: string; plan: string }>({
    name: initialName ?? '',
    plan: initialPlan ?? '',
  });

  useEffect(() => {
    fetch('/api/insurers')
      .then((r) => r.json())
      .then((data) => setInsurers(data))
      .catch(() => setInsurers([]));
  }, [newOpen]);

  const filtered = query
    ? insurers.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.plan ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : insurers;

  const selected = insurers.find((i) => i.id === value);

  function onCreated(newIns: InsurerOption) {
    setInsurers((list) => [...list, newIns]);
    onChange(newIns.id);
    setNewOpen(false);
    setOpen(false);
    setQuery('');
  }

  // Free-text mode: when value is null AND the user has entered something manually
  const useFreeText = value === null && freeText.name.length > 0;

  function updateFreeText(patch: Partial<{ name: string; plan: string }>) {
    setFreeText((s) => {
      const next = { ...s, ...patch };
      onFreeTextChange?.(next);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <button
          id="insurer-picker-trigger"
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          )}
        >
          <span className={cn(!selected && !useFreeText && 'text-muted-foreground')}>
            {selected
              ? selected.plan
                ? `${selected.name} — ${selected.plan}`
                : selected.name
              : useFreeText
                ? freeText.name + (freeText.plan ? ` — ${freeText.plan}` : '')
                : tPi('insurerNone')}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        {open ? (
          <div
            className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-1"
            onMouseLeave={() => setOpen(false)}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm mb-1"
            />
            <div className="max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  updateFreeText({ name: '', plan: '' });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="w-3.5" />
                <span className="text-muted-foreground italic">{tPi('insurerNone')}</span>
              </button>
              {filtered.length === 0 ? (
                <div className="text-xs text-muted-foreground p-2 text-center">
                  {tCommon('search')}
                </div>
              ) : (
                filtered.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => {
                      onChange(i.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                      'hover:bg-accent hover:text-accent-foreground',
                      value === i.id && 'bg-accent',
                    )}
                  >
                    {value === i.id ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                    <span className="truncate">
                      {i.name}
                      {i.plan ? <span className="text-muted-foreground"> — {i.plan}</span> : null}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t mt-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setNewOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('new')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Free-text entry: appears when user clears the picker (value=null) and starts typing in the manual fields below */}
      {useFreeText ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('name')}</Label>
            <Input
              value={freeText.name}
              onChange={(e) => updateFreeText({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('plan')}</Label>
            <Input
              value={freeText.plan}
              onChange={(e) => updateFreeText({ plan: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      {/* Member number, only when an insurer is selected */}
      {value ? (
        <div className="space-y-1">
          <Label className="text-xs">N° de afiliado</Label>
          <Input name="insurance_number" defaultValue={memberNumber ?? ''} />
        </div>
      ) : null}

      <NewInsurerDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={onCreated}
      />
    </div>
  );
}

function NewInsurerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: (i: InsurerOption) => void;
}) {
  const t = useTranslations('insurers');
  const tCommon = useTranslations('common');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const payload = {
        name: fd.get('name'),
        plan: fd.get('plan') || undefined,
        phone: fd.get('phone') || undefined,
        email: fd.get('email') || undefined,
        notes: fd.get('notes') || undefined,
      };
      const r = await fetch('/api/insurers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error === 'duplicate' ? t('duplicate') : tCommon('cancel'));
        return;
      }
      onCreated({ id: data.id, name: data.name, plan: data.plan });
    } catch {
      setError(tCommon('cancel'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => onOpenChange(false)} />
      ) : null}
      {open ? (
        <form
          onSubmit={onSubmit}
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t('new')}</h2>
            <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ins_name">{t('name')}</Label>
              <Input id="ins_name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ins_plan">{t('plan')}</Label>
              <Input id="ins_plan" name="plan" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ins_phone">{t('phone')}</Label>
              <Input id="ins_phone" name="phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ins_email">{t('email')}</Label>
              <Input id="ins_email" name="email" type="email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ins_notes">{t('notes')}</Label>
              <Textarea id="ins_notes" name="notes" rows={2} />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? tCommon('loading') : tCommon('save')}
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}
