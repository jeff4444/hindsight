import { openSchema, type OpenRequest } from '@/lib/trading/schemas';
import { OpenMarket } from '@/components/trading/OpenMarket';

export const dynamic = 'force-dynamic';

/** `/trade/new?market=pair&symbol=BTCUSDT` and friends: open a market, then go to it. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; symbol?: string; scenario?: string; account?: string; dates?: string }>;
}) {
  const params = await searchParams;
  const market =
    params.market === 'pair' && params.symbol
      ? { kind: 'pair' as const, symbol: params.symbol.toUpperCase() }
      : params.market === 'daily'
        ? { kind: 'daily' as const }
        : params.market === 'scenario' && params.scenario
          ? { kind: 'scenario' as const, slug: params.scenario }
          : { kind: 'random' as const };
  const parsed = openSchema.safeParse({
    market,
    account: params.account === 'practice' ? 'practice' : 'main',
    showDates: params.dates === '1',
  });
  const request: OpenRequest = parsed.success ? parsed.data : { market: { kind: 'random' }, account: 'main' };
  return <OpenMarket request={request} />;
}
