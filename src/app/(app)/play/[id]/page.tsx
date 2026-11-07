import { notFound } from 'next/navigation';
import { LiveRound } from '@/components/game/LiveRound';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A round. The screen loads it through the API, which checks it is yours and sends no tape until
 * it is locked in: the page itself holds nothing a stranger could read.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <LiveRound roundId={id} />;
}
