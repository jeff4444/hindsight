'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DailyPayload, DailyResult } from '@/lib/api-types';
import { useBeats } from '@/lib/useBeats';
import { useCountUp } from '@/lib/useTween';
import { percentileBar } from '@/lib/share';
import { Button, Eyebrow, Panel, ProgressArc, cx } from '../ui';
import { useToast } from '../ui/client';
import { Icon } from '../ui/icons';
import { Beat } from '../ui/motion';

/**
 * The end of a daily.
 *
 * This is the moment the product's whole retention loop rests on, and it used to be a panel with
 * a number, a `<pre>` and two buttons — one 260ms fade, no acknowledgement that five decisions had
 * just been made, and no sign that the streak had moved.
 *
 * §10.4 still governs what the card may say: spoiler-free, plain Unicode, no image, no link, and
 * the traded count printed because §4.4 makes it the daily's only brake on passing everything.
 * None of that changes. What changes is that the screen now shows the *shape* of the day before it
 * shows the card — five tiles, one per chart, in the order they were played.
 *
 * The beats, in order: the day's shape, then the score, then what it did to the streak, then the
 * card. Each is a different kind of fact and they land separately, on one clock.
 */
const BEATS = [0, 200, 420, 640, 860, 1080, 1400, 2200, 2900] as const;

/** Tiles land one at a time on beats 1–5, so five charts read as five decisions. */
const TILE_BEAT = 1;
const SCORE_BEAT = 6;
const STREAK_BEAT = 7;
const CARD_BEAT = 8;

export function DailyCeremony({ daily }: { daily: DailyPayload }) {
  const beats = useBeats(BEATS, [daily.day]);
  const toast = useToast();
  // `navigator.share` exists on desktop Safari too, but only a touch device makes it the better
  // affordance. Read through an external store rather than an effect: it is a fixed capability of
  // the device, not a piece of state that changes, and it must be `false` during SSR.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => !!navigator.share && matchMedia('(pointer: coarse)').matches,
    () => false,
  );

  const pct = daily.percentile === null ? null : daily.percentile * 100;
  const counted = useCountUp(pct, { ms: 760, decimals: 0, deps: [daily.day] });

  const copy = async () => {
    if (!daily.card) return;
    try {
      await navigator.clipboard.writeText(daily.card);
      toast('Card copied', 'success');
    } catch {
      toast('Could not reach the clipboard — the card is selectable above', 'error');
    }
  };

  const share = async () => {
    if (!daily.card) return;
    try {
      await navigator.share({ text: daily.card });
    } catch {
      // Cancelled, or unavailable. Nothing to report — the card is on screen either way.
    }
  };

  return (
    // Constrained rather than filling the stage. The play route is capped at 1920 so the chart
    // can use the whole monitor, but the ceremony is a column of prose and figures — at that width
    // it strands its own content in the left third with nothing on the right.
    <Panel
      tone="hero"
      glow={daily.streak?.perfect ? 'gold' : 'brand'}
      pad="none"
      className="animate-rise mx-auto w-full max-w-3xl p-5 md:p-8"
    >
      <Eyebrow tone={daily.streak?.perfect ? 'gold' : undefined}>
        Daily #{daily.day} complete
      </Eyebrow>

      {/* The shape of the day. Five tiles is the Wordle grid — it is what you played, not what
          you scored, and it is legible before a single number is read. */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {daily.results.map((result, i) => (
          <Beat key={result.index} on={TILE_BEAT + i} beats={beats} animation="pop">
            <RoundTile result={result} ordinal={i + 1} />
          </Beat>
        ))}
      </div>

      <Beat on={SCORE_BEAT} beats={beats} className="mt-7">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <div>
            <div className="numeral text-ink-max font-semibold text-display-sm sm:text-display-xl">
              {counted}
            </div>
            <p className="text-ink-lo mt-1 text-sm">
              Mean percentile across {daily.total} charts, against everything each one allowed.
            </p>
          </div>

          {/* The same ten blocks the card carries, filling as the number counts. The on-screen bar
              *is* the card's bar — which makes the card a receipt for something just watched
              rather than a separate artefact generated afterwards. */}
          {daily.percentile !== null && (
            <ShareBar percentile={daily.percentile} shown={beats.at(SCORE_BEAT)} />
          )}
        </div>
      </Beat>

      {daily.streak && (
        <Beat on={STREAK_BEAT} beats={beats} className="mt-7">
          <StreakBump streak={daily.streak} />
        </Beat>
      )}

      <Beat on={CARD_BEAT} beats={beats} className="mt-7">
        <div className="flex flex-wrap items-start gap-4">
          {daily.card && (
            <pre className="border-line bg-surface-1 text-ink min-w-0 flex-1 rounded-lg border p-4 font-mono text-base leading-relaxed whitespace-pre select-all">
              {daily.card}
            </pre>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" onClick={() => void copy()} glow="brand">
              <Icon name="copy" size={15} />
              Copy card
            </Button>
            {canShare && (
              <Button variant="secondary" size="lg" onClick={() => void share()}>
                <Icon name="share" size={15} />
                Share
              </Button>
            )}
            <Button variant="secondary" size="lg" as="a" href="/tapes">
              Keep playing
            </Button>
          </div>
        </div>

        <p className="text-ink-dim mt-4 max-w-prose text-sm leading-relaxed">
          The card carries no R-multiple, no direction and no ticker, so posting it cannot spoil the
          setup for anyone who has not played today. Everyone gets the same five charts.
        </p>
      </Beat>
    </Panel>
  );
}

/**
 * One chart's outcome.
 *
 * A pass is marked rather than scored-down: it is a decision with its own colour, and a day of
 * five passes should look like five deliberate choices, not five blanks.
 */
function RoundTile({ result, ordinal }: { result: DailyResult; ordinal: number }) {
  const pct = result.percentile === null ? null : Math.round(result.percentile * 100);
  const tone = result.passed ? 'restraint' : pct === null ? 'neutral' : pct >= 75 ? 'long' : pct >= 40 ? 'info' : 'short';

  return (
    <div
      className="relative"
      title={`Chart ${ordinal}: ${result.passed ? 'passed' : 'traded'}${pct === null ? '' : ` · ${pct}th percentile`}`}
    >
      <ProgressArc
        value={result.percentile ?? 0}
        size={72}
        thickness={5}
        tone={tone}
        label={`Chart ${ordinal}, ${result.passed ? 'passed' : 'traded'}${pct === null ? '' : `, ${pct}th percentile`}`}
      >
        <span className={cx('numeral text-base font-semibold', pct === null ? 'text-ink-faint' : 'text-ink-hi')}>
          {pct ?? '—'}
        </span>
      </ProgressArc>
      {result.passed && (
        <span
          className="bg-restraint absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-surface-2"
          aria-hidden
        />
      )}
    </div>
  );
}

/** The ten blocks, filling one at a time. */
function ShareBar({ percentile, shown }: { percentile: number; shown: boolean }) {
  const target = percentileBar(percentile);
  const filled = target.split('').filter((c) => c === '█').length;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!shown) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= filled) clearInterval(id);
    }, 70);
    return () => clearInterval(id);
  }, [shown, filled]);

  return (
    <div className="numeral text-2xl leading-none tracking-[0.08em]" aria-hidden>
      {target.split('').map((glyph, i) => (
        <span key={i} className={i < count ? 'text-info' : 'text-fill-3'}>
          {glyph === '█' ? '█' : '░'}
        </span>
      ))}
    </div>
  );
}

