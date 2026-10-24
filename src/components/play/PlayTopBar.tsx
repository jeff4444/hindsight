'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { tierByCode } from '@/core/tiers';
import type { RoundPayload } from '@/lib/api-types';
import { cx } from '../ui';
import { Popover } from '../ui/client';
import { Icon } from '../ui/icons';

/**
 * The stage's only chrome: the way out, what you are playing, the rules, and the clock.
 *
 * The rules chip is new and it fixes a real gap — the ruleset was never named during a round. A
 * player on a Full Desk tape and a player in ranked saw the same header, and the only way to learn
 * what was allowed was a tooltip on the timeframe chip. Now the chip names it and opens what is on
 * and what is off.
 */
export function PlayTopBar({
  exitHref,
  exitLabel,
  title,
  hud,
  round,
  clock,
  timeframe,
  onHelp,
  phaseLabel,
}: {
  exitHref: string;
  exitLabel: string;
  title: ReactNode;
  /** Mode-specific progress: pips, a run counter, health bars. */
  hud?: ReactNode;
  round: RoundPayload | null;
  clock?: ReactNode;
  timeframe?: ReactNode;
  onHelp: () => void;
  /** Read / Call / Reveal / Review — where in the loop this is. */
  phaseLabel?: string | null;
}) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          href={exitHref}
          aria-label={`Leave and go to ${exitLabel}`}
          className="press text-ink-lo hover:text-ink-hi hover:bg-fill-2 ring-line grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 transition-colors"
        >
          <Icon name="x" size={16} />
        </Link>
        <div className="min-w-0">
          <div className="text-ink-max truncate text-sm font-semibold">{title}</div>
          {phaseLabel && <div className="eyebrow text-ink-dim mt-0.5 hidden sm:block">{phaseLabel}</div>}
        </div>
        {hud}
      </div>

      <div className="flex items-center gap-2">
        {round && <RulesChip round={round} />}
        {timeframe}
        {clock}
        <button
          type="button"
          onClick={onHelp}
          aria-label="Keyboard shortcuts"
          className="press text-ink-dim hover:text-ink-hi hover:bg-fill-2 hidden h-9 w-9 place-items-center rounded-full transition-colors md:grid"
        >
          <Icon name="keyboard" size={17} />
        </button>
      </div>
    </header>
  );
}

function RulesChip({ round }: { round: RoundPayload }) {
  const tier = tierByCode(round.tier);
  const name = tier?.name ?? round.tier;
  const clockSeconds = round.clockMs !== null ? (tier?.clockSeconds ?? Math.round(round.clockMs / 1000)) : null;
  const rows: { label: string; on: boolean; detail?: string }[] = [
    { label: 'Candles of history', on: true, detail: String(round.bars.length) },
    {
      label: 'Timeframes',
      on: round.timeframes.length > 1,
      detail: round.timeframes.length > 1 ? `${round.timeframes.length} to choose from` : 'One',
    },
    { label: 'Volume', on: round.volume },
    { label: 'Indicators and drawing tools', on: round.tools.length > 0 },
    { label: 'Clock', on: clockSeconds !== null, detail: clockSeconds !== null ? `${clockSeconds}s to decide` : 'Take your time' },
    { label: 'Sitting out', on: round.mayPass },
    { label: 'Ruler, in ATR and R', on: true },
  ];

  return (
    <Popover
      label={`Rules: ${name}`}
      width="w-72"
      className="press bg-fill-1 ring-line text-ink-hi hover:bg-fill-2 flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 transition-colors"
      trigger={
        <>
          <Icon name="shield" size={14} className="text-ink-dim" />
          {name}
          {tier?.code === 'SBX' && <span className="text-ink-dim text-xs">· unrated</span>}
        </>
      }
    >
      <p className="text-ink-max font-semibold">{name}</p>
      <p className="text-ink-lo mt-1 text-xs leading-relaxed">
        {tier?.code === 'SBX'
          ? 'Everything on, and nothing rated. For learning, not for proving.'
          : 'What this ruleset lets you see. The price axis and the ATR badge are never taken away — risk arithmetic is not a crutch.'}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className={cx(
                'grid h-4 w-4 shrink-0 place-items-center rounded-full',
                row.on ? 'bg-long-bg text-long-ink' : 'bg-fill-2 text-ink-dim',
              )}
            >
              <Icon name={row.on ? 'check' : 'x'} size={10} stroke={2.5} />
            </span>
            <span className={row.on ? 'text-ink' : 'text-ink-dim'}>{row.label}</span>
            {row.detail && <span className="numeral text-ink-dim ml-auto">{row.detail}</span>}
          </li>
        ))}
      </ul>
    </Popover>
  );
}
