export default function Loading() {
  return (
    <div className="container py-8 space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-md border bg-muted/30" />
        ))}
      </div>
      <div className="h-64 rounded-md border bg-muted/30" />
    </div>
  );
}
