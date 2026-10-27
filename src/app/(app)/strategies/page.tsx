import Link from 'next/link';
import { routes } from '@/lib/routes';
import { formatPct, formatUsd } from '@/lib/trading/format';
import { getBotAccounts, type BotAccount } from '@/lib/trading/server/queries';
import { SCHOOLS } from '@/lib/trading/schools';
import { BOT_PARAMS, BOT_SPEC_HASH } from '@/core/bots/spec';
import { BOT_VERSION } from '@/core/versions';
import { Chip, PageHeader, PersonaAvatar, Sparkline, cx } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

/**
 * Strategies: the schools of thought, each with its own money.
 *
 * Every school trades every real market in the library, in the order history dealt them, by its own
 * published entry rules and its own exit, sizing each trade so the stop costs one percent. Whatever
 * the result, it stands; tuning a school starts a new account rather than editing this one.
 */
export default async function StrategiesPage() {
  const accounts = await getBotAccounts();
  const byCode = new Map<string, BotAccount>((accounts ?? []).map((a) => [a.code, a]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Strategies"
        title="Eight schools, eight accounts."
        lede={`Each school of thought trades the same real markets you do, by its own published rules, with $${BOT_PARAMS.startingBalanceUsdt.toLocaleString('en-US')} of its own. Nothing here is tuned to look good: the rules were fixed before the markets were dealt.`}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {SCHOOLS.map(({ spec, persona, entry }) => {
          const account = byCode.get(spec.code);
          const ret = account?.returnPct ?? null;
          return (
            <Link
              key={spec.code}
              href={routes.strategies.show(spec.code)}
              className="press bg-surface-2 border-line hover:border-line-strong group flex flex-col gap-4 rounded-xl border p-4 transition-colors"
            >
              <div className="flex items-start gap-3">
                <PersonaAvatar persona={persona} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-ink-max font-semibold">{persona.name}</span>
                    {persona.isNull && <Chip size="sm">Benchmark</Chip>}
                  </div>
                  <p className="text-ink-lo mt-0.5 line-clamp-2 text-sm">{entry}</p>
                </div>
                <Icon name="chevron-right" size={16} className="text-ink-dim group-hover:text-ink-hi mt-1" />
              </div>
              {account ? (
                <div className="flex items-end justify-between gap-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Figure label="Equity" value={formatUsd(account.equity, { compact: true })} />
                    <Figure
                      label="Return"
                      value={formatPct(ret ?? 0, { sign: true })}
                      className={cx(ret !== null && ret > 0 ? 'text-long-ink' : ret !== null && ret < 0 ? 'text-short-ink' : 'text-ink-hi')}
                    />
                    <Figure label="Trades" value={String(account.roundTrips)} />
                  </div>
                  <Sparkline values={account.curve} tone={ret !== null && ret >= 0 ? 'long' : 'short'} width={110} height={34} />
                </div>
              ) : (
                <div className="text-ink-dim text-xs">Has not traded the library yet.</div>
              )}
            </Link>
          );
        })}
      </div>

      <p className="text-ink-dim text-xs">
        Trading rules version {BOT_VERSION}, spec {BOT_SPEC_HASH}. Every school is measured against the Coin: a strategy that
        cannot beat a coin flip over the whole library has no measured edge, whatever its record looks like over a few markets.
      </p>
    </div>
  );
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="eyebrow text-ink-dim">{label}</div>
      <div className={cx('numeral mt-0.5 text-sm font-semibold', className ?? 'text-ink-hi')}>{value}</div>
    </div>
  );
}
