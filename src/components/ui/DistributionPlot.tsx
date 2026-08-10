import { cx } from './index';

/**
 * The 98 achievable outcomes as a histogram, with the player's result marked.
 *
 * Drawn rather than described, because that is what makes a percentile mean anything: 98 outcomes
 * were available on this path and the player's sits somewhere among them. §4.2 is the reason the
 * shape exists at all — the achievable set is finite, so this is a census, not a sample.
 *
 * The long tail is clipped rather than scaled to: a cell that caught an 8R target would otherwise
 * squash every other bar to nothing. Clipped cells are counted into the end bin, so no outcome
 * disappears — the axis just stops describing exactly where it landed.
 *
 * Lives in `ui/` rather than beside the debrief because the landing page shows one too.
 */

const LOW = -1.2;
const HIGH = 4;
const BINS = 26;

export function DistributionPlot({
  distribution,
  playerR,
  passed,
  progress = 1,
  className,
}: {
  distribution: number[];
  playerR: number;
  passed: boolean;
  /** 0 → 1. The marker travels from break-even to its place as this runs. */
  progress?: number;
  className?: string;
}) {
  if (distribution.length === 0) return null;

  const width = (HIGH - LOW) / BINS;
  const bins = new Array<number>(BINS).fill(0);
  for (const value of distribution) {
    const index = Math.min(BINS - 1, Math.max(0, Math.floor((value - LOW) / width)));
    bins[index] += 1;
  }
  const tallest = Math.max(...bins, 1);

  const position = (value: number) =>
    Math.min(100, Math.max(0, ((Math.min(HIGH, Math.max(LOW, value)) - LOW) / (HIGH - LOW)) * 100));

  const zeroAt = position(0);
  const restAt = position(playerR);
  // The marker starts at break-even and travels to the result, which is exactly the comparison
  // the number is making: this is where passing would have put you, and this is where you are.
  const playerAt = zeroAt + (restAt - zeroAt) * progress;

  return (
    <div className={cx('mt-4 pt-4', className)}>
      <div className="relative h-24">
        <div className="flex h-full items-end gap-px">
          {bins.map((count, i) => {
            const binLow = LOW + i * width;
            return (
              <div
                key={i}
                className={cx(
                  'flex-1 rounded-t-sm transition-[height] duration-(--dur-4) ease-(--ease-entrance)',
                  binLow >= 0 ? 'bg-long/45' : 'bg-short/45',
                )}
                style={{ height: `${(count / tallest) * 100 * progress}%` }}
              />
            );
          })}
        </div>

        {/* Break-even, so the shape of the distribution reads at a glance. */}
        <div
          className="bg-ink-faint pointer-events-none absolute inset-y-0 w-px"
          style={{ left: `${zeroAt}%` }}
        />

        {/* The player. */}
        <div
          className="bg-info pointer-events-none absolute inset-y-0 w-0.5"
          style={{ left: `${playerAt}%` }}
        >
          {/* Above the plot rather than over it: the tallest bar is usually the pile of stopped
              brackets at exactly −1R, which is precisely where a losing player's marker lands. */}
          <span
            className={cx(
              'bg-info-bg text-info-ink ring-info-line text-micro absolute -top-4 rounded px-1.5 py-0.5 font-semibold tracking-wider whitespace-nowrap ring-1',
              playerAt > 70 ? 'right-0' : 'left-0',
            )}
          >
            {passed ? 'YOU PASSED' : 'YOU'}
          </span>
        </div>
      </div>

      <div className="text-ink-faint mt-1 flex justify-between font-mono text-[0.5625rem]">
        <span>−1R</span>
        <span>0</span>
        <span>+4R and above</span>
      </div>
    </div>
  );
}
