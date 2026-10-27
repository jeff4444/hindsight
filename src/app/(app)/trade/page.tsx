import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import { routes } from '@/lib/routes';
import { currentUserId } from '@/lib/trading/server/identity';
import { getOpenSession } from '@/lib/trading/server/queries';

export const dynamic = 'force-dynamic';

/** Trade: straight back to the session you have open, or to Markets to open one. */
export default async function Page() {
  const owner = (await currentUserId()) ?? (await readSession());
  const open = await getOpenSession(owner);
  redirect(open ? routes.trade.session(open.id) : routes.markets());
}
