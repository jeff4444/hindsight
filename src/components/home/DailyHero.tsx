import { Button, cx, scoreTone, toneInk } from '../ui';
import { ChartArt } from '../ui/ChartArt';
import { Countdown } from '../ui/client';
import { Icon } from '../ui/icons';
import type { DailyState } from '@/lib/viewer';
import { nextResetAt } from '@/lib/daily';
import { chartSquare } from '@/lib/share';
import { routes } from '@/lib/routes';

/**
 * Today's daily, as the first thing on Today.
 *
 * Three states and one call to action each: start it, finish it, or — once it is done — see how it
 * went and when the next one opens. The gold button exists only while there is something to play;
 * a finished daily quiets down rather than shouting about a card the player has already seen.
 */
export function DailyHero({ daily }: { daily: DailyState }) {
  const done = daily.complete;
  const started = daily.played > 0 && !done;

  return (
    <section
      aria-labelledby="daily-heading"
      className={cx(
        'relative overflow-hidden rounded-3xl border p-6 md:p-8',
        done ? 'border-line bg-surface-2' : 'border-gold-line bg-surface-2',
      )}
    >
      {!done && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-60">
          <ChartArt seed={daily.day} width={640} height={96} fog={0.3} />
        </div>
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow text-gold-ink">Daily #{daily.day}</div>
          <div className="numeral text-ink-dim text-xs">
            {done ? 'done' : `${daily.played}/${daily.total} · ≈ 6 min`}
          </div>
        </div>

        {done ? (
          <>
            <h2 id="daily-heading" className="font-display text-ink-max mt-3 text-4xl md:text-5xl">
              Today is in.
            </h2>
            <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <div
                  className={cx(
                    'numeral text-display-sm font-semibold md:text-display',
                    daily.percentile === null ? 'text-ink-max' : toneInk(scoreTone(daily.percentile * 100)),
                  )}
                >
                  {daily.percentile === null ? '—' : Math.round(daily.percentile * 100)}
                </div>
                <div className="text-ink-dim mt-1 text-sm">your score · traded {daily.traded} of {daily.total}</div>
              </div>
              <div className="pb-2 text-2xl tracking-[0.15em]" aria-label="Your five charts">
                {daily.charts.map((chart, i) => (
                  <span key={i}>{chartSquare(chart)}</span>
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button href={routes.play.daily} variant="secondary" size="lg">
                See your card
              </Button>
              <Button href={routes.ranks('daily')} variant="ghost" size="lg">
                Today&rsquo;s field
                <Icon name="chevron-right" size={15} />
              </Button>
              <span className="text-ink-dim text-sm">
                Next daily in <Countdown to={nextResetAt()} className="text-ink-lo" />
              </span>
            </div>
          </>
        ) : (
          <>
            <h2 id="daily-heading" className="font-display text-ink-max mt-3 max-w-[16ch] text-4xl leading-[1.05] md:text-5xl">
              {started ? 'Pick up where you left off.' : 'Five charts. Same for everyone.'}
            </h2>
            <p className="text-ink-lo mt-3 max-w-md text-base">
              {started
                ? `${daily.total - daily.played} to go. Each one stays open for 48 hours.`
                : 'Real markets, names and dates hidden. Call each one, watch it play out, and see how you rank against the whole field.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 pb-24">
              <Button href={routes.play.daily} variant="primary" size="xl">
                <Icon name="play" size={16} />
                {started ? 'Continue' : "Play today's daily"}
              </Button>
              {started && (
                <div className="flex gap-1" aria-label={`${daily.played} of ${daily.total} played`}>
                  {Array.from({ length: daily.total }, (_, i) => (
                    <span key={i} className={cx('h-1.5 w-6 rounded-full', i < daily.played ? 'bg-gold' : 'bg-fill-3')} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
