import { notFound, redirect } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { routes } from '@/lib/routes';
import { reviewSession, TradeError } from '@/lib/trading/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { SessionReview } from '@/components/trading/SessionReview';
import { Button } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** The review of a closed session: the identity, the statement, the tape, and the schools on it. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = (await currentUserId()) ?? (await readSession());
  if (!owner) notFound();
  let review;
  try {
    review = await reviewSession(serviceClient(), id, owner);
  } catch (error) {
    if (error instanceof TradeError && error.status === 409) redirect(routes.trade.session(id));
    if (error instanceof TradeError && error.status === 404) notFound();
    throw error;
  }
  return (
    <SessionReview
      review={review}
      actions={
        <>
          <Button variant="primary" href={routes.trade.open({ kind: 'random' })}>
            Trade another market
          </Button>
          <Button variant="ghost" href={routes.portfolio()}>
            Portfolio
          </Button>
        </>
      }
    />
  );
}
