import { Button, Eyebrow, Meter, Panel } from '../ui';
import { Icon } from '../ui/icons';
import { Countdown } from '../ui/client';
import type { DailyState } from '@/lib/viewer';
import { nextResetAt } from '@/lib/daily';

/**
 * The one obvious next action.
 *
 * §10.1 calls the daily "the front door and the entire organic growth strategy", so it gets the
 * largest, warmest surface on the page and a single primary button.
 *
 * The day number is set as a ghost numeral behind the content rather than as a label above it.
 * It is the one piece of text here that is pure identity — it says *which* puzzle this is, which
 * matters enormously for a shared daily and not at all for deciding whether to press the button —
 * so it belongs at the size of a decoration and the weight of a whisper.
 *
 * Progress is a five-segment meter rather than a continuous bar, matching the five tiles the
 * completion ceremony ends on. A bar says "40% done"; five segments say "two of the five charts",
 * which is the unit the session is actually made of.
 */
export function DailyCard({ daily }: { daily: DailyState }) {
  const done = daily.complete;
  const started = daily.played > 0;

  return (
    <Panel
      tone="hero"
      glow={done ? undefined : 'brand'}
      pad="none"
      className="relative flex min-h-64 flex-col justify-between overflow-hidden p-6 md:p-7"
    >
      {/* The puzzle number, as a watermark. `select-none` because it is decoration and nobody
          should be able to drag-select it out of the middle of the card. */}
      <span
        aria-hidden
        className="numeral text-ink-faint/25 pointer-events-none absolute -right-2 -top-6 select-none text-display-xl font-semibold"
      >
        {daily.day}
      </span>

      <div className="relative">
        <Eyebrow>Daily #{daily.day}</Eyebrow>
        <h2 className="text-ink-max mt-1.5 max-w-[18ch] text-2xl font-semibold text-balance">
          {done
            ? 'Today is done'
            : started
              ? 'Pick up where you left off'
              : 'Five charts. Same for everyone.'}
        </h2>

        {done && daily.percentile !== null && (
          <div className="mt-4 flex items-baseline gap-2">
            <span className="numeral text-ink-max text-display-sm font-semibold">
              {Math.round(daily.percentile * 100)}
            </span>
            <span className="text-ink-dim text-sm">of 100 · mean across the five</span>
          </div>
        )}
      </div>

      <div className="relative mt-6">
        <div className="text-ink-dim mb-2 flex items-center justify-between text-sm">
          <span className="numeral">
            {daily.played} of {daily.total}
          </span>
          <span className="numeral">traded {daily.traded}</span>
        </div>
        <Meter
          value={daily.played}
          max={daily.total}
          tone={done ? 'long' : 'info'}
          size="lg"
          label={`${daily.played} of ${daily.total} charts played`}
        />

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button as="a" href="/play" variant="primary" size="lg" glow={done ? undefined : 'brand'}>
            <Icon name="play" size={15} />
            {done ? 'See your card' : started ? 'Continue' : "Play today's daily"}
          </Button>
          <span className="text-ink-dim text-sm">
            {done ? (
              <>
                Next in <Countdown to={nextResetAt()} className="text-ink-lo" />
              </>
            ) : (
              'One attempt. Open for 48 hours.'
            )}
          </span>
        </div>
      </div>
    </Panel>
  );
}
