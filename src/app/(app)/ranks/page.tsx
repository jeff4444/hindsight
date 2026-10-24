import { EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ranks' };

export default function RanksPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Ranks" title="The field" lede="Today's daily, the ranked ladder, and every tape's best." />
      <EmptyState icon="trophy" title="Boards are on their way" body="Leaderboards land in the next part of this build." />
    </div>
  );
}
