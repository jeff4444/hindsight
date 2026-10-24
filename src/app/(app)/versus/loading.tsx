import { Skeleton } from '@/components/ui';

/** The launcher, then the list of your matches. */
export default function VersusLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-36 rounded-3xl" />
      </div>
      <Skeleton variant="fog" className="h-48 rounded-3xl" />
    </div>
  );
}
