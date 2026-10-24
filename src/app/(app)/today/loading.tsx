import { Skeleton } from '@/components/ui';

/**
 * Shown while the layout resolves. The page streams section by section behind its own Suspense
 * boundaries, so this is brief — it has the same geometry as the page, so nothing jumps.
 */
export default function TodayLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-16 w-72" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Skeleton variant="fog" className="h-80 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    </div>
  );
}
