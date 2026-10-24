'use client';

import type { MatchPayload } from '@/lib/api-types';
import { DUEL_SPEC } from '@/core/duel';
import { Button, Chip, cx } from '../ui';
import { routes } from '@/lib/routes';
import { SummaryShell } from './SummaryShell';

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
        <span className="numeral text-ink-max text-lg leading-none font-semibold">
          {match.score >= 0 ? '+' : ''}
          {Math.round(match.score)}
        </span>
        <span className="numeral text-ink-dim text-xs">
          {match.charts}/{match.length}
        </span>
        {!match.clean && <Chip tone="attention">seen before</Chip>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <HealthBar value={match.health} label="You" tone="you" />
      <span className="numeral text-ink-dim text-xs">
        {match.charts}/{match.length}
      </span>
      <HealthBar value={match.opponentHealth} label="Them" tone="them" />
      {match.pending && <Chip tone="neutral">waiting on them</Chip>}
    </div>
  );
}

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
    <span className={cx('flex items-center gap-1.5', tone === 'them' && 'flex-row-reverse')} title={`${label}: ${value ?? '—'} of ${DUEL_SPEC.health}`}>
      <span className="text-ink-dim text-micro font-semibold uppercase">{label}</span>
      <span className="bg-fill-2 relative h-2 w-14 overflow-hidden rounded-full sm:w-24">
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

export function MatchSummary({ match, onAgain }: { match: MatchPayload; onAgain: () => void }) {
  const actions = (
    <>
      <Button onClick={onAgain} variant="primary" size="lg">
        New match
      </Button>
      <Button href={routes.play.hub} variant="secondary" size="lg">
        Something else
      </Button>
    </>
  );

  if (match.mode === 'race') {
    return (
      <SummaryShell
        eyebrow="Race"
        title="Across the line."
        figure={`${match.score >= 0 ? '+' : ''}${Math.round(match.score)}`}
        caption={`across ${match.charts} chart${match.charts === 1 ? '' : 's'}`}
        actions={actions}
        footnote={
          match.clean
            ? 'Scored on how well you read each chart, not how fast. Rushing eight badly loses to reading three well.'
            : 'You had already played one of these charts, so your run is marked as seen-before on the standings.'
        }
      />
    );
  }

  const won = match.winner === 'me';
  const drew = match.winner === 'draw';
  return (
    <SummaryShell
      eyebrow="Duel"
      title={drew ? 'Dead even.' : won ? 'You won.' : 'They had you.'}
      figure={`${match.health} – ${match.opponentHealth ?? '—'}`}
      figureTone={drew ? 'text-ink-max' : won ? 'text-gain-ink' : 'text-loss-ink'}
      caption={`health left, after ${match.charts} chart${match.charts === 1 ? '' : 's'}`}
      actions={actions}
      footnote={`Each chart deals the gap between your two scores, capped at ${DUEL_SPEC.damageCap} so no single chart decides it. A chart you read equally well does nothing.`}
    />
  );
}
