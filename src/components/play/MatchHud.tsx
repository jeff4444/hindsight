'use client';

import Link from 'next/link';
import type { MatchPayload } from '@/lib/api-types';
import { DUEL_SPEC } from '@/core/duel';
import { Chip, Eyebrow, Panel, cx } from '../ui';

/**
 * §10.1's duel and race, on screen.
 *
 * The duel's whole tension curve is two bars, and §4.3 says so: the format "produces a tension curve
 * a spectator can read at a glance". So the bars are the header, and everything else about the match
 * is below the fold.
 *
 * ## Waiting is a state, not an absence
 *
 * A duel is asynchronous by design — the opponent's charts may be played tomorrow — so most commits
 * come back with no exchange to show. That reads as breakage unless it is named, so a pending round
 * says what it is waiting for rather than leaving a bar mysteriously still.
 */
export function MatchHud({ match }: { match: MatchPayload }) {
  if (match.mode === 'race') {
    return (
      <div className="flex items-center gap-2.5">
        <Eyebrow className="hidden sm:block">Race</Eyebrow>
        <span className="numeral text-ink-max text-lg leading-none font-semibold">
          {match.score >= 0 ? '+' : ''}
          {Math.round(match.score)}
        </span>
        <span className="text-ink-faint text-xs">
          {match.charts}/{match.length}
        </span>
        {!match.clean && <Chip tone="attention">seen before</Chip>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <HealthBar value={match.health} label="you" tone="you" />
      <span className="text-ink-faint text-xs">
        {match.charts}/{match.length}
      </span>
      <HealthBar value={match.opponentHealth} label="them" tone="them" />
      {match.pending && <Chip tone="neutral">waiting</Chip>}
    </div>
  );
}

/** A bar out of `DUEL_SPEC.health`. Null means nobody has taken the other seat yet. */
function HealthBar({
  value,
  label,
  tone,
}: {
  value: number | null;
  label: string;
  tone: 'you' | 'them';
}) {
  const fraction = value === null ? 0 : Math.max(0, Math.min(1, value / DUEL_SPEC.health));
  return (
    <span className="flex items-center gap-1.5" title={`${label}: ${value ?? '—'} of ${DUEL_SPEC.health}`}>
      <span className="bg-fill-2 relative h-2 w-16 overflow-hidden rounded-full sm:w-24">
        <span
          className={cx(
            'absolute inset-y-0 transition-[width] duration-500',
            tone === 'you' ? 'bg-info left-0' : 'bg-loss right-0',
            // Below a quarter the bar stops being decoration and becomes the thing you are watching.
            fraction <= 0.25 && 'animate-pulse',
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </span>
      <span className="numeral text-ink-lo w-5 text-xs">{value ?? '—'}</span>
    </span>
  );
}

/**
 * The end of a match.
 *
 * A duel reports the result from this player's side, because that is whose screen it is. A race
 * reports the score and the charts it took — never the charts alone, since `standings()` ranks on
 * score and a summary that led with speed would be describing a different game than the one scored.
 */
export function MatchSummary({ match, onAgain }: { match: MatchPayload; onAgain: () => void }) {
  if (match.mode === 'race') {
    return (
      <Panel pad="lg" className="mx-auto mt-6 max-w-md text-center">
        <Eyebrow>Race over</Eyebrow>
        <p className="numeral text-ink-max mt-3 text-5xl font-semibold">
          {match.score >= 0 ? '+' : ''}
          {Math.round(match.score)}
        </p>
        <p className="text-ink-lo mt-1 text-sm">
          across {match.charts} chart{match.charts === 1 ? '' : 's'}
        </p>
        {!match.clean && (
          <p className="text-attention-ink mt-4 text-xs leading-relaxed">
            You had already played at least one of these charts, so your run is marked and the
            standings say so. It is still your run — it is just not comparable to someone seeing them
            for the first time.
          </p>
        )}
        <p className="text-ink-faint mx-auto mt-5 max-w-prose text-xs leading-relaxed">
          Scored on IMPs, not on charts finished. Rushing eight badly loses to reading three well,
          which is the opposite of what a stopwatch would reward.
        </p>
        <Again onAgain={onAgain} />
      </Panel>
    );
  }

  const won = match.winner === 'me';
  const drew = match.winner === 'draw';
  return (
    <Panel pad="lg" className="mx-auto mt-6 max-w-md text-center">
      <Eyebrow>{drew ? 'Both bars empty' : won ? 'You won' : 'You lost'}</Eyebrow>
      <p
        className={cx(
          'numeral mt-3 text-5xl font-semibold',
          drew ? 'text-ink-max' : won ? 'text-gain-ink' : 'text-loss-ink',
        )}
      >
        {match.health} – {match.opponentHealth ?? '—'}
      </p>
      <p className="text-ink-lo mt-1 text-sm">
        after {match.charts} chart{match.charts === 1 ? '' : 's'}
      </p>
      <p className="text-ink-faint mx-auto mt-5 max-w-prose text-xs leading-relaxed">
        Damage is the difference between two readings of the same chart, capped at{' '}
        <span className="numeral">{DUEL_SPEC.damageCap}</span> so one chart cannot decide a match. A
        chart you both read equally well does nothing at all.
      </p>
      <Again onAgain={onAgain} />
    </Panel>
  );
}

function Again({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <button
        onClick={onAgain}
        className="press bg-ink text-ink-inv rounded-md px-4 py-2 text-sm font-medium"
      >
        Again
      </button>
      <Link
        href="/versus"
        className="press border-line bg-surface-1 text-ink-hi rounded-md border px-4 py-2 text-sm font-medium"
      >
        Versus
      </Link>
    </div>
  );
}