/**
 * What the day did to the streak.
 *
 * The number counting from yesterday's total to today's is the entire point — a streak that simply
 * appears at its new value communicates a fact; one that moves communicates that *you moved it*.
 */
function StreakBump({ streak }: { streak: NonNullable<DailyPayload['streak']> }) {
  const counted = useCountUp(streak.after, { ms: 520, decimals: 0, deps: [streak.after] });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <Eyebrow tone={streak.perfect ? 'gold' : undefined}>
          {streak.perfect ? 'Perfect streak' : 'Streak'}
        </Eyebrow>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span
            className={cx(
              'numeral text-3xl font-semibold',
              streak.perfect ? 'text-gold-ink' : 'text-ink-max',
            )}
          >
            {counted}
          </span>
          <span className="text-ink-dim text-sm">
            {streak.after === 1 ? 'day' : 'days'}
            {streak.longest > streak.after ? ` · best ${streak.longest}` : ''}
          </span>
        </div>
      </div>

      {streak.after > streak.before && (
        <span className="bg-long-bg text-long-ink ring-long-line animate-pop rounded-full px-2.5 py-1 text-xs font-medium ring-1">
          +1 today
        </span>
      )}

      <span className="text-ink-dim flex items-center gap-1.5 text-xs">
        <Icon name="freeze" size={14} className={streak.freezesRemaining > 0 ? 'text-info' : 'text-ink-faint'} />
        {streak.freezesRemaining} {streak.freezesRemaining === 1 ? 'freeze' : 'freezes'} left
      </span>
    </div>
  );
}
