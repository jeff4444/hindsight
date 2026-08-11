import { CardGridSkeleton, PageHeadSkeleton } from '@/components/shell/skeletons';

export default function TapesLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeadSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
