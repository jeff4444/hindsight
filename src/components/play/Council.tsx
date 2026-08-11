'use client';

import { COUNCIL_COVERAGE, EDGE, disagreement, type Verdict } from '@/core/engines';
import { cx } from '../ui';

/**
 * The council, on the reveal.
 *
 * §5.5: *"The player-facing output is a spread of opinion, never a consensus verdict."* So there is
 * no majority here, no aggregate score, and no arrow. Every engine gets a row, including every
 * engine that passed — and on **56.5%** of charts that is all of them.
 *
 * Three things this panel is built to make impossible to miss, each because the alternative would be
 * a quiet lie:
 *
 * **A pass is a verdict.** It reads as a decision with a reason attached, not as an error or a
 * missing row. §4.4 already scores restraint as a move the *player* can make; an engine passing is
 * the same move, and "no school here had a trade" is the most useful sentence a trading product can
 * say.
 *
 * **Whose number is whose.** Six of the eight engines ship no native price target — the Turtles
 * trail out, Connors exits on a moving-average cross, VSA exits on an opposing signal — so most
 * take-profits shown here are ours. Only Pattern's measuring rule and Geometry's AD retracement are
 * the school's. Every bracket carries the provenance of each side.
 *
 * **Nothing here beat a coin flip.** Every engine's mean R sits inside Engine Zero's band at its own
 * sample size, and the conviction line says so in words rather than leaving a percentage to imply
 * otherwise. A leaderboard without its null is a ranking of noise with the noise cropped out.
 */

const TONE = {
  long: 'text-long-ink',
  short: 'text-short-ink',
  pass: 'text-ink-dim',
} as const;

function Row({ verdict, entry }: { verdict: Verdict; entry: number }) {
  const passed = verdict.direction === null;
  const tone = verdict.direction === null ? TONE.pass : TONE[verdict.direction];

  return (
    <li className="border-line-faint border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ink-max font-medium">{verdict.name}</span>
        <span className={cx('font-mono text-xs uppercase', tone)}>
          {passed ? 'no setup' : verdict.direction}
        </span>
        {verdict.bracket && (
          <span className="text-ink-lo font-mono text-xs">
            stop {verdict.bracket.stop.toFixed(2)} · target {verdict.bracket.target.toFixed(2)}
            {' · '}
            {(Math.abs(verdict.bracket.target - entry) / Math.abs(entry - verdict.bracket.stop)).toFixed(2)}R
          </span>
        )}
      </div>

      <ul className="text-ink-lo mt-1.5 space-y-0.5 text-xs leading-relaxed">
        {verdict.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      {verdict.bracket && (
        <p className="text-ink-faint mt-1.5 font-mono text-[11px]">
          stop: {verdict.provenance.stop === 'school' ? 'the school’s' : 'ours'} · target:{' '}
          {verdict.provenance.target === 'school' ? 'the school’s' : 'ours'}
          {verdict.exit ? ` · natively it would ${verdict.exit.description}` : ''}
        </p>
      )}

      {verdict.conviction && (
        <p className="text-ink-faint mt-1 text-[11px]">{verdict.conviction.source}</p>
      )}
    </li>
  );
}

export function Council({ verdicts, entry }: { verdicts: Verdict[]; entry: number }) {
  if (verdicts.length === 0) return null;

  const schools = verdicts.filter((verdict) => verdict.engine !== 'ZERO');
  const spoke = schools.filter((verdict) => verdict.direction !== null);
  const split = disagreement(schools);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink-max text-lg font-semibold">The council</h2>
        {split && (
          <span className="text-attention-ink font-mono text-[11px]">
            they disagree — which happens on {(COUNCIL_COVERAGE.disagreed * 100).toFixed(1)}% of charts
          </span>
        )}
      </div>

      <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
        {spoke.length === 0 ? (
          <>
            <strong className="text-ink">No school on this roster had a trade here</strong> — which is
            true of {(COUNCIL_COVERAGE.silent * 100).toFixed(0)}% of charts. Passing was available to
            you too, and it is scored.
          </>
        ) : (
          <>
            Each school reads the same chart under its own published rules. This is a spread of
            opinion, not a verdict — and on {(COUNCIL_COVERAGE.silent * 100).toFixed(0)}% of charts
            every one of them passes.
          </>
        )}
      </p>

      <ul className="mt-4">
        {verdicts.map((verdict) => (
          <li key={verdict.engine} className="list-none">
            <ul className="list-none">
              <Row verdict={verdict} entry={entry} />
            </ul>
          </li>
        ))}
      </ul>

      {/*
        The null, stated rather than implied — and now the corrected version of it (§14.7).

        Each engine's mean R sits inside Engine Zero's band at its own sample size, and the full
        measurement says why: paired chart by chart against a coin flip on the *same* charts, no
        engine on this roster can be told apart from one (SPA p = 0.46). What beats Engine Zero is
        not trading, which every school here does most of the time — and which Geometry, firing on
        no chart at all, does perfectly. Without this line a 63% win rate reads as skill.

        The trial count is 9 against 8 rows on purpose: Sweep was specified twice, and §14.9 counts
        the attempt we discarded. Saying "all 8" here would be the quiet undercount the whole
        manifest exists to prevent.
      */}
      <p className="text-ink-faint mt-4 max-w-prose text-xs leading-relaxed">
        Every conviction figure above is measured over {EDGE.charts.toLocaleString()} charts, and
        every one of them sits <strong className="text-ink-dim">inside a coin flip’s range</strong>{' '}
        at that engine’s own sample size. Corrected for all {EDGE.trials} specifications we have
        tried on this corpus — one more than there are rows, because a threshold we replaced still
        counts — and paired chart by chart against a coin flip on the same charts, no school here
        picks better than chance.{' '}
        <strong className="text-ink-dim">The only thing on this roster that beats a coin flip is not
        trading.</strong>{' '}
        Which is why the rows above are not ranked, and why passing is scored.
      </p>
    </section>
  );
}
