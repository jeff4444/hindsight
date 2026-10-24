'use client';

import { useSyncExternalStore } from 'react';
import type { DailyPayload, DailyResult } from '@/lib/api-types';
import { useBeats } from '@/lib/useBeats';
import { useCountUp } from '@/lib/useTween';
import { Button, Eyebrow, ProgressArc, cx, scoreTone, toneInk } from '../ui';
import { Countdown, useToast } from '../ui/client';
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

  const mean = daily.percentile;
  const title =
    mean === null ? 'Daily done.' : mean >= 0.75 ? 'A sharp day.' : mean >= 0.55 ? 'A solid day.' : mean >= 0.35 ? 'A mixed day.' : 'A rough day.';
  const tomorrow = nextUtcMidnight();

  return (
    <div className="animate-rise mx-auto flex w-full max-w-xl flex-col items-center text-center">
      <div className={cx('eyebrow', daily.streak?.perfect ? 'text-gold-ink' : 'text-ink-dim')}>Daily #{daily.day}</div>
      <h2 className="font-display text-ink-max mt-3 text-[2.5rem] leading-[1.05] sm:text-5xl">{title}</h2>

      <Beat on={SCORE_BEAT} beats={beats} className="mt-6">
        <div className={cx('numeral font-semibold text-display sm:text-display-xl', mean === null ? 'text-ink-max' : toneInk(scoreTone(mean * 100)))}>
          {counted}
        </div>
        <p className="text-ink-lo mt-1 text-sm">Your score · the mean of {daily.total} charts</p>
      </Beat>

      {/* The shape of the day: five rings, one per chart. What you played, legible before a single
          number is read — the same squares the card carries. */}
      <div className="mt-8 flex flex-wrap justify-center gap-2.5">
        {daily.results.map((result, i) => (
          <Beat key={result.index} on={TILE_BEAT + i} beats={beats} animation="pop">
            <RoundTile result={result} ordinal={i + 1} />
          </Beat>
        ))}
      </div>

      {daily.streak && (
        <Beat on={STREAK_BEAT} beats={beats} className="mt-8 w-full">
          <StreakBump streak={daily.streak} />
        </Beat>
      )}

      <Beat on={CARD_BEAT} beats={beats} className="mt-8 w-full">
        {daily.card && (
          <pre className="border-line bg-surface-2 text-ink-hi mx-auto w-fit max-w-full rounded-2xl border px-6 py-4 text-left font-mono text-base leading-relaxed whitespace-pre select-all">
            {daily.card}
          </pre>
        )}
        <div className="mt-4 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          <Button variant="primary" size="lg" onClick={() => void (canShare ? share() : copy())}>
            <Icon name={canShare ? 'share' : 'copy'} size={15} />
            {canShare ? 'Share your card' : 'Copy your card'}
          </Button>
          <Button variant="secondary" size="lg" href="/play">
            Keep playing
          </Button>
        </div>
        <p className="text-ink-dim mt-4 text-xs leading-relaxed">
          The card says how you scored and nothing about the charts, so it spoils nothing. Next daily in{' '}
          <Countdown to={tomorrow} className="text-ink-lo" />.
        </p>
      </Beat>
    </div>
  );
}

/** The daily resets at midnight UTC. */
function nextUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function RoundTile({ result, ordinal }: { result: DailyResult; ordinal: number }) {
  const pct = result.percentile === null ? null : Math.round(result.percentile * 100);
  const tone = result.passed ? 'restraint' : pct === null ? 'neutral' : scoreTone(pct);

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
        <span className={cx('numeral text-base font-semibold', pct === null ? 'text-ink-dim' : 'text-ink-hi')}>
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
function StreakBump({ streak }: { streak: NonNullable<DailyPayload['streak']> }) {
  const counted = useCountUp(streak.after, { ms: 520, decimals: 0, deps: [streak.after] });

  return (
    <div className="border-line bg-surface-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border px-5 py-4">
      <div className="text-left">
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
        <Icon name="freeze" size={14} className={streak.freezesRemaining > 0 ? 'text-info' : 'text-ink-dim'} />
        {streak.freezesRemaining} {streak.freezesRemaining === 1 ? 'freeze' : 'freezes'} left
      </span>
    </div>
  );
}
