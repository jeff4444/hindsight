import { Button, Eyebrow, Gated, Panel } from '../ui';
import { Icon } from '../ui/icons';
import { RANK_MIN_ATTEMPTS } from '@/core/rating';
import { TIERS } from '@/core/tiers';

/**
 * The ladder, on the home screen.
 *
 * §4.9 governs what this may say: "No rank is assigned until a minimum number of trades has been
 * played, and the same rule applies to every statistic in the app. Do not display a number until
 * the sample supports it." So a new player sees how far off they are rather than a provisional
 * number that will move two hundred points and mean nothing.
 *
 * The rating deviation gates it as well as the attempt count — a player with plenty of rounds but a
 * long absence has a number the system does not currently believe, and showing it would be the same
 * lie in a different shape.
 */
export function RankedCard({
  rating,
  attempts,
  rd,
  showable,
  signedIn,
}: {
  rating: number | null;
  attempts: number;
  rd: number | null;
  showable: boolean;
  signedIn: boolean;
}) {
  const naked = TIERS.find((tier) => tier.code === 'NTZ')!;

  return (
    <Panel pad="md">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Eyebrow>Ranked · {naked.name}</Eyebrow>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            {showable && rating !== null ? (
              <>
                <span className="numeral text-ink-max text-display-sm font-semibold">
                  {Math.round(rating)}
                </span>
                <span className="text-ink-dim text-sm">± {Math.round(rd ?? 0)}</span>
              </>
            ) : (
              <span className="text-ink-lo text-sm">
                <Gated sample={attempts} min={RANK_MIN_ATTEMPTS} label="rated rounds">
                  {/* Reached only when the attempts gate passes but the deviation one has not. */}
                  Still calibrating
                </Gated>
              </span>
            )}
          </div>
          <p className="text-ink-lo mt-3 max-w-prose text-sm leading-relaxed">
            Five charts, at most two passes, 90 seconds each. Your rating moves against each
            chart&rsquo;s own rating — a chart is an opponent, and a hard one is worth more.
          </p>
        </div>

        <div className="shrink-0">
          {signedIn ? (
            <Button as="a" href="/play?mode=ranked" variant="primary" size="lg">
              <Icon name="play" size={15} />
              {attempts > 0 ? 'Play ranked' : 'Start placement'}
            </Button>
          ) : (
            <Button as="a" href="/sign-in" variant="secondary" size="lg">
              Sign in to rank
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
