'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarSync, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { getCalendarSubscription } from '@/server/actions/calendar-feed';

/**
 * "Subscribe on iPhone" button for a dentist's rolling 6-week calendar feed.
 * The phone subscribes DIRECTLY to the public Blob URL (webcal://), so
 * steady-state polling costs zero Vercel function invocations — the lookup
 * below runs once per tap.
 */
export function SubscribeCalendarButton({ dentistId }: { dentistId: string }) {
  const t = useTranslations('appointments');
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [webcalUrl, setWebcalUrl] = useState<string | null>(null);

  async function handleOpen() {
    setLoading(true);
    try {
      const res = await getCalendarSubscription(dentistId);
      if ('error' in res) {
        push({ title: t('subscribeError'), variant: 'destructive' });
        return;
      }
      setWebcalUrl(res.webcalUrl);
      setOpen(true);
    } catch {
      push({ title: t('subscribeError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!webcalUrl) return;
    navigator.clipboard
      .writeText(webcalUrl)
      .then(() => push({ title: t('subscribeCopied'), variant: 'success' }))
      .catch(() => push({ title: t('subscribeError'), variant: 'destructive' }));
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpen}
        disabled={loading}
        data-testid="subscribe-calendar"
        className="min-h-[44px]"
      >
        <CalendarSync className="mr-2 h-4 w-4" />
        {loading ? t('subscribeLoading') : t('subscribeTitle')}
      </Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            className="fixed inset-x-0 bottom-0 z-50 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
            aria-describedby={undefined}
          >
            <div
              className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden"
              aria-hidden
            />
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="text-base font-semibold">
                {t('subscribeTitle')}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t('subscribeDesc')}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              <li>{t('subscribeStep1')}</li>
              <li>{t('subscribeStep2')}</li>
              <li>{t('subscribeStep3')}</li>
            </ol>
            {webcalUrl ? (
              <div className="mt-4 space-y-2">
                <p className="break-all rounded-md bg-muted p-2 font-mono text-xs">
                  {webcalUrl}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={copy} className="min-h-[44px] flex-1">
                    <Copy className="mr-2 h-4 w-4" />
                    {t('subscribeCopy')}
                  </Button>
                  <a
                    href={webcalUrl}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    {t('subscribeOpen')}
                  </a>
                </div>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
