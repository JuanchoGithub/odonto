import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-10 px-4 border border-dashed rounded-md',
        className,
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      {description ? (
        <div className="text-xs text-muted-foreground mt-1 max-w-sm">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
