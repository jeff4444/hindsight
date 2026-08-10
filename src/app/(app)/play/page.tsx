import { PlaySurface } from '@/components/play/PlaySurface';

export const dynamic = 'force-dynamic';

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; tape?: string; new?: string }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === 'tape' ? 'tape' : params.mode === 'ranked' ? 'ranked' : 'daily';
  return <PlaySurface mode={mode} tape={params.tape ?? 'open'} fresh={params.new === '1'} />;
}
