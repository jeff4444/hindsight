import { Skeleton } from '@/components/ui';

/**
 * The landing page reads the viewer so it can swap "Sign in" for "Your desk", which makes it
 * dynamic. This keeps the first paint from being an empty page while that resolves.
 */
export default function MarketingLoading() {
  return (
    <div className="mx-auto max-w-app px-5 py-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:py-20">
        <div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-4/5" />
          <div className="mt-6 max-w-prose">
            <Skeleton variant="text" lines={3} />
          </div>
          <Skeleton className="mt-7 h-12 w-64" />
        </div>
        <Skeleton className="aspect-[4/3] w-full" />
      </div>
    </div>
  );
}
