import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Survival' };

/**
 * Survival is the run mode the code and the API still call `streak`. The player-facing name changed
 * so it stops colliding with the daily streak; the run, its rules and its stored rows did not.
 */
export default async function SurvivalPage({ searchParams }: { searchParams: Promise<{ tape?: string }> }) {
  const params = await searchParams;
  return <PlaySurface mode="streak" tape={params.tape ?? 'open'} />;
}
