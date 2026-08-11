import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    tape?: string;
    new?: string;
    tier?: string;
    mods?: string;
  }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === 'tape' ? 'tape' : params.mode === 'ranked' ? 'ranked' : 'daily';
  // `tier` and `mods` are passed through rather than parsed here: `/api/round` already validates
  // both against §3.2 and §3.3 and falls back to the default for anything it does not recognise,
  // and that is the only check that can matter — the round is issued there, not here.
  return (
    <PlaySurface
      mode={mode}
      tape={params.tape ?? 'open'}
      fresh={params.new === '1'}
      tier={params.tier}
      mods={params.mods}
    />
  );
}
