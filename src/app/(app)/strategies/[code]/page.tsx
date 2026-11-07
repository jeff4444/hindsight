import { notFound } from 'next/navigation';
import { routes } from '@/lib/routes';
import { formatPct, formatUsd } from '@/lib/trading/format';
import { getBotAccounts } from '@/lib/trading/server/queries';
import { schoolBySlug } from '@/lib/trading/schools';
import { Button, Chip, Panel, PersonaAvatar, Stat } from '@/components/ui';
import { EquityCurve } from '@/components/trading/EquityCurve';

export const dynamic = 'force-dynamic';

/** One school: its rules in plain words, its account, and its curve across the library. */
export default async function StrategyPage({ params }: { params: Promise<{ code: string }> }) {
  const school = schoolBySlug((await params).code);
  if (!school) notFound();
  const { persona, spec, entry, exit, sizing } = school;
  const account = (await getBotAccounts())?.find((a) => a.code === spec.code) ?? null;
  const tone = (value: number) => (value > 0 ? 'long' : value < 0 ? 'short' : 'neutral');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <PersonaAvatar persona={persona} size={64} />
        <div className="flex-1">
          <div className="eyebrow text-ink-dim">Strategy</div>
          <h1 className="font-display text-ink-max mt-1 text-4xl">{persona.name}</h1>
          <p className="text-ink-lo mt-1 max-w-2xl text-sm">{persona.source}</p>
        </div>
        {persona.ours && <Chip tone="attention">Rules partly ours</Chip>}
      </div>

      {account ? (
        <>
          <Panel tone="hero" pad="md" className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="Equity" value={formatUsd(account.equity)} />
            <Stat label="Return" value={formatPct(account.returnPct, { sign: true })} tone={tone(account.returnPct)} />
            <Stat label="Max drawdown" value={formatPct(account.maxDrawdown)} />
            <Stat label="Profit factor" value={account.profitFactor === null ? '—' : account.profitFactor.toFixed(2)} />
            <Stat label="Markets traded" value={account.sessions} size="sm" />
            <Stat label="Trades" value={account.roundTrips} size="sm" />
            <Stat label="Win rate" value={account.winRate === null ? '—' : formatPct(account.winRate, { decimals: 0 })} size="sm" />
            <Stat label="Fees paid" value={formatUsd(account.fees)} size="sm" />
          </Panel>
          <Panel pad="md">
            <div className="text-ink-hi mb-3 text-sm font-medium">Equity across the library, market by market</div>
            <EquityCurve values={account.curve} baseline={account.starting} height={200} label={`${persona.name} equity curve`} />
          </Panel>
        </>
      ) : (
        <Panel pad="md">
          <p className="text-ink-lo text-sm">This school has not traded the library yet. Its account opens the first time the schools are run.</p>
        </Panel>
      )}

      <Panel pad="md" className="grid gap-5 md:grid-cols-3">
        <Rule title="Gets in" body={entry} />
        <Rule title="Gets out" body={exit} />
        <Rule title="Sizes" body={sizing} />
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button href={routes.strategies.index} variant="ghost">
          All strategies
        </Button>
        <Button href={routes.learn.methods} variant="secondary">
          The full rules
        </Button>
      </div>
    </div>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="eyebrow text-accent-ink">{title}</div>
      <p className="text-ink-hi mt-1.5 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
