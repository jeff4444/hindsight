import { notFound } from 'next/navigation';
import { LiveTerminal } from '@/components/trading/LiveTerminal';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A trading session. The terminal loads it through the API, which checks it is yours: the page
 * itself holds nothing a stranger could read.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <LiveTerminal sessionId={id} />;
}
