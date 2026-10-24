import { STYLE_SPEC, describe as describeStyle, fingerprint, type StyleRound } from '@/core/style';
import { ENGINES } from '@/core/engines';
import { personaFor } from '@/lib/panel';
import { Meter, PersonaAvatar, cx } from '@/components/ui';

/**
 * Your style, and your record against the Panel.
 *
 * Two readings of one table. The style is which school's trades yours resemble, said once a school
 * has enough shared charts to say it. The rivals are the same schools as opponents: on the charts
 * you both traded, who came out ahead, by how much. Beating a named school over a real sample is a
 * genuine goal — and the line at the bottom keeps it honest: none of them has beaten a coin flip on
 * the charts it chose, so resembling one is a description, not a grade.
 */
export function StyleProfile({ rounds }: { rounds: StyleRound[] }) {
  const affinities = fingerprint(
    rounds,
    ENGINES.map((engine) => engine.code),
  ).filter((affinity) => affinity.charts > 0);

  const nameOf = (engine: string) => personaFor(engine)?.name ?? engine;
  const sentence = describeStyle(affinities, nameOf);
  const rivals = [...affinities].sort((a, b) => b.charts - a.charts);
  const leader = rivals[0];

  return (
    <section aria-labelledby="style-heading" className="border-line bg-surface-2 rounded-3xl border p-5 md:p-6">
      <h2 id="style-heading" className="eyebrow text-ink-dim">
        Your style and your rivals
      </h2>

      {rounds.length === 0 ? (
        <p className="text-ink-lo mt-3 max-w-prose text-sm leading-relaxed">
          The Panel sits out most charts, so this fills slowly. Each time one of them trades a chart you traded too,
          you get a head-to-head result here.
        </p>
      ) : (
        <>
          <p className="font-display text-ink-max mt-3 text-2xl leading-snug">
            {sentence ?? 'Too early to say whose style you trade in.'}
          </p>

          {leader && !leader.reportable && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Meter value={leader.charts} max={STYLE_SPEC.minCharts} tone="gold" size="md" className="w-40" label={`${leader.charts} of ${STYLE_SPEC.minCharts} charts`} />
              <p className="text-ink-lo text-sm">
                <span className="numeral text-ink-hi font-semibold">{STYLE_SPEC.minCharts - leader.charts}</span> more shared charts with{' '}
                {nameOf(leader.engine)} to compare styles.
              </p>
            </div>
          )}

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {rivals.map((affinity) => {
              const persona = personaFor(affinity.engine);
              const gap = affinity.playerMeanR - affinity.engineMeanR;
              const settled = affinity.charts >= STYLE_SPEC.minCharts;
              return (
                <li key={affinity.engine} className="bg-surface-1 ring-line-faint flex items-center gap-3 rounded-2xl p-3 ring-1">
                  {persona && <PersonaAvatar persona={persona} size={36} />}
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-max truncate text-sm font-semibold">{nameOf(affinity.engine)}</div>
                    <div className="text-ink-dim text-xs">
                      {affinity.charts} shared chart{affinity.charts === 1 ? '' : 's'}
                      {affinity.reportable ? ` · ${(affinity.share * 100).toFixed(0)}% like yours` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    {settled ? (
                      <>
                        <div className={cx('numeral text-sm font-semibold', gap > 0 ? 'text-gain-ink' : gap < 0 ? 'text-loss-ink' : 'text-ink-hi')}>
                          {gap >= 0 ? '+' : ''}
                          {gap.toFixed(2)}R
                        </div>
                        <div className="text-ink-dim text-mini">{gap > 0 ? 'you lead' : gap < 0 ? 'you trail' : 'level'}</div>
                      </>
                    ) : (
                      <div className="text-ink-dim text-xs">{STYLE_SPEC.minCharts - affinity.charts} to go</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-ink-dim mt-4 max-w-prose text-xs leading-relaxed">
        Resembling a school is a description, not a grade — none of them has beaten a coin flip on the charts it chose.
      </p>
    </section>
  );
}
