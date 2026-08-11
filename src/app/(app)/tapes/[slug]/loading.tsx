import { Skeleton } from '@/components/ui';
import { PageHeadSkeleton } from '@/components/shell/skeletons';

export default function TapeLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeadSkeleton />
      <Skeleton className="mt-7 h-24" />
      <Skeleton className="mt-4 h-12 w-44" />
    </div>
  );
}
