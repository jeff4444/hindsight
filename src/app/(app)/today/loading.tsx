import { Skeleton } from '@/components/ui';
import { CardGridSkeleton } from '@/components/shell/skeletons';

/**
 * Shown while the layout resolves. The page itself streams section by section behind its own
 * Suspense boundaries, so in practice this is brief — but a navigation into /home still has to
 * wait for the shell's identity lookup, and that is long enough to be worth drawing.
 */
export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <Skeleton className="h-3 w-16 rounded" />
      <Skeleton className="mt-2 h-8 w-44" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <Skeleton className="mt-10 h-3 w-16 rounded" />
      <CardGridSkeleton count={3} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" />
    </div>
  );
}
