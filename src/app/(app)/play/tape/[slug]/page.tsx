import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Practice' };

/**
 * Practice on a tape. `rules` picks the ruleset (`tier` is the legacy name and still read, so old
 * links keep their ruleset), and `sandbox=1` is the unrated learning mode. Both are passed through
 * unparsed: `/api/round` validates the tier against the ruleset table and the tape's lock, and that
 * is the only check that can matter — the round is issued there, not here.
 */
export default async function TapePlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rules?: string; tier?: string; sandbox?: string; mods?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const tier = query.sandbox === '1' ? 'SBX' : (query.rules ?? query.tier);
  return <PlaySurface mode="tape" tape={decodeURIComponent(slug)} tier={tier} mods={query.mods} />;
}
