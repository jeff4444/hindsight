import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Race' };

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaySurface mode="race" match={id} />;
}
