import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/lib/navigation';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container py-16">
      <EmptyState
        title="404"
        description="The page you're looking for doesn't exist."
        action={
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
