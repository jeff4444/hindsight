import { Skeleton } from '../ui';

/**
 * Loading geometry.
 *
 * A skeleton is only worth anything if it has the shape of the thing it replaces. A generic
 * spinner tells you the page is busy; a skeleton that matches the real layout tells you what is
 * about to appear and stops the content from jumping when it does. So these mirror the actual
 * pages — same container width, same grid, same heights — rather than being a stack of grey bars.
 *
 * Every one of these is new. The app previously had no `loading.tsx` anywhere, so four routes that
 * block on Supabase rendered nothing at all until the query returned.
 */

/** Eyebrow, title, and optionally a paragraph of lede — the header every inner page opens with. */
export function PageHeadSkeleton({ lede = true }: { lede?: boolean }) {
  return (
    <div>
      <Skeleton className="h-3 w-28 rounded" />
      <Skeleton className="mt-2.5 h-8 w-40" />
      {lede && (
        <div className="mt-3 max-w-prose">
          <Skeleton variant="text" lines={2} />
        </div>
      )}
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  height = 'h-40',
  className = 'mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
}: {
  count?: number;
  height?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  );
}
