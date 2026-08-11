import { listTapes } from '@/lib/viewer';
import { TapeCard } from '@/components/home/TapeCard';
import { Eyebrow } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Tapes — §11's maps, named for what they are.
 *
 * §11.1: "Every official map is defined by a published filter over the regime tags and theme tags,
 * not by hand-picking, so the map's difficulty distribution is reproducible and its statistics are
 * valid." Every tape below is a filter you can read, and the counts are queried rather than
 * claimed.
 *
 * §10.4's boxed rule — "never meter the daily, and never meter practice" — is why nothing here is
 * gated, capped or counted against a quota.
 */
export default async function TapesPage() {
  const tapes = await listTapes();
  const open = tapes.filter((t) => !t.lockedReason);
  const locked = tapes.filter((t) => t.lockedReason);

  return (
    <div className="mx-auto max-w-5xl">
      <Eyebrow>Practice, unlimited and unmetered</Eyebrow>
      <h1 className="text-ink-max mt-1 text-2xl font-semibold">Tapes</h1>
      <p className="text-ink-lo mt-3 max-w-prose text-base leading-relaxed">
        A tape is a slice of the corpus defined by a published rule over the regime tags and the
        theme tags — never hand-picked, because curating for &ldquo;interesting&rdquo; charts
        changes the difficulty distribution and invalidates every statistic computed on it.
      </p>
      <p className="text-ink-lo mt-3 max-w-prose text-base leading-relaxed">
        Both rules are written out in the{' '}
        <a className="text-ink underline underline-offset-2" href="/rules">
          ruleset
        </a>
        , thresholds and all. There is no canonical definition of a liquidity sweep or a failed
        break — the two most-used open implementations disagree by up to thirteenfold on the same
        words — so the choice is not between the right definition and ours. It is between an
        undisclosed one and a published one.
      </p>

      <section className="mt-10">
        <h2 className="text-ink-max text-xl font-semibold">Open now</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-stagger>
          {open.map((tape, i) => (
            <TapeCard key={tape.slug} tape={tape} index={i} />
          ))}
        </div>
      </section>

      {locked.length > 0 && (
        <section className="mt-12">
          <h2 className="text-ink-max text-xl font-semibold">Not open yet</h2>
          <p className="text-ink-lo mt-3 max-w-prose text-sm leading-relaxed">
            A tape&rsquo;s filter has to be computable from the lead-in alone. Anything derived from
            the reveal path would announce the answer in the tape&rsquo;s own name — which is why
            the one below is locked rather than shipped.
          </p>
          {/* The open grid above staggers its cards in and this one did not, so the locked tapes
              snapped into place while the ones above them were still arriving. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-stagger>
            {locked.map((tape, index) => (
              <TapeCard key={tape.slug} tape={tape} index={index} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
