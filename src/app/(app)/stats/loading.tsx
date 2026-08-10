import { CardGridSkeleton, PageHeadSkeleton } from '@/components/shell/skeletons';

export default function StatsLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeadSkeleton />
      <CardGridSkeleton count={4} height="h-28" className="mt-6 grid gap-3 sm:grid-cols-2" />
    </div>
  );
}
