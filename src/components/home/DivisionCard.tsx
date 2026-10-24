import { divisionProgress, roundsToPlacement } from '@/core/divisions';
import { routes } from '@/lib/routes';
import { Button, DivisionBadge, ProgressBar } from '../ui';
import { Term } from '../ui/client';

/**
 * Where you stand on the ladder, in a word.
 *
 * Three states. Signed out: ranked needs an account, said once with a way in. Placing: how many
 * rated charts until the first rating — a goal, not a locked meter reading "0/30". Placed: the
 * division, the rating, and how close the next division is.
 */
export function DivisionCard({
  rating,
  attempts,
  showable,
  signedIn,
}: {
  rating: number | null;
  attempts: number;
  showable: boolean;
  signedIn: boolean;
}) {
  const placed = showable && rating !== null;
  const progress = placed ? divisionProgress(rating) : null;
  const toGo = roundsToPlacement(attempts);

  return (
    <section aria-labelledby="ladder-heading" className="border-line bg-surface-2 flex h-full flex-col rounded-3xl border p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ladder-heading" className="eyebrow text-ink-dim">
          <Term id="division">The ladder</Term>
        </h2>
        {progress && <span className="numeral text-ink-dim text-xs">{Math.round(rating!)} rating</span>}
      </div>

      {!signedIn ? (
        <>
          <p className="font-display text-ink-max mt-3 text-2xl leading-tight">Get on the ladder.</p>
          <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">
            Ranked needs an account — a rating has to belong to someone. Everything you have played comes with you.
          </p>
          <Button href={routes.signIn(routes.play.ranked())} variant="secondary" className="mt-auto self-start" size="md">
            Sign in to rank
          </Button>
        </>
      ) : progress ? (
        <>
          <div className="mt-3">
            <DivisionBadge division={progress.division} size="lg" />
          </div>
          <ProgressBar value={progress.progress} max={1} tone="gold" size="sm" className="mt-4" label="Progress to the next division" />
          <p className="text-ink-dim mt-2 text-xs">
            {progress.next ? `Next: ${progress.next.name}` : 'The top of the ladder.'} · {progress.division.blurb}
          </p>
          <Button href={routes.play.ranked()} variant="secondary" className="mt-auto self-start" size="md">
            Play ranked
          </Button>
        </>
      ) : (
        <>
          <div className="mt-3">
            <DivisionBadge division={null} placing={toGo} size="lg" />
          </div>
          <p className="text-ink-lo mt-3 text-sm leading-relaxed">
            {toGo > 0
              ? `${toGo} more rated chart${toGo === 1 ? '' : 's'} and you get your first rating. The daily, tapes and Storm all count.`
              : 'Almost there — your rating is still settling. A few more rated charts.'}
          </p>
          <ProgressBar value={attempts} max={attempts + Math.max(toGo, 1)} tone="gold" size="sm" className="mt-3" label="Progress to placement" />
          <Button href={routes.play.ranked()} variant="secondary" className="mt-auto self-start" size="md">
            Play ranked
          </Button>
        </>
      )}
    </section>
  );
}
