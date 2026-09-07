'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { X, CalendarPlus, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Single entry point for creating a turn. Staff pick HOW to assign it:
 * - Manual: opens the full form (patient, date, time, duration, motive, notes).
 * - Link: opens the turn-link generator so the patient self-books.
 *
 * Bottom sheet on mobile, centered modal on sm: and up (see AGENTS §13.5).
 */
export function AddTurnDialog({
  open,
  onOpenChange,
  onManual,
  onLink,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onManual: () => void;
  onLink: () => void;
}) {
  const t = useTranslations('appointments');
  const tTp = useTranslations('turnPicker');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          data-testid="add-turn-dialog"
          className="fixed inset-x-0 bottom-0 z-50 w-full bg-background border-t rounded-t-2xl shadow-xl p-4 pb-safe max-h-[92dvh] overflow-y-auto sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:rounded-lg sm:p-6 sm:pb-6 sm:max-w-md sm:max-h-[90vh]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden />
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {t('new')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              data-testid="add-turn-manual"
              onClick={onManual}
              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left active:bg-accent hover:bg-accent"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarPlus className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">
                  {t('addManual')}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {t('addManualDesc')}
                </span>
              </span>
            </button>
            <button
              type="button"
              data-testid="add-turn-link"
              onClick={onLink}
              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border bg-card p-3 text-left active:bg-accent hover:bg-accent"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Share2 className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">
                  {tTp('shareButton')}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {t('shareLinkDesc')}
                </span>
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
