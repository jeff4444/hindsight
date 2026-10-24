import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ranked' };

/** `?new=1` starts a fresh session even when the last one finished; without it, resume. */
export default async function RankedPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const params = await searchParams;
  return <PlaySurface mode="ranked" fresh={params.new === '1'} />;
}
