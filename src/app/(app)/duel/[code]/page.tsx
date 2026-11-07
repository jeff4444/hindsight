import { DuelScreen } from '@/components/game/DuelScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duel' };

/** A duel, by its link (docs/rules.md §23.6). The screen loads it through the API. */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DuelScreen code={code.toLowerCase()} />;
}
