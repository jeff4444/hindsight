import { Skeleton } from '@/components/ui';
import { CardGridSkeleton } from '@/components/shell/skeletons';

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <Skeleton variant="circle" className="h-22 w-22" />
        <div className="flex-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-3.5 w-52 rounded" />
        </div>
      </div>
      <CardGridSkeleton count={4} height="h-24" className="mt-8 grid gap-3 sm:grid-cols-4" />
    </div>
  );
}
