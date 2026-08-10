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
      <h1 className="text-ink-max mt-1 text-xl font-semibold">Tapes</h1>
      <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
        A tape is a slice of the corpus defined by a published rule over the regime tags — never
        hand-picked, because curating for &ldquo;interesting&rdquo; charts changes the difficulty
        distribution and invalidates every statistic computed on it.
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
        {open.map((tape, i) => (
          <TapeCard key={tape.slug} tape={tape} index={i} />
        ))}
      </div>

      {locked.length > 0 && (
        <section className="mt-12">
          <Eyebrow>Not open yet</Eyebrow>
          <p className="text-ink-dim mt-2 max-w-prose text-xs leading-relaxed">
            A tape&rsquo;s filter has to be computable from the lead-in alone. Anything derived from
            the reveal path would announce the answer in the tape&rsquo;s own name — which is why
            the one below is locked rather than shipped.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locked.map((tape) => (
              <TapeCard key={tape.slug} tape={tape} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
