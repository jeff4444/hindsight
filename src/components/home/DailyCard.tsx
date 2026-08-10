import { Button, Eyebrow } from '../ui';
import type { DailyState } from '@/lib/viewer';

/**
 * The one obvious next action.
 *
 * §10.1 calls the daily "the front door and the entire organic growth strategy", so it gets the
 * largest, warmest surface on the page and a single primary button. The progress bar exists
 * because a five-chart session needs a sense of distance — "2 of 5" is a fact, a bar is a feeling.
 */
export function DailyCard({ daily }: { daily: DailyState }) {
  const done = daily.complete;
  const started = daily.played > 0;

  return (
    <div className="border-line bg-surface-2 shadow-panel relative overflow-hidden rounded-lg border p-5">
      {/* A quiet wash so the primary action reads as the warmest thing on the page without
          resorting to a gradient banner. */}
      <div className="bg-info/[0.05] pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Daily #{daily.day}</Eyebrow>
            <h2 className="text-ink-max mt-1 text-lg font-semibold">
              {done ? 'Today is done' : started ? 'Pick up where you left off' : 'Five charts. Same for everyone.'}
            </h2>
          </div>
          {done && daily.percentile !== null && (
            <div className="text-right">
              <div className="text-ink-max font-mono text-2xl font-semibold tabular-nums">
                {Math.round(daily.percentile * 100)}
              </div>
              <div className="eyebrow text-ink-dim">of 100</div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-ink-dim text-mini flex justify-between font-mono">
            <span>
              {daily.played} of {daily.total}
            </span>
            <span>traded {daily.traded}</span>
          </div>
          <div className="bg-fill-2 mt-1.5 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-info h-full rounded-full transition-[width] duration-(--dur-6) ease-(--ease-entrance)"
              style={{ width: `${(daily.played / daily.total) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button as="a" href="/play" variant="primary" size="lg">
            {done ? 'See your card' : started ? 'Continue' : "Play today's daily"}
          </Button>
          <span className="text-ink-dim text-xs">
            {done ? 'Resets at midnight UTC.' : 'One attempt. Open for 48 hours.'}
          </span>
        </div>
      </div>
    </div>
  );
}
