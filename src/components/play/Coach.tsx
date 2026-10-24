'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { cx } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

/**
 * First-run coaching: three steps on the first chart, and one note on the first result.
 *
 * The loop has four words — Read, Call, Reveal, Review — and a new player meets the first three
 * with nothing to explain them but a chart. So the first chart carries a strip under it that says
 * the one thing each step needs: what you are looking at, what the choice is, and what locking in
 * does. The reveal explains itself. The review gets one note, because "Score 64" means nothing
 * until someone says what it was out of.
 *
 * The strip sits in the flow between the chart and the dock rather than floating over the chart:
 * the stage forbids anything that would put the chart's lines under another stacking context, and
 * an overlay on a phone would cover the very thing it is pointing at. Every step can be skipped,
 * and skipping once skips them all.
 *
 * Progress lives in localStorage, per device. A returning player on a new phone sees the tips once
 * and can wave them away; that is cheaper than a server round trip on every chart.
 */

const KEY = 'hs-coach';

interface CoachState {
  /** The "Read" step has been acknowledged. */
  intro: boolean;
  /** Coaching is over. */
  done: boolean;
  /** The round whose review finished it, so that review keeps its note until the player moves on. */
  finishedOn: string | null;
}

const DONE: CoachState = { intro: true, done: true, finishedOn: null };
const FRESH: CoachState = { intro: false, done: false, finishedOn: null };

let cachedRaw: string | null | undefined;
let cached: CoachState = DONE;
const listeners = new Set<() => void>();

function read(): CoachState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: no coaching rather than coaching on every chart forever.
    return DONE;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? { ...FRESH, ...(JSON.parse(raw) as Partial<CoachState>) } : FRESH;
  } catch {
    cached = FRESH;
  }
  return cached;
}

function write(next: CoachState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Nothing to do; the in-memory snapshot below still moves on for this visit.
  }
  cachedRaw = JSON.stringify(next);
  cached = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type CoachStep = 'read' | 'call' | 'lock' | 'score' | null;

/**
 * Which tip, if any, belongs on screen. Derived from the phase rather than stored, so a reload
 * mid-chart picks up in the right place and nothing has to be kept in step with the round.
 */
export function useCoach({
  phase,
  direction,
  roundId,
  enabled = true,
}: {
  phase: string;
  direction: 'long' | 'short' | null;
  roundId: string | null;
  enabled?: boolean;
}) {
  // The server snapshot is "done": the first paint never shows a tip, so nothing can mismatch.
  const state = useSyncExternalStore(subscribe, read, () => DONE);

  let step: CoachStep = null;
  if (!enabled) step = null;
  else if (phase === 'done' && roundId && (!state.done || state.finishedOn === roundId)) step = 'score';
  else if (!state.done && phase === 'placing') step = !state.intro ? 'read' : direction ? 'lock' : 'call';

  const next = useCallback(() => write({ ...read(), intro: true }), []);
  const skip = useCallback(() => write(DONE), []);
  /** The first review has been reached: coaching is over, but this review keeps its note. */
  const finish = useCallback((id: string) => {
    const current = read();
    if (!current.done) write({ intro: true, done: true, finishedOn: id });
  }, []);

  return { step, next, skip, finish };
}

const STEPS = [
  { id: 'read', label: 'Read' },
  { id: 'call', label: 'Call' },
  { id: 'lock', label: 'Lock in' },
] as const;

/** The strip under the chart for the first three steps. */
export function CoachStrip({
  step,
  revealHours,
  onNext,
  onSkip,
}: {
  step: 'read' | 'call' | 'lock';
  revealHours: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const index = STEPS.findIndex((s) => s.id === step);
  const copy =
    step === 'read'
      ? {
          title: 'Read the chart',
          body: `Real market history with the name and date hidden. The hatched area on the right is the next ${revealHours} hours — it stays hidden until you lock in.`,
        }
      : step === 'call'
        ? {
            title: 'Make your call',
            body: 'Long if you think price rises from here, short if it falls. You are not calling where it ends — only which of your two lines it reaches first.',
          }
        : {
            title: 'Set your lines, then lock in',
            body: 'The stop is where you are wrong; the target is where you take profit. Drag either line on the chart or use the steppers — then lock in, and the hidden hours play out.',
          };

  return (
    // On a phone: steps and actions share the first row and the words take the second, so the dock
    // below stays in reach. From sm: one row, words in the middle.
    <div
      role="status"
      className="border-info-line bg-info-bg animate-rise grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-2.5 sm:grid-cols-[auto_1fr_auto] sm:py-3"
    >
      <ol className="order-1 flex items-center gap-1.5" aria-label={`Step ${index + 1} of 3`}>
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={cx(
              'flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold',
              i === index ? 'bg-info text-ink-inv' : i < index ? 'text-info-ink' : 'text-ink-dim',
            )}
          >
            {i < index ? <Icon name="check" size={12} stroke={2.4} /> : <span className="numeral">{i + 1}</span>}
            <span className={i === index ? '' : 'sr-only sm:not-sr-only'}>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="order-3 col-span-2 min-w-0 sm:order-2 sm:col-span-1">
        <div className="text-ink-max text-sm font-semibold">{copy.title}</div>
        <p className="text-ink-lo text-[0.8125rem] leading-relaxed sm:text-sm">{copy.body}</p>
      </div>
      <div className="order-2 flex items-center justify-end gap-1 sm:order-3">
        <button type="button" onClick={onSkip} className="text-ink-dim hover:text-ink-hi h-9 rounded-full px-2.5 text-sm font-medium transition-colors">
          Skip tips
        </button>
        {step === 'read' && (
          <button
            type="button"
            onClick={onNext}
            className="press bg-info text-ink-inv h-9 rounded-full px-4 text-sm font-semibold"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

/** The one note on the first review: what the score was out of. */
export function CoachScoreNote({
  percentile,
  passed,
  onDismiss,
}: {
  percentile: number | null;
  passed: boolean;
  onDismiss: () => void;
}) {
  const n = percentile === null ? null : Math.round(percentile * 100);
  return (
    <div role="status" className="border-info-line bg-info-bg animate-rise rounded-2xl border px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-ink-max text-sm font-semibold">What your score means</div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-ink-dim hover:text-ink-hi -mt-1 -mr-1 grid h-8 w-8 place-items-center rounded-full">
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="text-ink-lo mt-1 text-sm leading-relaxed">
        {n === null
          ? 'Every chart is scored against all 98 trades that were possible on it — both sides, seven stops, seven targets.'
          : `${passed ? 'Sitting out' : 'Your trade'} beat ${n} of every 100 trades that were possible on this chart — both sides, seven stops, seven targets.`}{' '}
        Par is the typical one. The best in hindsight is drawn in gold; nobody gets it on purpose.
      </p>
    </div>
  );
}
