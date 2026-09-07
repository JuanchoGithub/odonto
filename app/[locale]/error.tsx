'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

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
      <Alert
        variant="destructive"
        className="max-w-xl mx-auto flex flex-col items-start gap-3 [&>svg]:static [&>svg~*]:pl-0"
      >
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          {error.message || 'Unexpected error'}
        </AlertDescription>
        {error.digest ? (
          <p className="text-xs text-muted-foreground font-mono">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-2 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Go home
          </Button>
        </div>
      </Alert>
    </div>
  );
}
