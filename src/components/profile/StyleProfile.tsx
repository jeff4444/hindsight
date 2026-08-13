import { STYLE_SPEC, describe as describeStyle, fingerprint, type StyleRound } from '@/core/style';
import { ENGINES, type EngineCode } from '@/core/engines';
import { Eyebrow, Meter, Panel, cx } from '@/components/ui';

/**
 * §5.12, accumulated.
 *
 * *"You describe yourself as a breakout trader, but 68% of your entries match the Reversion engine,
 * and that is the engine you underperform against."* Nobody else can say this, because nobody else
 * has eight schools reading the chart you just traded.
 *
 * ## The waiting state is the real state, so it is the one designed first
 *
 * An affinity needs **30 charts on which that engine traded**, and the engines are silent on most
 * charts — Channel takes a position on 19.8%, so it qualifies at 152 rounds; Reversion fires on
 * 2.2% and needs 1,364; Geometry has never fired on this corpus and never will qualify. For almost
 * every reader, almost always, this panel has nothing it is allowed to conclude.
 *
 * The page's own rule is that "no number is shown until the sample supports it" should read as *a
 * meter you can fill rather than a citation and a refusal*, so the progress toward the floor is the
 * headline and the sentence appears underneath it when it is earned. Counts are shown throughout —
 * they are facts about what happened, not estimates — while the share is withheld until it means
 * something, because a percentage is exactly the thing that looks authoritative on four trades.
 *
 * ## What it does not say
 *
 * It never grades the resemblance. §14.7 could not tell any engine on this roster apart from a coin
 * flip on the charts it chose, so "you trade like Channel" is a description and not a verdict. The
 * one comparison offered is the one §5.12 asks for — you against that engine **on the same
 * charts** — and it is stated as a gap in R with a direction, never as a pass or a fail.
 */

/** Display names, so the panel reads in the roster's language rather than in enum codes. */
const NAMES = new Map<EngineCode, string>(ENGINES.map((engine) => [engine.code, engine.name]));

export function StyleProfile({ rounds }: { rounds: StyleRound[] }) {
  const affinities = fingerprint(
    rounds,
    ENGINES.map((engine) => engine.code),
  ).filter((affinity) => affinity.charts > 0);

  const sentence = describeStyle(affinities, (engine) => NAMES.get(engine) ?? engine);
  // Closest to qualifying, which is what the meter tracks. Ordered by charts rather than by share:
  // a 100% share over two charts is not "nearly there", it is two charts.
  const leader = [...affinities].sort((a, b) => b.charts - a.charts)[0];

  return (
    <Panel pad="md" className="mt-3">
      <Eyebrow>Which school you trade as</Eyebrow>

      {rounds.length === 0 ? (
        <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
          No school has traded a chart you also traded yet. They pass on{' '}
          <strong className="text-ink">67%</strong> of charts between them, so this takes a while to
          fill — and a round where every school stood aside tells you something on its own.
        </p>
      ) : (
        <>
          <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
            {sentence ??
              'Not enough charts yet where a school traded and so did you. Counts below are real; the share is held back until it would mean something.'}
          </p>

          {leader && !leader.reportable && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-lo text-sm">
                <span className="numeral text-ink font-semibold">
                  {STYLE_SPEC.minCharts - leader.charts}
                </span>{' '}
                more {NAMES.get(leader.engine) ?? leader.engine} charts until yours can be compared
                to it.
              </p>
              <Meter
                value={leader.charts}
                max={STYLE_SPEC.minCharts}
                tone="info"
                size="lg"
                className="w-40"
                label={`${leader.charts} of ${STYLE_SPEC.minCharts} charts`}
              />
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {[...affinities]
              .sort((a, b) => b.charts - a.charts)
              .map((affinity) => {
                const gap = affinity.playerMeanR - affinity.engineMeanR;
                return (
                  <li
                    key={affinity.engine}
                    className="border-line-faint flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="text-ink min-w-32 text-sm font-medium">
                      {NAMES.get(affinity.engine) ?? affinity.engine}
                    </span>
                    <span className="text-ink-lo numeral text-xs">
                      {affinity.matched}/{affinity.charts} charts
                    </span>
                    {/* The share is the number that looks authoritative, so it is the one withheld. */}
                    <span
                      className={cx(
                        'numeral text-xs',
                        affinity.reportable ? 'text-ink' : 'text-ink-faint',
                      )}
                    >
                      {affinity.reportable
                        ? `${(affinity.share * 100).toFixed(0)}% like yours`
                        : 'too few to rate'}
                    </span>
                    {affinity.reportable && (
                      <span className="text-ink-lo numeral text-xs">
                        you {gap >= 0 ? '+' : ''}
                        {gap.toFixed(2)}R against it
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </>
      )}

      <p className="text-ink-faint mt-3 max-w-prose text-xs leading-relaxed">
        Resembling a school is a description, not a grade — §14.7 could not tell any of them apart
        from a coin flip on the charts they chose. Engine Zero is excluded here: it trades every
        chart with a fixed bracket, so matching it would mean you place 2 ATR stops, not that you
        trade at random.
      </p>
    </Panel>
  );
}
