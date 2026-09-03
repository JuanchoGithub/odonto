'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[odonto] runtime error', error);
  }, [error]);

  return (
    <div className="container py-16">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 max-w-xl mx-auto">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {error.message || 'Unexpected error'}
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground mt-2 font-mono">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
