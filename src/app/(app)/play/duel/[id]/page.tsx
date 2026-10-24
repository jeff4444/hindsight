import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duel' };

export default async function DuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaySurface mode="duel" match={id} />;
}
