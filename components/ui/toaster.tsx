'use client';
import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed top-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 outline-none',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & {
    variant?: 'default' | 'destructive' | 'success';
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-3 pr-6 shadow-lg transition-all',
      variant === 'destructive' && 'border-destructive bg-destructive text-destructive-foreground',
      variant === 'success' && 'border-emerald-500/40 bg-emerald-500/10',
      !variant || variant === 'default'
        ? 'border bg-background text-foreground'
        : '',
      className,
    )}
    {...props}
  />
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn('text-sm font-semibold', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn('text-xs opacity-90', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      'absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100',
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

type ToastItem = {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  action?: { label: string; onClick: () => void };
};

const ToastContext = React.createContext<{
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
} | null>(null);

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  function push(t: Omit<ToastItem, 'id'>) {
    const id = Math.random().toString(36).slice(2);
    setToasts((s) => [...s, { ...t, id }]);
    setTimeout(() => dismiss(id), t.action ? 6000 : 4000);
  }
  function dismiss(id: string) {
    setToasts((s) => s.filter((t) => t.id !== id));
  }
  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      <ToastProvider>
        {children}
        {toasts.map((t) => (
          <Toast key={t.id} variant={t.variant}>
            <div className="grid gap-0.5 flex-1">
              {t.title ? <ToastTitle>{t.title}</ToastTitle> : null}
              {t.description ? (
                <ToastDescription>{t.description}</ToastDescription>
              ) : null}
            </div>
            {t.action ? (
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <ToastClose onClick={() => dismiss(t.id)} />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // No provider (e.g. server components or pre-mount). Fall back to a no-op.
    return {
      toasts: [],
      push: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}
