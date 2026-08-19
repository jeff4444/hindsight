import { listTapes } from '@/lib/viewer';
import { Eyebrow } from '@/components/ui';
import { VersusLauncher } from '@/components/versus/VersusLauncher';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Versus' };

/**
 * §10.1's Duel and Racer.
 *
 * Both are the same primitive — a fixed ordered chart sequence several people play independently —
 * and both are honest about the thing this product does not have, which is other people. A duel is a
 * link you send and an opponent answers whenever they like; a race is a sequence anyone can run,
 * with everyone who ran it before you on the board.
 */
export default async function VersusPage() {
  const tapes = (await listTapes())
    .filter((t) => !t.lockedReason)
    .map((t) => ({ slug: t.slug, name: t.name, charts: t.charts }));

  return (
    <div className="mx-auto max-w-5xl">
      <Eyebrow>Two players, the same charts</Eyebrow>
      <h1 className="text-ink-max mt-1 text-2xl font-semibold">Versus</h1>
      <p className="text-ink-lo mt-3 max-w-prose text-base leading-relaxed">
        Nobody has to be online at the same time. A duel is a link: your opponent plays the same
        charts whenever they arrive, and each one resolves as the second of you finishes it. Damage is
        the difference between two readings, so a chart you both handle equally well does nothing at
        all — which, measured between two players who mostly agree, is most of them.
      </p>

      <VersusLauncher tapes={tapes} />
    </div>
  );
}
