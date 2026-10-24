import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storm' };

export default async function StormPage({ searchParams }: { searchParams: Promise<{ tape?: string }> }) {
  const params = await searchParams;
  return <PlaySurface mode="storm" tape={params.tape ?? 'open'} />;
}
