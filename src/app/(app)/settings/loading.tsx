import { Skeleton } from '@/components/ui';
import { PageHeadSkeleton } from '@/components/shell/skeletons';

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeadSkeleton lede={false} />
      <Skeleton className="mt-6 h-64" />
      <Skeleton className="mt-4 h-44" />
    </div>
  );
}
