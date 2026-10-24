import { Skeleton } from '@/components/ui';

/** The boards read several tables; this holds the page's shape while they arrive. */
export default function RanksLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton variant="fog" className="h-40 rounded-3xl" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
