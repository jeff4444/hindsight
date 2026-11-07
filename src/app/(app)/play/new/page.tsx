import { LiveRound } from '@/components/game/LiveRound';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Training grounds' };

/** Deal a training round and play it (docs/rules.md §23.5). */
export default function Page() {
  return <LiveRound roundId={null} />;
}
